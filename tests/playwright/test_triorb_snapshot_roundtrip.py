from __future__ import annotations

import copy
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from tests.conftest import SERVER_URL, launch_chromium


def _normalize_snapshot(snapshot: dict) -> dict:
    normalized = copy.deepcopy(snapshot)
    return normalized


def _document(snapshot: dict) -> dict:
    return snapshot["document"]


def _open_panel(page, panel_id: str) -> None:
    page.locator(f'.panel-launch-btn[data-panel-target="{panel_id}"]').click()
    page.locator(f"#{panel_id}").wait_for(state="visible")


def _shape_snapshot(
    shape_id: str,
    name: str,
    *,
    kind: str = "Field",
    offset_x: int = 0,
    offset_y: int = 0,
) -> dict:
    return {
        "id": shape_id,
        "name": name,
        "type": "Polygon",
        "fieldtype": "ProtectiveSafeBlanking",
        "kind": kind,
        "polygon": {
            "Type": kind,
            "points": [
                {"X": str(offset_x), "Y": str(offset_y)},
                {"X": str(offset_x + 40), "Y": str(offset_y)},
                {"X": str(offset_x + 40), "Y": str(offset_y + 40)},
            ],
        },
        "rectangle": {
            "Type": kind,
            "OriginX": "0",
            "OriginY": "0",
            "Width": "10",
            "Height": "10",
            "Rotation": "0",
        },
        "circle": {
            "Type": kind,
            "CenterX": "0",
            "CenterY": "0",
            "Radius": "10",
        },
        "visible": True,
    }


def test_store_state_exposes_grouped_domains(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            store_state = page.evaluate("window.__triorbTestApi.getStoreState()")

            assert "devices" in store_state
            assert "shapes" in store_state
            assert "fieldsets" in store_state
            assert "assignments" in store_state
            assert "uiState" in store_state
            assert store_state["devices"]["scanPlanes"]
            assert store_state["fieldsets"]["items"]
            assert store_state["shapes"]["items"]
        finally:
            browser.close()


def test_bootstrap_keeps_default_fieldset_devices(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            coords = {
                (
                    device["attributes"].get("PositionX"),
                    device["attributes"].get("PositionY"),
                    device["attributes"].get("Rotation"),
                )
                for device in document["fieldsetDevices"]
            }
            assert ("170", "102", "290") in coords
            assert ("-170", "102", "70") in coords
        finally:
            browser.close()


def test_triorb_snapshot_roundtrip_restores_exact_state(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            assert document["triorbShapes"], "Expected at least one TriOrb shape in bootstrap data"
            assert document["fieldsets"], "Expected at least one fieldset in bootstrap data"
            assert document["scanPlanes"], "Expected at least one scanplane in bootstrap data"

            base_shape = copy.deepcopy(document["triorbShapes"][0])
            duplicate_shape = copy.deepcopy(base_shape)
            duplicate_shape["id"] = "shape-duplicate"
            duplicate_shape["name"] = "Exact Duplicate"
            document["triorbShapes"].append(duplicate_shape)

            first_field = document["fieldsets"][0]["fields"][0]
            first_field.setdefault("shapeRefs", [])
            first_field["shapeRefs"].append({"shapeId": "shape-duplicate"})

            scan_device = copy.deepcopy(document["scanPlanes"][0]["devices"][0])
            scan_device["attributes"]["Index"] = "1"
            scan_device["attributes"]["DeviceName"] = "Left"
            document["scanPlanes"][0]["devices"] = [
                {
                    "attributes": {
                        **scan_device["attributes"],
                        "Index": "0",
                        "DeviceName": "Right",
                    }
                },
                scan_device,
            ]

            fieldset_device = copy.deepcopy(document["fieldsetDevices"][0])
            fieldset_device["attributes"]["DeviceName"] = "Left"
            document["fieldsetDevices"] = [
                {
                    "attributes": {
                        **fieldset_device["attributes"],
                        "DeviceName": "Right",
                    }
                },
                fieldset_device,
            ]

            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )
            before = _normalize_snapshot(
                page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            )

            xml_text = page.evaluate("window.__triorbTestApi.buildTriOrbXml()")
            assert "<StateSnapshot" in xml_text

            page.evaluate("xml => window.__triorbTestApi.loadXml(xml)", xml_text)
            after = _normalize_snapshot(
                page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            )

            assert before == after
        finally:
            browser.close()


def test_shape_assignment_modal_supports_shift_range_selection(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            document["triorbShapes"] = []
            for index in range(4):
                document["triorbShapes"].append(
                    {
                        "id": f"field-shape-{index + 1}",
                        "name": f"Field Shape {index + 1}",
                        "type": "Polygon",
                        "fieldtype": "ProtectiveSafeBlanking",
                        "kind": "Field",
                        "polygon": {
                            "Type": "Field",
                            "points": [
                                {"X": str(index * 10), "Y": "0"},
                                {"X": str(index * 10 + 20), "Y": "0"},
                                {"X": str(index * 10 + 20), "Y": "20"},
                            ],
                        },
                        "rectangle": {
                            "Type": "Field",
                            "OriginX": "0",
                            "OriginY": "0",
                            "Width": "10",
                            "Height": "10",
                            "Rotation": "0",
                        },
                        "circle": {
                            "Type": "Field",
                            "CenterX": "0",
                            "CenterY": "0",
                            "Radius": "10",
                        },
                        "visible": True,
                    }
                )

            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            page.click("#btn-add-field-overlay")
            modal = page.locator("#create-field-modal")
            modal.wait_for(state="visible")

            buttons = page.locator("#create-field-shape-list-0-field .create-field-shape-btn")
            buttons.nth(0).click()
            buttons.nth(2).click(modifiers=["Shift"])

            active_count = page.locator(
                "#create-field-shape-list-0-field .create-field-shape-btn.active"
            ).count()
            assert active_count == 3
        finally:
            browser.close()


def test_create_shape_attach_to_fieldsets_supports_shift_range_selection(flask_server):
    source_path = Path(__file__).resolve().parents[2] / "TriOrb_1776337392610.sgexml"
    if not source_path.exists():
        pytest.skip(f"Source XML not found: {source_path}")
    xml_text = source_path.read_text(encoding="utf-8")

    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")
            page.evaluate("xml => window.__triorbTestApi.loadXml(xml)", xml_text)

            page.click("#btn-add-shape-overlay")
            page.locator("#create-shape-modal").wait_for(state="visible")

            buttons = page.locator("#create-shape-fieldset-list .toggle-pill-btn")
            buttons.nth(0).click()
            buttons.nth(3).click(modifiers=["Shift"])

            active_count = page.locator(
                "#create-shape-fieldset-list .toggle-pill-btn.active"
            ).count()
            assert active_count == 4
        finally:
            browser.close()


def test_create_shape_modal_resize_handle_works_without_reference_error(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            errors = []
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            page.click("#btn-add-shape-overlay")
            page.locator("#create-shape-modal").wait_for(state="visible")

            modal_window = page.locator("#create-shape-modal .modal-window")
            resize_handle = page.locator("#create-shape-modal .modal-resize-handle").first

            before = modal_window.bounding_box()
            handle_box = resize_handle.bounding_box()
            assert before is not None
            assert handle_box is not None

            page.mouse.move(handle_box["x"] + handle_box["width"] / 2, handle_box["y"] + handle_box["height"] / 2)
            page.mouse.down()
            page.mouse.move(handle_box["x"] + 80, handle_box["y"] + 80, steps=8)
            page.mouse.up()

            after = modal_window.bounding_box()
            assert after is not None
            assert after["width"] > before["width"]
            assert after["height"] > before["height"]
            assert not any("createShapeResizeStartX is not defined" in error for error in errors)
        finally:
            browser.close()


def test_create_shape_attach_buttons_select_all_and_clear(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            document["fieldsets"] = [
                {
                    "attributes": {"Name": "Set A", "Index": "0"},
                    "fields": [],
                    "visible": True,
                },
                {
                    "attributes": {"Name": "Set B", "Index": "1"},
                    "fields": [],
                    "visible": True,
                },
                {
                    "attributes": {"Name": "Set C", "Index": "2"},
                    "fields": [],
                    "visible": True,
                },
            ]
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            page.click("#btn-add-shape-overlay")
            page.locator("#create-shape-modal").wait_for(state="visible")

            page.click('[data-create-shape-selection-action="all"]')
            assert page.locator("#create-shape-fieldset-list .toggle-pill-btn.active").count() == 3

            page.click('[data-create-shape-selection-action="clear"]')
            assert page.locator("#create-shape-fieldset-list .toggle-pill-btn.active").count() == 0
        finally:
            browser.close()


def test_create_field_modal_drag_handle_moves_window(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            errors = []
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            page.click("#btn-add-field-overlay")
            page.locator("#create-field-modal").wait_for(state="visible")

            modal_window = page.locator("#create-field-modal .modal-window")
            drag_handle = page.locator("#create-field-modal .modal-header").first

            before = modal_window.bounding_box()
            handle_box = drag_handle.bounding_box()
            assert before is not None
            assert handle_box is not None

            page.mouse.move(handle_box["x"] + handle_box["width"] / 2, handle_box["y"] + handle_box["height"] / 2)
            page.mouse.down()
            page.mouse.move(handle_box["x"] + 80, handle_box["y"] + 40, steps=8)
            page.mouse.up()

            after = modal_window.bounding_box()
            assert after is not None
            assert after["x"] != before["x"] or after["y"] != before["y"]
            assert not errors
        finally:
            browser.close()


def test_create_field_shape_buttons_select_all_and_clear(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            document["triorbShapes"] = []
            for index in range(3):
                document["triorbShapes"].append(
                    {
                        "id": f"shape-all-{index + 1}",
                        "name": f"Shape {index + 1}",
                        "type": "Polygon",
                        "fieldtype": "ProtectiveSafeBlanking",
                        "kind": "Field",
                        "polygon": {
                            "Type": "Field",
                            "points": [
                                {"X": "0", "Y": "0"},
                                {"X": "10", "Y": "0"},
                                {"X": "10", "Y": "10"},
                            ],
                        },
                        "rectangle": {
                            "Type": "Field",
                            "OriginX": "0",
                            "OriginY": "0",
                            "Width": "10",
                            "Height": "10",
                            "Rotation": "0",
                        },
                        "circle": {
                            "Type": "Field",
                            "CenterX": "0",
                            "CenterY": "0",
                            "Radius": "10",
                        },
                        "visible": True,
                    }
                )
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            page.click("#btn-add-field-overlay")
            page.locator("#create-field-modal").wait_for(state="visible")

            page.click('[data-create-field-selection-action="all"][data-field-index="0"][data-kind="Field"]')
            assert page.locator("#create-field-shape-list-0-field .create-field-shape-btn.active").count() == 3

            page.click('[data-create-field-selection-action="clear"][data-field-index="0"][data-kind="Field"]')
            assert page.locator("#create-field-shape-list-0-field .create-field-shape-btn.active").count() == 0
        finally:
            browser.close()


def test_triorb_shape_list_hover_highlights_plot_trace(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            document["fieldsets"] = []
            document["triorbShapes"] = [
                _shape_snapshot("shape-alpha", "Alpha Shape", offset_x=0),
                _shape_snapshot("shape-beta", "Beta Shape", offset_x=80),
            ]
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            _open_panel(page, "panel-triorb-shapes")
            page.hover('#triorb-shapes-list .triorb-shape-card[data-shape-id="shape-beta"]')
            page.wait_for_timeout(150)

            trace_state = page.evaluate(
                """
                () => document.getElementById('plot').data
                  .filter((trace) => trace.meta && trace.meta.isTriOrbShape && trace.meta.shapeId)
                  .map((trace) => ({
                    shapeId: trace.meta.shapeId,
                    opacity: trace.opacity ?? 1,
                    width: trace.line?.width ?? 0,
                  }))
                """
            )

            alpha_trace = next(item for item in trace_state if item["shapeId"] == "shape-alpha")
            beta_trace = next(item for item in trace_state if item["shapeId"] == "shape-beta")
            assert beta_trace["opacity"] == 1
            assert beta_trace["width"] > alpha_trace["width"]
            assert alpha_trace["opacity"] < 1
        finally:
            browser.close()


def test_plot_hover_highlights_matching_triorb_shape_card(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            document["fieldsets"] = []
            document["triorbShapes"] = [
                _shape_snapshot("shape-alpha", "Alpha Shape", offset_x=0),
                _shape_snapshot("shape-beta", "Beta Shape", offset_x=80),
            ]
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            _open_panel(page, "panel-triorb-shapes")
            page.evaluate(
                """
                () => {
                  const gd = document.getElementById('plot');
                  const trace = gd.data.find((entry) => entry.meta && entry.meta.shapeId === 'shape-beta');
                  gd.emit('plotly_hover', {
                    points: [
                      {
                        data: trace,
                        meta: trace?.meta,
                      },
                    ],
                  });
                }
                """
            )
            page.wait_for_timeout(150)

            assert page.locator(
                '#triorb-shapes-list .triorb-shape-card[data-shape-id="shape-beta"]'
            ).evaluate("node => node.classList.contains('is-hovered')")
        finally:
            browser.close()


def test_fieldset_filter_matches_field_names(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            document["fieldsets"] = [
                {
                    "attributes": {"Name": "Alpha Zone", "NameLatin9Key": "ALPHA", "Index": "0"},
                    "fields": [
                        {
                            "attributes": {
                                "Name": "Shared Field",
                                "Fieldtype": "ProtectiveSafeBlanking",
                            },
                            "shapeRefs": [],
                            "polygons": [],
                            "circles": [],
                            "rectangles": [],
                        }
                    ],
                    "visible": True,
                },
                {
                    "attributes": {"Name": "Beta Zone", "NameLatin9Key": "BETA", "Index": "1"},
                    "fields": [
                        {
                            "attributes": {
                                "Name": "Needle Match",
                                "Fieldtype": "WarningSafeBlanking",
                            },
                            "shapeRefs": [],
                            "polygons": [],
                            "circles": [],
                            "rectangles": [],
                        }
                    ],
                    "visible": True,
                },
            ]
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            _open_panel(page, "panel-fieldsets")
            page.fill("#fieldset-filter-input", "needle")

            fieldset_cards = page.locator("#fieldsets-editor .fieldset-card")
            assert fieldset_cards.count() == 1
            assert "Beta Zone" in page.locator("#fieldsets-editor").inner_text()
            assert "Alpha Zone" not in page.locator("#fieldsets-editor").inner_text()
        finally:
            browser.close()


def test_field_card_hover_highlights_matching_fieldset_traces(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            document["triorbShapes"] = [
                _shape_snapshot("shape-alpha", "Alpha Shape", offset_x=0),
                _shape_snapshot("shape-beta", "Beta Shape", offset_x=80),
            ]
            document["fieldsets"] = [
                {
                    "attributes": {"Name": "Fieldset A", "Index": "0"},
                    "fields": [
                        {
                            "attributes": {
                                "Name": "Field Alpha",
                                "Fieldtype": "ProtectiveSafeBlanking",
                            },
                            "shapeRefs": [{"shapeId": "shape-alpha"}],
                            "polygons": [],
                            "circles": [],
                            "rectangles": [],
                        }
                    ],
                    "visible": True,
                },
                {
                    "attributes": {"Name": "Fieldset B", "Index": "1"},
                    "fields": [
                        {
                            "attributes": {
                                "Name": "Field Beta",
                                "Fieldtype": "ProtectiveSafeBlanking",
                            },
                            "shapeRefs": [{"shapeId": "shape-beta"}],
                            "polygons": [],
                            "circles": [],
                            "rectangles": [],
                        }
                    ],
                    "visible": True,
                },
            ]
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            _open_panel(page, "panel-fieldsets")
            page.locator('.fieldset-card[data-fieldset-index="1"] .fieldset-details').evaluate(
                "node => (node.open = true)"
            )
            page.hover('.field-card[data-fieldset-index="1"][data-field-index="0"]')
            page.wait_for_timeout(150)

            trace_state = page.evaluate(
                """
                () => document.getElementById('plot').data
                  .filter((trace) => trace.meta && Number.isInteger(trace.meta.fieldsetIndex))
                  .map((trace) => ({
                    fieldsetIndex: trace.meta.fieldsetIndex,
                    fieldIndex: trace.meta.fieldIndex,
                    opacity: trace.opacity ?? 1,
                    width: trace.line?.width ?? 0,
                  }))
                """
            )

            alpha_trace = next(
                item
                for item in trace_state
                if item["fieldsetIndex"] == 0 and item["fieldIndex"] == 0
            )
            beta_trace = next(
                item
                for item in trace_state
                if item["fieldsetIndex"] == 1 and item["fieldIndex"] == 0
            )
            assert beta_trace["opacity"] == 1
            assert beta_trace["width"] > alpha_trace["width"]
            assert alpha_trace["opacity"] < 1
        finally:
            browser.close()


def test_plot_hover_highlights_matching_field_card(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            document["triorbShapes"] = [
                _shape_snapshot("shape-alpha", "Alpha Shape", offset_x=0),
                _shape_snapshot("shape-beta", "Beta Shape", offset_x=80),
            ]
            document["fieldsets"] = [
                {
                    "attributes": {"Name": "Fieldset A", "Index": "0"},
                    "fields": [
                        {
                            "attributes": {
                                "Name": "Field Alpha",
                                "Fieldtype": "ProtectiveSafeBlanking",
                            },
                            "shapeRefs": [{"shapeId": "shape-alpha"}],
                            "polygons": [],
                            "circles": [],
                            "rectangles": [],
                        }
                    ],
                    "visible": True,
                },
                {
                    "attributes": {"Name": "Fieldset B", "Index": "1"},
                    "fields": [
                        {
                            "attributes": {
                                "Name": "Field Beta",
                                "Fieldtype": "ProtectiveSafeBlanking",
                            },
                            "shapeRefs": [{"shapeId": "shape-beta"}],
                            "polygons": [],
                            "circles": [],
                            "rectangles": [],
                        }
                    ],
                    "visible": True,
                },
            ]
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            _open_panel(page, "panel-fieldsets")
            page.evaluate(
                """
                () => {
                  const gd = document.getElementById('plot');
                  const trace = gd.data.find(
                    (entry) => entry.meta && entry.meta.fieldsetIndex === 1 && entry.meta.fieldIndex === 0
                  );
                  gd.emit('plotly_hover', {
                    points: [
                      {
                        data: trace,
                        meta: trace?.meta,
                      },
                    ],
                  });
                }
                """
            )
            page.wait_for_timeout(150)

            assert page.locator(
                '.fieldset-card[data-fieldset-index="1"]'
            ).evaluate("node => node.classList.contains('is-hovered')")
            assert page.locator(
                '.field-card[data-fieldset-index="1"][data-field-index="0"]'
            ).evaluate("node => node.classList.contains('is-hovered')")
        finally:
            browser.close()


def test_bulk_edit_buttons_select_all_and_clear(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            base_shapes = copy.deepcopy(document["triorbShapes"][:2])
            if len(base_shapes) == 1:
                duplicate_shape = copy.deepcopy(base_shapes[0])
                duplicate_shape["id"] = "bulk-shape-duplicate"
                base_shapes.append(duplicate_shape)
            document["triorbShapes"] = base_shapes
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            page.click("#btn-bulk-edit")
            page.locator("#bulk-edit-modal").wait_for(state="visible")

            case_buttons = page.locator("#bulk-edit-case-toggles .toggle-pill-btn")
            shape_buttons = page.locator("#bulk-edit-shape-toggles .toggle-pill-btn")

            page.click('[data-bulk-selection-action="all"][data-bulk-selection-target="case"]')
            assert page.locator("#bulk-edit-case-toggles .toggle-pill-btn.active").count() == case_buttons.count()

            page.click('[data-bulk-selection-action="all"][data-bulk-selection-target="shape"]')
            assert page.locator("#bulk-edit-shape-toggles .toggle-pill-btn.active").count() == shape_buttons.count()

            page.click('[data-bulk-selection-action="clear"][data-bulk-selection-target="shape"]')
            assert page.locator("#bulk-edit-shape-toggles .toggle-pill-btn.active").count() == 0
        finally:
            browser.close()


def test_fieldset_device_filter_matches_device_names(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            document["fieldsetDevices"] = copy.deepcopy(document["fieldsetDevices"][:2])
            document["fieldsetDevices"][0]["attributes"]["DeviceName"] = "Left Scanner"
            document["fieldsetDevices"][1]["attributes"]["DeviceName"] = "Right Scanner"
            document["fieldsetDevices"][0]["attributes"]["Typekey"] = "alpha-key"
            document["fieldsetDevices"][1]["attributes"]["Typekey"] = "beta-key"
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            _open_panel(page, "panel-fieldsets")
            page.evaluate("document.getElementById('fieldset-devices-section').open = true")
            page.fill("#fieldset-device-filter-input", "right")

            device_cards = page.locator("#fieldset-devices .device-card")
            assert device_cards.count() == 1
            visible_name = page.locator("#fieldset-devices .fieldset-device-name").input_value()
            assert visible_name == "Right Scanner"
        finally:
            browser.close()


def test_triorb_shape_filter_restores_cards_after_empty_result(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            base_shapes = copy.deepcopy(document["triorbShapes"][:2])
            if len(base_shapes) == 1:
                duplicate_shape = copy.deepcopy(base_shapes[0])
                duplicate_shape["id"] = "shape-filter-duplicate"
                base_shapes.append(duplicate_shape)
            document["triorbShapes"] = base_shapes
            document["triorbShapes"][0]["name"] = "Alpha Shape"
            document["triorbShapes"][1]["name"] = "Beta Shape"
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            _open_panel(page, "panel-triorb-shapes")
            page.fill("#triorb-shape-filter-input", "beta")

            shape_cards = page.locator("#triorb-shapes-list .triorb-shape-card")
            assert shape_cards.count() == 1
            visible_name = page.locator("#triorb-shapes-list .triorb-shape-name").input_value()
            assert visible_name == "Beta Shape"

            page.fill("#triorb-shape-filter-input", "missing-shape")
            assert "No shapes match the current filter." in page.locator(
                "#triorb-shapes-list"
            ).inner_text()

            page.fill("#triorb-shape-filter-input", "")
            assert shape_cards.count() == 2
            restored_names = page.locator("#triorb-shapes-list .triorb-shape-name")
            assert restored_names.nth(0).input_value() == "Alpha Shape"
            assert restored_names.nth(1).input_value() == "Beta Shape"
        finally:
            browser.close()


def test_sick_save_omits_empty_warning_field_trees(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)
            shape_id = document["triorbShapes"][0]["id"]
            document["fieldsets"] = [
                {
                    "attributes": {"Name": "Set A", "Index": "0"},
                    "fields": [
                        {
                            "attributes": {
                                "Name": "Protective Kept",
                                "Fieldtype": "ProtectiveSafeBlanking",
                            },
                            "shapeRefs": [{"shapeId": shape_id}],
                            "polygons": [],
                            "circles": [],
                            "rectangles": [],
                        },
                        {
                            "attributes": {
                                "Name": "Warning Empty",
                                "Fieldtype": "WarningSafeBlanking",
                            },
                            "shapeRefs": [],
                            "polygons": [],
                            "circles": [],
                            "rectangles": [],
                        },
                    ],
                    "visible": True,
                }
            ]

            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )
            xml_text = page.evaluate("window.__triorbTestApi.buildLegacyXml()")

            assert "Protective Kept" in xml_text
            assert "Warning Empty" not in xml_text
        finally:
            browser.close()


def test_loading_real_file_strips_protective_polygon_suffixes(flask_server):
    source_path = Path(__file__).resolve().parents[2] / "TriOrb_1776337392610.sgexml"
    if not source_path.exists():
        pytest.skip(f"Source XML not found: {source_path}")
    xml_text = source_path.read_text(encoding="utf-8")

    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            page.evaluate("xml => window.__triorbTestApi.loadXml(xml)", xml_text)
            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            names = [shape["name"] for shape in _document(snapshot)["triorbShapes"]]

            assert "Stop" in names
            assert "RotCW01" in names
            assert "Co_RotCW01" in names
            assert all(not name.endswith("Protective Polygon") for name in names)
            assert all(not name.endswith("Warning Polygon") for name in names)
        finally:
            browser.close()


def test_real_file_triorb_roundtrip_does_not_inject_default_fieldset_devices(flask_server):
    source_path = Path(__file__).resolve().parents[2] / "TriOrb_1776337392610.sgexml"
    if not source_path.exists():
        pytest.skip(f"Source XML not found: {source_path}")
    xml_text = source_path.read_text(encoding="utf-8")

    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            page.evaluate("xml => window.__triorbTestApi.loadXml(xml)", xml_text)
            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            document = _document(snapshot)

            assert len(document["fieldsetDevices"]) == 2

            document["fieldsetDevices"][0]["attributes"]["DeviceName"] = "Left"
            document["fieldsetDevices"][1]["attributes"]["DeviceName"] = "Right"
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            roundtrip_xml = page.evaluate("window.__triorbTestApi.buildTriOrbXml()")
            page.evaluate("xml => window.__triorbTestApi.loadXml(xml)", roundtrip_xml)
            after = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            after_document = _document(after)

            assert len(after_document["fieldsetDevices"]) == 2
            coords = {
                (
                    device["attributes"].get("PositionX"),
                    device["attributes"].get("PositionY"),
                    device["attributes"].get("Rotation"),
                )
                for device in after_document["fieldsetDevices"]
            }
            assert ("170", "102", "290") not in coords
            assert ("-170", "102", "70") not in coords
        finally:
            browser.close()
