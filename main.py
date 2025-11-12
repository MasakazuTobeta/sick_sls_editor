from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import uuid
import xml.etree.ElementTree as ET

from flask import Flask, render_template

from plotly_panel import build_sample_figure

SAMPLE_XML = Path("sample/20251111-105839_ScannerDTM-Export.sgexml")


def load_menu_items() -> List[Dict[str, str]]:
    """Return second-level nodes for the side menu."""

    fallback = [
        {"tag": "FileInfo", "summary": "Metadata"},
        {"tag": "Export_ScanPlanes", "summary": "Scan plane definitions"},
        {"tag": "Export_FieldsetsAndFields", "summary": "Fieldsets (placeholder)"},
        {"tag": "Export_CasetablesAndCases", "summary": "Case tables (placeholder)"},
    ]

    if not SAMPLE_XML.exists():
        return fallback

    try:
        tree = ET.parse(SAMPLE_XML)
    except ET.ParseError:
        return fallback

    root = tree.getroot()
    items: List[Dict[str, str]] = []
    for child in root:
        summary_parts = []
        if child.attrib:
            for key, value in list(child.attrib.items())[:2]:
                summary_parts.append(f"{key}={value}")
        summary = " / ".join(summary_parts) if summary_parts else "No additional attributes"
        items.append({"tag": child.tag, "summary": summary})

    return items or fallback


def load_fileinfo_fields() -> List[Dict[str, str]]:
    """Extract FileInfo child nodes for editing."""

    if not SAMPLE_XML.exists():
        return []

    try:
        tree = ET.parse(SAMPLE_XML)
    except ET.ParseError:
        return []

    root = tree.getroot()
    file_info = root.find("FileInfo")
    if file_info is None:
        return []

    fields: List[Dict[str, str]] = []
    for child in file_info:
        value = (child.text or "").strip()
        fields.append({"tag": child.tag, "value": value})

    return fields


def load_scan_planes() -> List[Dict[str, Any]]:
    """Return structured data for Export_ScanPlanes."""

    if not SAMPLE_XML.exists():
        return []

    try:
        tree = ET.parse(SAMPLE_XML)
    except ET.ParseError:
        return []

    root = tree.getroot()
    export = root.find("Export_ScanPlanes")
    if export is None:
        return []

    scan_planes: List[Dict[str, Any]] = []
    for plane in export.findall("ScanPlane"):
        plane_data: Dict[str, Any] = {
            "attributes": dict(plane.attrib),
            "devices": [],
        }
        devices_parent = plane.find("Devices")
        if devices_parent is not None:
            for device in devices_parent.findall("Device"):
                plane_data["devices"].append({"attributes": dict(device.attrib)})
        scan_planes.append(plane_data)

    return scan_planes


def _generate_shape_id() -> str:
    return f"shape-{uuid.uuid4().hex[:8]}"


def _build_shape_key(shape_type: str, attrs: Dict[str, str], points: Optional[List[Dict[str, str]]] = None) -> str:
    attr_items = "/".join(f"{key}={attrs.get(key,"")}" for key in sorted(attrs))
    key_parts = [shape_type, attr_items]
    if shape_type == "Polygon" and points is not None:
        points_repr = ",".join(f"{point.get('X','')}:{point.get('Y','')}" for point in points)
        key_parts.append(points_repr)
    return "|".join(key_parts)


def _parse_polygon_node(polygon_node: ET.Element) -> Tuple[Dict[str, str], List[Dict[str, str]]]:
    attrs = dict(polygon_node.attrib)
    points = [dict(point.attrib) for point in polygon_node.findall("Point")]
    return attrs, points


def _parse_rectangle_node(rectangle_node: ET.Element) -> Dict[str, str]:
    return dict(rectangle_node.attrib)


def _parse_circle_node(circle_node: ET.Element) -> Dict[str, str]:
    return dict(circle_node.attrib)


def _load_triorb_shapes_from_root(root: ET.Element) -> Tuple[List[Dict[str, Any]], str]:
    tri_node = root.find("TriOrb_SICK_SLS_Editor")
    if tri_node is None:
        return [], ""

    tri_source = tri_node.attrib.get("Source", "")
    shapes_parent = tri_node.find("Shapes")
    if shapes_parent is None:
        return [], tri_source

    shapes: List[Dict[str, Any]] = []
    for shape_node in shapes_parent.findall("Shape"):
        shape_type = shape_node.attrib.get("Type", "Polygon")
        shape_data: Dict[str, Any] = {
            "id": shape_node.attrib.get("ID") or _generate_shape_id(),
            "name": shape_node.attrib.get("Name", ""),
            "type": shape_type,
        }
        if shape_type == "Polygon":
            polygon = shape_node.find("Polygon")
            if polygon is not None:
                polygon_attrs, points = _parse_polygon_node(polygon)
                shape_data["polygon"] = {"Type": polygon_attrs.get("Type", "CutOut"), "points": points}
        elif shape_type == "Rectangle":
            rectangle = shape_node.find("Rectangle")
            if rectangle is not None:
                shape_data["rectangle"] = _parse_rectangle_node(rectangle)
        elif shape_type == "Circle":
            circle = shape_node.find("Circle")
            if circle is not None:
                shape_data["circle"] = _parse_circle_node(circle)
        shapes.append(shape_data)
    return shapes, tri_source


def _ensure_shape(
    shapes: List[Dict[str, Any]],
    registry: Dict[str, str],
    shape_type: str,
    attrs: Dict[str, str],
    points: Optional[List[Dict[str, str]]],
    hint: Optional[str] = None,
) -> str:
    key = _build_shape_key(shape_type, attrs, points)
    existing_id = registry.get(key)
    if existing_id:
        return existing_id

    shape_id = attrs.get("ID") or _generate_shape_id()
    name = hint or f"{shape_type} Shape {len(shapes) + 1}"
    shape_entry: Dict[str, Any] = {"id": shape_id, "name": name, "type": shape_type}
    if shape_type == "Polygon":
        shape_entry["polygon"] = {"Type": attrs.get("Type", "CutOut"), "points": points or []}
    elif shape_type == "Rectangle":
        shape_entry["rectangle"] = attrs
    elif shape_type == "Circle":
        shape_entry["circle"] = attrs
    shapes.append(shape_entry)
    registry[key] = shape_id
    return shape_id


def load_fieldsets_and_shapes() -> Tuple[Dict[str, Any], List[Dict[str, Any]], str]:
    """Return fieldset payload, shared TriOrb shapes, and TriOrb source marker."""

    default_payload: Dict[str, Any] = {
        "devices": [],
        "global_geometry": {},
        "fieldsets": [],
    }

    if not SAMPLE_XML.exists():
        return default_payload, [], ""

    try:
        tree = ET.parse(SAMPLE_XML)
    except ET.ParseError:
        return default_payload, [], ""

    root = tree.getroot()
    shapes, tri_source = _load_triorb_shapes_from_root(root)
    shape_registry: Dict[str, str] = {}
    for shape in shapes:
        if shape["type"] == "Polygon":
            polygon = shape.get("polygon", {})
            key = _build_shape_key("Polygon", {"Type": polygon.get("Type", "CutOut")}, polygon.get("points", []))
        elif shape["type"] == "Rectangle":
            rectangle = shape.get("rectangle", {})
            key = _build_shape_key("Rectangle", rectangle, None)
        elif shape["type"] == "Circle":
            circle = shape.get("circle", {})
            key = _build_shape_key("Circle", circle, None)
        else:
            continue
        shape_registry[key] = shape["id"]

    export = root.find("Export_FieldsetsAndFields")
    if export is None:
        return default_payload, shapes, tri_source

    scan_plane = export.find("ScanPlane")
    if scan_plane is None:
        return default_payload, shapes, tri_source

    devices: List[Dict[str, Any]] = []
    devices_parent = scan_plane.find("Devices")
    if devices_parent is not None:
        for device_node in devices_parent.findall("Device"):
            devices.append({"attributes": dict(device_node.attrib)})

    global_geometry = {}
    global_node = scan_plane.find("GlobalGeometry")
    if global_node is not None:
        global_geometry = dict(global_node.attrib)

    fieldsets: List[Dict[str, Any]] = []
    fieldsets_parent = scan_plane.find("Fieldsets")
    if fieldsets_parent is not None:
        for fieldset_node in fieldsets_parent.findall("Fieldset"):
            fieldset_data: Dict[str, Any] = {
                "attributes": dict(fieldset_node.attrib),
                "fields": [],
            }
            for field_node in fieldset_node.findall("Field"):
                field_data: Dict[str, Any] = {
                    "attributes": dict(field_node.attrib),
                    "shapeRefs": [],
                }
                shapes_parent = field_node.find("Shapes")
                if shapes_parent is not None:
                    for shape_node in shapes_parent.findall("Shape"):
                        shape_id = shape_node.attrib.get("ID")
                        if shape_id:
                            field_data["shapeRefs"].append({"shapeId": shape_id})
                else:
                    for polygon_node in field_node.findall("Polygon"):
                        attrs, points = _parse_polygon_node(polygon_node)
                        shape_id = _ensure_shape(
                            shapes,
                            shape_registry,
                            "Polygon",
                            attrs,
                            points,
                            f"{fieldset_data['attributes'].get('Name','')} {field_data['attributes'].get('Name','')} Polygon",
                        )
                        field_data["shapeRefs"].append({"shapeId": shape_id})
                    for rectangle_node in field_node.findall("Rectangle"):
                        attrs = _parse_rectangle_node(rectangle_node)
                        shape_id = _ensure_shape(
                            shapes,
                            shape_registry,
                            "Rectangle",
                            attrs,
                            None,
                            f"{fieldset_data['attributes'].get('Name','')} {field_data['attributes'].get('Name','')} Rectangle",
                        )
                        field_data["shapeRefs"].append({"shapeId": shape_id})
                    for circle_node in field_node.findall("Circle"):
                        attrs = _parse_circle_node(circle_node)
                        shape_id = _ensure_shape(
                            shapes,
                            shape_registry,
                            "Circle",
                            attrs,
                            None,
                            f"{fieldset_data['attributes'].get('Name','')} {field_data['attributes'].get('Name','')} Circle",
                        )
                        field_data["shapeRefs"].append({"shapeId": shape_id})
                fieldset_data["fields"].append(field_data)
            fieldsets.append(fieldset_data)

    return (
        {
            "devices": devices,
            "global_geometry": global_geometry,
            "fieldsets": fieldsets,
        },
        shapes,
        tri_source,
    )


def load_root_attributes() -> Dict[str, str]:
    """Capture attributes defined on the SdImportExport root."""

    if not SAMPLE_XML.exists():
        return {}

    try:
        tree = ET.parse(SAMPLE_XML)
    except ET.ParseError:
        return {}

    root = tree.getroot()
    return dict(root.attrib)


def create_app() -> Flask:
    app = Flask(__name__)

    @app.route("/")
    def index():
        fig = build_sample_figure()
        plot_spec = fig.to_plotly_json()
        fieldsets_payload, triorb_shapes, triorb_source = load_fieldsets_and_shapes()
        return render_template(
            "index.html",
            plot_spec=plot_spec,
            menu_items=load_menu_items(),
            fileinfo_fields=load_fileinfo_fields(),
            root_attrs=load_root_attributes(),
            scan_planes=load_scan_planes(),
            fieldsets=fieldsets_payload,
            triorb_shapes=triorb_shapes,
            triorb_source=triorb_source,
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
