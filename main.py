from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List
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


def load_fieldsets() -> Dict[str, Any]:
    """Return structured data for Export_FieldsetsAndFields."""

    default_payload: Dict[str, Any] = {
        "devices": [],
        "global_geometry": {},
        "fieldsets": [],
    }

    if not SAMPLE_XML.exists():
        return default_payload

    try:
        tree = ET.parse(SAMPLE_XML)
    except ET.ParseError:
        return default_payload

    root = tree.getroot()
    export = root.find("Export_FieldsetsAndFields")
    if export is None:
        return default_payload

    scan_plane = export.find("ScanPlane")
    if scan_plane is None:
        return default_payload

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
                    "polygons": [],
                    "circles": [],
                    "rectangles": [],
                }
                for polygon_node in field_node.findall("Polygon"):
                    polygon_data: Dict[str, Any] = {
                        "attributes": dict(polygon_node.attrib),
                        "points": [
                            dict(point.attrib) for point in polygon_node.findall("Point")
                        ],
                    }
                    field_data["polygons"].append(polygon_data)
                for circle_node in field_node.findall("Circle"):
                    field_data["circles"].append(dict(circle_node.attrib))
                for rectangle_node in field_node.findall("Rectangle"):
                    field_data["rectangles"].append(dict(rectangle_node.attrib))
                fieldset_data["fields"].append(field_data)
            fieldsets.append(fieldset_data)

    return {
        "devices": devices,
        "global_geometry": global_geometry,
        "fieldsets": fieldsets,
    }


def load_triorb_shapes() -> List[Dict[str, Any]]:
    if not SAMPLE_XML.exists():
        return []

    try:
        tree = ET.parse(SAMPLE_XML)
    except ET.ParseError:
        return []

    root = tree.getroot()
    tri_node = root.find("TriOrb_SICK_SLS_Editor")
    if tri_node is None:
        return []

    shapes_parent = tri_node.find("Shapes")
    if shapes_parent is None:
        return []

    shapes: List[Dict[str, Any]] = []
    for shape_node in shapes_parent.findall("Shape"):
        shape_data: Dict[str, Any] = {
            "id": shape_node.attrib.get("ID", ""),
            "name": shape_node.attrib.get("Name", ""),
            "type": shape_node.attrib.get("Type", "Polygon"),
        }
        if shape_data["type"] == "Polygon":
            polygon = shape_node.find("Polygon")
            if polygon is not None:
                shape_data["polygon"] = {
                    "Type": polygon.attrib.get("Type", "CutOut"),
                    "points": [
                        dict(point.attrib) for point in polygon.findall("Point")
                    ],
                }
        if shape_data["type"] == "Rectangle":
            rectangle = shape_node.find("Rectangle")
            if rectangle is not None:
                shape_data["rectangle"] = dict(rectangle.attrib)
        if shape_data["type"] == "Circle":
            circle = shape_node.find("Circle")
            if circle is not None:
                shape_data["circle"] = dict(circle.attrib)
        shapes.append(shape_data)

    return shapes


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
        return render_template(
            "index.html",
            plot_spec=plot_spec,
            menu_items=load_menu_items(),
            fileinfo_fields=load_fileinfo_fields(),
            root_attrs=load_root_attributes(),
            scan_planes=load_scan_planes(),
            fieldsets=load_fieldsets(),
            triorb_shapes=load_triorb_shapes(),
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
