from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import uuid
import xml.etree.ElementTree as ET

from flask import Flask, render_template

from plotly_panel import build_sample_figure

# アプリで参照するサンプル XML のパス。
# 実際の編集データがまだない環境でも UI が壊れないよう、
# 読み込みに失敗した場合はすべてフォールバックデータを返す方針とする。
SAMPLE_XML = Path("sample/ScannerDTM-Export_Mini.sgexml")


def load_menu_items() -> List[Dict[str, str]]:
    """Return second-level nodes for the side menu."""

    # メニューの最低限の構造はハードコードしておき、
    # XML 解析に失敗した場合でもアプリが操作できるようにする。
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
        # XML の構造が壊れていた場合も即フォールバック。
        return fallback

    root = tree.getroot()
    items: List[Dict[str, str]] = []
    for child in root:
        summary_parts = []
        if child.attrib:
            # メニュー表示の補助情報として、先頭の属性を要約に含める。
            for key, value in list(child.attrib.items())[:2]:
                summary_parts.append(f"{key}={value}")
        summary = " / ".join(summary_parts) if summary_parts else "No additional attributes"
        items.append({"tag": child.tag, "summary": summary})

    return items or fallback


def load_fileinfo_fields() -> List[Dict[str, str]]:
    """Extract FileInfo child nodes for editing."""

    # FileInfo が存在しない場合は空配列を返し、テンプレート側で空状態を処理する。
    if not SAMPLE_XML.exists():
        return []

    try:
        tree = ET.parse(SAMPLE_XML)
    except ET.ParseError:
        # XML の読み込みに失敗してもアプリが落ちないよう防御的に扱う。
        return []

    root = tree.getroot()
    file_info = root.find("FileInfo")
    if file_info is None:
        return []

    fields: List[Dict[str, str]] = []
    for child in file_info:
        # 各要素をタグ名とテキスト値に分解してテンプレートに渡す。
        value = (child.text or "").strip()
        fields.append({"tag": child.tag, "value": value})

    return fields


def _convert_element_to_node(element: ET.Element) -> Dict[str, Any]:
    """Recursively convert an Element into the generic node structure."""

    children = [_convert_element_to_node(child) for child in list(element)]
    text = (element.text or "").strip()
    return {
        "tag": element.tag,
        "attributes": dict(element.attrib),
        "text": text,
        "children": children,
    }


def _resolve_static_input_value_key(attrs: Dict[str, str]) -> str:
    for candidate in ("Value", "State", "Level", "Mode"):
        if candidate in attrs:
            return candidate
    return "Value"


def _resolve_speed_activation_key(attrs: Dict[str, str]) -> str:
    for candidate in ("Mode", "Type", "State", "Value"):
        if candidate in attrs:
            return candidate
    return "Mode"


def _serialize_static_input_element(element: ET.Element) -> Dict[str, Any]:
    attrs = dict(element.attrib)
    return {
        "attributes": attrs,
        "value_key": _resolve_static_input_value_key(attrs),
    }


def _serialize_speed_activation_element(element: ET.Element) -> Dict[str, Any]:
    attrs = dict(element.attrib)
    return {
        "attributes": attrs,
        "mode_key": _resolve_speed_activation_key(attrs),
    }


def _serialize_case_element(case_element: ET.Element) -> Dict[str, Any]:
    entry: Dict[str, Any] = {
        "attributes": dict(case_element.attrib),
        "static_inputs": [],
        "speed_activation": None,
        "layout": [],
    }
    for child in list(case_element):
        if child.tag == "StaticInputs":
            static_inputs = [
                _serialize_static_input_element(static_node)
                for static_node in child.findall("StaticInput")
            ]
            entry["static_inputs"] = static_inputs
            entry["layout"].append({"kind": "static-inputs"})
        elif child.tag == "SpeedActivation":
            entry["speed_activation"] = _serialize_speed_activation_element(child)
            entry["layout"].append({"kind": "speed-activation"})
        else:
            entry.setdefault("layout", []).append(
                {"kind": "node", "node": _convert_element_to_node(child)}
            )
    return entry


def _serialize_eval_case_node(case_element: ET.Element) -> Dict[str, Any]:
    attributes = dict(case_element.attrib)
    scan_plane = case_element.find("./ScanPlanes/ScanPlane")
    scan_attributes = dict(scan_plane.attrib) if scan_plane is not None else {}
    user_field_id = ""
    is_splitted = ""
    if scan_plane is not None:
        user_field_id = (scan_plane.findtext("UserFieldId") or "").strip()
        is_splitted = (scan_plane.findtext("IsSplitted") or "").strip()
    return {
        "attributes": attributes,
        "scanPlane": {
            "attributes": scan_attributes,
            "userFieldId": user_field_id,
            "isSplitted": is_splitted,
        },
    }


def _serialize_eval_node(eval_element: ET.Element) -> Dict[str, Any]:
    reset_block = eval_element.find("Reset")
    permanent_scan_plane = eval_element.find("PermanentPreset/ScanPlanes/ScanPlane")
    cases_parent = eval_element.find("Cases")
    reset_data = {
        "resetType": (reset_block.findtext("ResetType") if reset_block is not None else ""),
        "autoResetTime": (reset_block.findtext("AutoResetTime") if reset_block is not None else ""),
        "evalResetSource": (
            reset_block.findtext("EvalResetSource") if reset_block is not None else ""
        ),
    }
    permanent_preset = {
        "scanPlaneAttributes": dict(permanent_scan_plane.attrib)
        if permanent_scan_plane is not None
        else {},
        "fieldMode": (
            permanent_scan_plane.findtext("FieldMode")
            if permanent_scan_plane is not None
            else ""
        ),
    }
    cases = []
    if cases_parent is not None:
        cases = [_serialize_eval_case_node(case_el) for case_el in cases_parent.findall("Case")]
    return {
        "attributes": dict(eval_element.attrib),
        "name": (eval_element.findtext("Name") or "").strip(),
        "nameLatin9Key": (eval_element.findtext("NameLatin9Key") or "").strip(),
        "q": (eval_element.findtext("Q") or "").strip(),
        "reset": {key: (value or "").strip() for key, value in reset_data.items()},
        "cases": cases,
        "permanentPreset": {
            "scanPlaneAttributes": permanent_preset["scanPlaneAttributes"],
            "fieldMode": (permanent_preset["fieldMode"] or "").strip(),
        },
    }


def _serialize_evals_node(evals_element: ET.Element) -> Dict[str, Any]:
    return {
        "attributes": dict(evals_element.attrib),
        "evals": [_serialize_eval_node(eval_el) for eval_el in evals_element.findall("Eval")],
    }


def load_casetable_payload() -> Dict[str, Any]:
    """Extract Export_CasetablesAndCases content for the template."""

    default_layout = [
        {"kind": "configuration"},
        {"kind": "cases"},
        {"kind": "evals"},
        {"kind": "fields_configuration"},
    ]
    fallback = {
        "casetable_attributes": {"Index": "0"},
        "configuration": None,
        "cases": [],
        "evals": {"attributes": {}, "evals": []},
        "fields_configuration": None,
        "layout": default_layout,
    }

    if not SAMPLE_XML.exists():
        return fallback

    try:
        tree = ET.parse(SAMPLE_XML)
    except ET.ParseError:
        return fallback

    root = tree.getroot()
    export = root.find("Export_CasetablesAndCases")
    if export is None:
        return fallback

    casetables = export.findall("Casetable")
    target: Optional[ET.Element] = None
    for node in casetables:
        if node.get("Index") == "0":
            target = node
            break
    if target is None and casetables:
        target = casetables[0]
    if target is None:
        return fallback

    payload: Dict[str, Any] = {
        "casetable_attributes": dict(target.attrib) or {"Index": "0"},
        "configuration": None,
        "cases": [],
        "evals": {"attributes": {}, "evals": []},
        "fields_configuration": None,
        "layout": [],
    }

    for child in list(target):
        if child.tag == "Configuration":
            payload["configuration"] = _convert_element_to_node(child)
            payload["layout"].append({"kind": "configuration"})
        elif child.tag == "Cases":
            payload["cases"] = [
                _serialize_case_element(case_el)
                for case_el in child.findall("Case")
            ]
            payload["layout"].append({"kind": "cases"})
        elif child.tag == "Evals":
            payload["evals"] = _serialize_evals_node(child)
            payload["layout"].append({"kind": "evals"})
        elif child.tag == "FieldsConfiguration":
            payload["fields_configuration"] = _convert_element_to_node(child)
            payload["layout"].append({"kind": "fields_configuration"})
        else:
            payload["layout"].append(
                {"kind": "node", "node": _convert_element_to_node(child)}
            )

    seen_kinds = {segment.get("kind") for segment in payload["layout"] if segment.get("kind")}
    for kind in ("configuration", "cases", "evals", "fields_configuration"):
        if kind not in seen_kinds:
            payload["layout"].append({"kind": kind})

    if not payload["casetable_attributes"].get("Index"):
        payload["casetable_attributes"]["Index"] = "0"

    return payload


def load_scan_planes() -> List[Dict[str, Any]]:
    """Return structured data for Export_ScanPlanes."""

    # ScanPlane 情報は TriOrb の扇形描画に利用されるため、
    # 解析できない場合は空配列を返し Plotly 側で分岐する。
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
        # 各 ScanPlane を辞書化し、Devices 配下の要素もネストして保持する。
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
    # XML に ID が欠落している場合でも UI でユニークに扱えるよう、
    # ランダムな ID を生成するユーティリティ。
    return f"shape-{uuid.uuid4().hex[:8]}"


def _build_shape_key(shape_type: str, attrs: Dict[str, str], points: Optional[List[Dict[str, str]]] = None) -> str:
    # TriOrb 共有図形を同一性判定するためのキーを生成。
    # 図形タイプと属性値、必要に応じて座標列を連結して比較する。
    attr_items = "/".join(f"{key}={attrs.get(key, '')}" for key in sorted(attrs))
    key_parts = [shape_type, attr_items]
    if shape_type == "Polygon" and points is not None:
        points_repr = ",".join(f"{point.get('X','')}:{point.get('Y','')}" for point in points)
        key_parts.append(points_repr)
    return "|".join(key_parts)


def _parse_polygon_node(polygon_node: ET.Element) -> Tuple[Dict[str, str], List[Dict[str, str]]]:
    # Polygon 要素は座標リストを含むため、属性と座標を分離して返す。
    attrs = dict(polygon_node.attrib)
    points = [dict(point.attrib) for point in polygon_node.findall("Point")]
    return attrs, points


def _parse_rectangle_node(rectangle_node: ET.Element) -> Dict[str, str]:
    # Rectangle / Circle は属性のみなので辞書化して返すだけ。
    return dict(rectangle_node.attrib)


def _parse_circle_node(circle_node: ET.Element) -> Dict[str, str]:
    return dict(circle_node.attrib)


def _load_triorb_shapes_from_root(root: ET.Element) -> Tuple[List[Dict[str, Any]], str]:
    # TriOrb_SICK_SLS_Editor セクションから共有図形を抽出する。
    # TriOrb は Fieldset とは独立に Shape を再利用できるため、
    # 先にすべて集めておく必要がある。
    tri_node = root.find("TriOrb_SICK_SLS_Editor")
    if tri_node is None:
        return [], ""

    tri_source = tri_node.attrib.get("Source", "")
    shapes_parent = tri_node.find("Shapes")
    if shapes_parent is None:
        return [], tri_source

    shapes: List[Dict[str, Any]] = []
    for shape_node in shapes_parent.findall("Shape"):
        # Shape タグに図形タイプが記録されている前提で個別の辞書に展開する。
        shape_type = shape_node.attrib.get("Type", "Polygon")
        shape_data: Dict[str, Any] = {
            "id": shape_node.attrib.get("ID") or _generate_shape_id(),
            "name": shape_node.attrib.get("Name", ""),
            "type": shape_type,
            "fieldtype": shape_node.attrib.get("Fieldtype", "ProtectiveSafeBlanking"),
            "kind": shape_node.attrib.get("Kind"),
        }
        if shape_type == "Polygon":
            polygon = shape_node.find("Polygon")
            if polygon is not None:
                polygon_attrs, points = _parse_polygon_node(polygon)
                shape_data["polygon"] = {"Type": polygon_attrs.get("Type", "CutOut"), "points": points}
                if not shape_data["kind"]:
                    shape_data["kind"] = polygon_attrs.get("Type")
        elif shape_type == "Rectangle":
            rectangle = shape_node.find("Rectangle")
            if rectangle is not None:
                shape_data["rectangle"] = _parse_rectangle_node(rectangle)
                if not shape_data["kind"]:
                    shape_data["kind"] = shape_data["rectangle"].get("Type")
        elif shape_type == "Circle":
            circle = shape_node.find("Circle")
            if circle is not None:
                shape_data["circle"] = _parse_circle_node(circle)
                if not shape_data["kind"]:
                    shape_data["kind"] = shape_data["circle"].get("Type")
        if not shape_data.get("kind"):
            shape_data["kind"] = "Field"
        shapes.append(shape_data)
    return shapes, tri_source


def _ensure_shape(
    shapes: List[Dict[str, Any]],
    registry: Dict[str, str],
    shape_type: str,
    attrs: Dict[str, str],
    points: Optional[List[Dict[str, str]]],
    hint: Optional[str] = None,
    fieldtype: Optional[str] = None,
) -> str:
    # Fieldset 側に直接図形定義が書かれているケースでは、
    # TriOrb の共有図形へ昇格させつつ ID を再利用する必要がある。
    # registry に登録されたキーを利用して重複を排除する。
    key = _build_shape_key(shape_type, attrs, points)
    existing_id = registry.get(key)
    if existing_id:
        return existing_id

    # まだ登録されていない図形は新しく作成し、TriOrb Shapes に追記する。
    shape_id = attrs.get("ID") or _generate_shape_id()
    name = hint or f"{shape_type} Shape {len(shapes) + 1}"
    shape_entry: Dict[str, Any] = {
        "id": shape_id,
        "name": name,
        "type": shape_type,
        "fieldtype": fieldtype or "ProtectiveSafeBlanking",
        "kind": attrs.get("Type", "Field"),
    }
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

    # サンプル XML がない場合は空データを返し、テンプレートで空描画に切り替える。
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

    # Fieldset 側を走査し、Shapes 要素がなくても TriOrb Shapes に登録されるよう補完する。
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
                    # 古い XML では Field 直下に図形定義が存在する場合があるため、
                    # TriOrb の Shapes に登録し直し、その ID を参照させる。
                    for polygon_node in field_node.findall("Polygon"):
                        attrs, points = _parse_polygon_node(polygon_node)
                        shape_id = _ensure_shape(
                            shapes,
                            shape_registry,
                            "Polygon",
                            attrs,
                            points,
                            f"{fieldset_data['attributes'].get('Name','')} {field_data['attributes'].get('Name','')} Polygon",
                            field_data["attributes"].get("Fieldtype"),
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
                            field_data["attributes"].get("Fieldtype"),
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
                            field_data["attributes"].get("Fieldtype"),
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

    # ルート属性は UI のメタ情報表示に利用される。
    if not SAMPLE_XML.exists():
        return {}

    try:
        tree = ET.parse(SAMPLE_XML)
    except ET.ParseError:
        return {}

    root = tree.getroot()
    return dict(root.attrib)


def create_app() -> Flask:
    # Flask アプリケーションのファクトリ。
    app = Flask(__name__)

    @app.route("/")
    def index():
        # Plotly 図面とサイドメニューに必要な情報をまとめてテンプレートへ渡す。
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
            casetable_payload=load_casetable_payload(),
        )

    return app


app = create_app()


if __name__ == "__main__":
    # デバッグ目的で直接起動された場合は Flask の開発サーバーを利用する。
    app.run(debug=True)
