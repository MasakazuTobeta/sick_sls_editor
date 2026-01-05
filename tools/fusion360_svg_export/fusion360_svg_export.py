"""
Fusion 360 向けの簡易 SVG エクスポート アドイン（Python 版）。
- 表示中の Body を XY 投影した外径ポリゴンとして SVG へ書き出す。
- Scripts/Add-Ins 配下にフォルダーごと配置し、Fusion 360 の Add-Ins から実行する。

SICK SLS Editor の SVG インポート ワークフロー向けに、Fusion 側で
ボディ外形を SVG 化する用途を想定しています。
"""

import adsk.core
import adsk.fusion
import traceback
import re
import math

COMMAND_ID = "SlsEditor_SvgExport"
COMMAND_NAME = "Export Bodies to SVG (SICK SLS)"
COMMAND_DESCRIPTION = "表示中の Body を SVG 形式で保存します"

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


def _distance_sq(a, b) -> float:
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return dx * dx + dy * dy


def _points_close(a, b, tol_sq: float) -> bool:
    return _distance_sq(a, b) <= tol_sq


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


def _body_polygon_points(
    body: adsk.fusion.BRepBody,
    unit_scale: float,
    close_tol_sq: float,
    collinear_tol: float,
) -> list[tuple[float, float]]:
    best_face = None
    best_area = -1.0
    for face in body.faces:
        if face.geometry.surfaceType != adsk.core.SurfaceTypes.PlaneSurfaceType:
            continue
        plane = adsk.core.Plane.cast(face.geometry)
        if not plane:
            continue
        if not _plane_is_parallel_to_xy(plane):
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

    if not outer_loop:
        return []

    count = outer_loop.coEdges.count
    if count < 1:
        return []

    points = []
    co_edge = outer_loop.coEdges.item(0)
    for _ in range(count):
        edge = co_edge.edge
        if co_edge.isOpposedToEdge:
            start_vertex = edge.endVertex
            end_vertex = edge.startVertex
        else:
            start_vertex = edge.startVertex
            end_vertex = edge.endVertex

        start_pt = start_vertex.geometry
        end_pt = end_vertex.geometry
        start = (start_pt.x * unit_scale, -start_pt.y * unit_scale)
        end = (end_pt.x * unit_scale, -end_pt.y * unit_scale)

        if not points:
            points.append(start)
        if not _points_close(points[-1], end, close_tol_sq):
            points.append(end)

        co_edge = co_edge.next

    if len(points) > 1 and _points_close(points[0], points[-1], close_tol_sq):
        points = points[:-1]

    points = _simplify_polyline(points, True, collinear_tol)
    return points


def _export_bodies_to_svg(
    design: adsk.fusion.Design,
    file_path: str,
) -> tuple[bool, str]:
    bodies = _collect_visible_bodies(design)
    if not bodies:
        return False, "表示中の Body がありません。"

    unit_scale = 10.0
    close_tol_sq = (1e-4 * unit_scale) ** 2
    collinear_tol = 1e-6

    def points_to_path(points):
        if len(points) < 2:
            return ""
        commands = [f"M {_format_number(points[0][0])} {_format_number(points[0][1])}"]
        commands.extend(
            f"L {_format_number(p[0])} {_format_number(p[1])}" for p in points[1:]
        )
        commands.append("Z")
        return " ".join(commands)

    polygons = []
    all_points = []
    skipped = 0
    for body in bodies:
        points = _body_polygon_points(body, unit_scale, close_tol_sq, collinear_tol)
        if len(points) < 2:
            skipped += 1
            continue
        polygons.append((points, body.name))
        all_points.extend(points)

    if not polygons:
        return False, "SVG に出力できる Body がありません。"

    min_x = min(p[0] for p in all_points)
    min_y = min(p[1] for p in all_points)
    max_x = max(p[0] for p in all_points)
    max_y = max(p[1] for p in all_points)

    width = max_x - min_x
    height = max_y - min_y
    if width <= 0:
        width = 1.0
    if height <= 0:
        height = 1.0

    stroke_width = 1.0
    paths: list[tuple[str, str]] = []
    for points, name in polygons:
        translated = [(p[0] - min_x, p[1] - min_y) for p in points]
        path = points_to_path(translated)
        if path:
            paths.append((path, name))

    svg_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
            f'width="{_format_number(width)}mm" height="{_format_number(height)}mm" '
            f'viewBox="0 0 {_format_number(width)} {_format_number(height)}" '
            'overflow="visible">'
        ),
        f'<g fill="none" stroke-width="{_format_number(stroke_width)}" '
        'stroke-linecap="round" stroke-linejoin="round">',
    ]

    used_ids = {}
    for index, (path, name) in enumerate(paths):
        base_id = _svg_id_from_name(name or "body")
        count = used_ids.get(base_id, 0) + 1
        used_ids[base_id] = count
        path_id = base_id if count == 1 else f"{base_id}_{count}"
        svg_lines.append(
            f'<path id="{_escape_xml_attr(path_id)}" '
            f'data-name="{_escape_xml_attr(name)}" '
            f'd="{path}" stroke="{_color_for_index(index)}"/>'
        )

    svg_lines.append("</g>")
    svg_lines.append("</svg>")

    with open(file_path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(svg_lines))

    if skipped:
        return True, f"一部の Body をスキップしました ({skipped})"

    return True, ""


class _CommandExecuteHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args: adsk.core.CommandEventArgs):
        app, ui = _app_and_ui()
        design = adsk.fusion.Design.cast(app.activeProduct) if app else None
        if not design:
            _show_error(ui, "Design ワークスペースで実行してください。")
            return

        inputs = args.command.commandInputs
        file_name_input = inputs.itemById("sls-filename")

        folder_dialog = ui.createFolderDialog()
        folder_dialog.title = "SVG の出力先フォルダーを選択"
        if folder_dialog.showDialog() != adsk.core.DialogResults.DialogOK:
            return

        base_name = str(file_name_input.value or "bodies.svg")
        base_name = re.sub(r"\.(svg|dxf)$", "", base_name, flags=re.IGNORECASE)
        file_path = f"{folder_dialog.folder}/{base_name}.svg"

        succeeded, error_message = _export_bodies_to_svg(design, file_path)
        if succeeded:
            message = f"SVG を保存しました:\n{file_path}"
            if error_message:
                message = f"{message}\n{error_message}"
            ui.messageBox(message, "SVG Export")
        else:
            _show_error(ui, error_message or "SVG の保存に失敗しました。")


class _CommandCreatedHandler(adsk.core.CommandCreatedEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args: adsk.core.CommandCreatedEventArgs):
        command = args.command
        inputs = command.commandInputs

        inputs.addStringValueInput("sls-filename", "ファイル名", "bodies.svg")

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
                COMMAND_ID, COMMAND_NAME, COMMAND_DESCRIPTION
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
    app, ui = _app_and_ui()
    if not ui:
        return

    command_definition = ui.commandDefinitions.itemById(COMMAND_ID)
    if command_definition:
        command_definition.deleteMe()

    _handlers.clear()
