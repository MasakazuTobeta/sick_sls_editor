"""
Fusion 360 script to export visible bodies as SVG for SICK SLS Editor.

- Projects visible BRep body outlines onto the XY plane.
- Approximates curved edges with 5-degree segments.
- Writes a single SVG file without requiring sketch selection.
"""

import math
import re
import traceback

import adsk.core
import adsk.fusion

COMMAND_ID = "SlsEditor_SvgExport"
COMMAND_NAME = "Export Bodies to SVG (SICK SLS)"
COMMAND_DESCRIPTION = "Export visible bodies as XY-projected SVG outlines"
DEFAULT_ARC_STEP_DEGREES = 5.0
UNIT_SCALE_MM = 10.0
POINT_TOLERANCE_MM = 1e-3
COLLINEAR_TOLERANCE = 1e-6

_handlers = []


def _app_and_ui():
    app = adsk.core.Application.get()
    if not app:
        return None, None
    return app, app.userInterface


def _show_error(ui: adsk.core.UserInterface | None, message: str):
    if ui:
        ui.messageBox(message, "SVG Export")


def _format_number(value: float) -> str:
    return f"{value:.4f}"


def _color_for_index(index: int) -> str:
    value = (index + 1) * 1103515245 + 12345
    r = (value >> 16) & 0xFF
    g = (value >> 8) & 0xFF
    b = value & 0xFF
    return f"#{r:02X}{g:02X}{b:02X}"


def _escape_xml_attr(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _svg_id_from_name(name: str) -> str:
    sanitized = []
    for ch in name:
        if ch.isalnum() or ch in ("_", "-"):
            sanitized.append(ch)
        else:
            sanitized.append("_")
    result = "".join(sanitized).strip("_")
    if not result:
        result = "body"
    if result[0].isdigit():
        result = f"body_{result}"
    return result


def _project_point(point: adsk.core.Point3D, unit_scale: float) -> tuple[float, float]:
    return (point.x * unit_scale, -point.y * unit_scale)


def _distance_sq(a, b) -> float:
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return dx * dx + dy * dy


def _points_close(a, b, tol_sq: float) -> bool:
    return _distance_sq(a, b) <= tol_sq


def _append_point(points, point, close_tol_sq: float):
    if not points or not _points_close(points[-1], point, close_tol_sq):
        points.append(point)


def _simplify_polyline(points, is_closed: bool, collinear_tol: float):
    if len(points) < 3:
        return points

    def is_collinear(a, b, c) -> bool:
        abx = b[0] - a[0]
        aby = b[1] - a[1]
        bcx = c[0] - b[0]
        bcy = c[1] - b[1]
        len1 = math.hypot(abx, aby)
        len2 = math.hypot(bcx, bcy)
        if len1 == 0 or len2 == 0:
            return True
        cross = abx * bcy - aby * bcx
        return abs(cross) <= collinear_tol * len1 * len2

    if not is_closed:
        result = [points[0]]
        for i in range(1, len(points) - 1):
            if is_collinear(result[-1], points[i], points[i + 1]):
                continue
            result.append(points[i])
        result.append(points[-1])
        return result

    pts = points[:]
    changed = True
    while changed and len(pts) > 2:
        changed = False
        new_points = []
        count = len(pts)
        for i in range(count):
            a = pts[i - 1]
            b = pts[i]
            c = pts[(i + 1) % count]
            if is_collinear(a, b, c):
                changed = True
                continue
            new_points.append(b)
        pts = new_points
    return pts


def _collect_visible_bodies(design: adsk.fusion.Design) -> list[adsk.fusion.BRepBody]:
    bodies = []
    root = design.rootComponent
    if not root:
        return bodies

    for body in root.bRepBodies:
        if body.isVisible:
            bodies.append(body)

    for occurrence in root.allOccurrences:
        for body in occurrence.bRepBodies:
            if body.isVisible:
                bodies.append(body)

    return bodies


def _plane_is_parallel_to_xy(plane: adsk.core.Plane) -> bool:
    z_axis = adsk.core.Vector3D.create(0, 0, 1)
    return plane.normal.isParallelTo(z_axis)


def _arc_step_radians(value_degrees: float) -> float:
    if value_degrees <= 0:
        value_degrees = DEFAULT_ARC_STEP_DEGREES
    return math.radians(max(0.1, min(value_degrees, 45.0)))


def _curve_segment_count(
    curve: adsk.core.Curve3D,
    start_param: float,
    end_param: float,
    arc_step_radians: float,
) -> int:
    if curve.curveType in (
        adsk.core.Curve3DTypes.Arc3DCurveType,
        adsk.core.Curve3DTypes.Circle3DCurveType,
        adsk.core.Curve3DTypes.EllipticalArc3DCurveType,
        adsk.core.Curve3DTypes.Ellipse3DCurveType,
    ):
        return max(1, int(math.ceil(abs(end_param - start_param) / arc_step_radians)))
    return 1


def _sample_curve_points(
    co_edge: adsk.fusion.BRepCoEdge,
    unit_scale: float,
    close_tol_sq: float,
    arc_step_radians: float,
) -> list[tuple[float, float]]:
    edge = co_edge.edge
    curve = edge.geometry
    if not curve:
        return []

    if curve.curveType == adsk.core.Curve3DTypes.Line3DCurveType:
        if co_edge.isOpposedToEdge:
            start_vertex = edge.endVertex
            end_vertex = edge.startVertex
        else:
            start_vertex = edge.startVertex
            end_vertex = edge.endVertex
        return [
            _project_point(start_vertex.geometry, unit_scale),
            _project_point(end_vertex.geometry, unit_scale),
        ]

    evaluator = curve.evaluator
    ok, start_param, end_param = evaluator.getParameterExtents()
    if not ok:
        return []
    if co_edge.isOpposedToEdge:
        start_param, end_param = end_param, start_param

    segment_count = _curve_segment_count(curve, start_param, end_param, arc_step_radians)
    points = []
    for index in range(segment_count + 1):
        ratio = index / segment_count
        parameter = start_param + (end_param - start_param) * ratio
        ok, point = evaluator.getPointAtParameter(parameter)
        if not ok:
            continue
        _append_point(points, _project_point(point, unit_scale), close_tol_sq)
    return points


def _body_polygon_points(
    body: adsk.fusion.BRepBody,
    unit_scale: float,
    close_tol_sq: float,
    collinear_tol: float,
    arc_step_radians: float,
) -> list[tuple[float, float]]:
    best_face = None
    best_area = -1.0
    for face in body.faces:
        if face.geometry.surfaceType != adsk.core.SurfaceTypes.PlaneSurfaceType:
            continue
        plane = adsk.core.Plane.cast(face.geometry)
        if not plane or not _plane_is_parallel_to_xy(plane):
            continue
        if face.area > best_area:
            best_area = face.area
            best_face = face

    if not best_face:
        return []

    outer_loop = None
    for loop in best_face.loops:
        if loop.isOuter:
            outer_loop = loop
            break

    if not outer_loop or outer_loop.coEdges.count < 1:
        return []

    points = []
    co_edge = outer_loop.coEdges.item(0)
    for _ in range(outer_loop.coEdges.count):
        sampled = _sample_curve_points(
            co_edge,
            unit_scale,
            close_tol_sq,
            arc_step_radians,
        )
        for point in sampled:
            _append_point(points, point, close_tol_sq)
        co_edge = co_edge.next

    if len(points) > 1 and _points_close(points[0], points[-1], close_tol_sq):
        points = points[:-1]

    return _simplify_polyline(points, True, collinear_tol)


def _export_bodies_to_svg(
    design: adsk.fusion.Design,
    file_path: str,
    arc_step_degrees: float = DEFAULT_ARC_STEP_DEGREES,
) -> tuple[bool, str]:
    bodies = _collect_visible_bodies(design)
    if not bodies:
        return False, "No visible body could be exported to SVG."

    close_tol_sq = POINT_TOLERANCE_MM**2
    arc_step_radians = _arc_step_radians(arc_step_degrees)

    paths = []
    all_points = []
    skipped = 0
    for body in bodies:
        points = _body_polygon_points(
            body,
            UNIT_SCALE_MM,
            close_tol_sq,
            COLLINEAR_TOLERANCE,
            arc_step_radians,
        )
        if len(points) < 2:
            skipped += 1
            continue
        paths.append((points, body.name))
        all_points.extend(points)

    if not paths:
        return False, "No XY-projected body outline could be generated."

    min_x = min(point[0] for point in all_points)
    min_y = min(point[1] for point in all_points)
    max_x = max(point[0] for point in all_points)
    max_y = max(point[1] for point in all_points)

    width = max(max_x - min_x, 1.0)
    height = max(max_y - min_y, 1.0)

    def points_to_path(points):
        commands = [f"M {_format_number(points[0][0])} {_format_number(points[0][1])}"]
        commands.extend(
            f"L {_format_number(point[0])} {_format_number(point[1])}"
            for point in points[1:]
        )
        commands.append("Z")
        return " ".join(commands)

    svg_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
            f'width="{_format_number(width)}mm" height="{_format_number(height)}mm" '
            f'viewBox="0 0 {_format_number(width)} {_format_number(height)}" '
            'overflow="visible">'
        ),
        (
            "<desc>Curved edges are approximated with "
            f"{_format_number(math.degrees(arc_step_radians))}-degree segments.</desc>"
        ),
        '<g fill="none" stroke-width="1.0000" '
        'stroke-linecap="round" stroke-linejoin="round">',
    ]

    used_ids = {}
    for index, (points, name) in enumerate(paths):
        base_id = _svg_id_from_name(name or "body")
        count = used_ids.get(base_id, 0) + 1
        used_ids[base_id] = count
        path_id = base_id if count == 1 else f"{base_id}_{count}"
        svg_lines.append(
            f'<path id="{_escape_xml_attr(path_id)}" '
            f'data-name="{_escape_xml_attr(name)}" '
            f'd="{points_to_path(points)}" '
            f'stroke="{_color_for_index(index)}"/>'
        )

    svg_lines.append("</g>")
    svg_lines.append("</svg>")

    with open(file_path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(svg_lines))

    if skipped:
        return True, f"Skipped {skipped} body/bodies without an XY outer loop."
    return True, ""


class _CommandExecuteHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args: adsk.core.CommandEventArgs):
        app, ui = _app_and_ui()
        design = adsk.fusion.Design.cast(app.activeProduct) if app else None
        if not design:
            _show_error(ui, "Open a Fusion design workspace before running this script.")
            return

        inputs = args.command.commandInputs
        file_name_input = inputs.itemById("sls-filename")
        arc_step_input = inputs.itemById("sls-arc-step-deg")

        folder_dialog = ui.createFolderDialog()
        folder_dialog.title = "Select an output folder for the SVG"
        if folder_dialog.showDialog() != adsk.core.DialogResults.DialogOK:
            return

        base_name = str(file_name_input.value or "bodies.svg")
        base_name = re.sub(r"\.(svg|dxf)$", "", base_name, flags=re.IGNORECASE)
        file_path = f"{folder_dialog.folder}/{base_name}.svg"
        arc_step_degrees = float(arc_step_input.value or DEFAULT_ARC_STEP_DEGREES)

        succeeded, info_message = _export_bodies_to_svg(
            design,
            file_path,
            arc_step_degrees,
        )
        if succeeded:
            message = f"SVG saved:\n{file_path}"
            if info_message:
                message = f"{message}\n{info_message}"
            ui.messageBox(message, "SVG Export")
        else:
            _show_error(ui, info_message or "Failed to save the SVG.")


class _CommandCreatedHandler(adsk.core.CommandCreatedEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args: adsk.core.CommandCreatedEventArgs):
        command = args.command
        inputs = command.commandInputs
        inputs.addStringValueInput("sls-filename", "File name", "bodies.svg")
        inputs.addFloatSpinnerCommandInput(
            "sls-arc-step-deg",
            "Arc step (deg)",
            "",
            0.1,
            45.0,
            0.5,
            DEFAULT_ARC_STEP_DEGREES,
        )

        on_execute = _CommandExecuteHandler()
        command.execute.add(on_execute)
        _handlers.append(on_execute)


def run(_context):
    try:
        app, ui = _app_and_ui()
        if not ui:
            return

        command_definitions = ui.commandDefinitions
        command_definition = command_definitions.itemById(COMMAND_ID)
        if not command_definition:
            command_definition = command_definitions.addButtonDefinition(
                COMMAND_ID,
                COMMAND_NAME,
                COMMAND_DESCRIPTION,
            )

        on_created = _CommandCreatedHandler()
        command_definition.commandCreated.add(on_created)
        _handlers.append(on_created)

        command_definition.execute()
        adsk.autoTerminate(False)
    except Exception:
        _, ui = _app_and_ui()
        _show_error(ui, traceback.format_exc())


def stop(_context):
    _, ui = _app_and_ui()
    if not ui:
        return

    command_definition = ui.commandDefinitions.itemById(COMMAND_ID)
    if command_definition:
        command_definition.deleteMe()

    _handlers.clear()
