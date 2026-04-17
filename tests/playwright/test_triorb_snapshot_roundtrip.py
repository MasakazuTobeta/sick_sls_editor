from __future__ import annotations

import copy
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from tests.conftest import SERVER_URL, launch_chromium


def _normalize_snapshot(snapshot: dict) -> dict:
    normalized = copy.deepcopy(snapshot)
    return normalized


def test_bootstrap_keeps_default_fieldset_devices(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            coords = {
                (
                    device["attributes"].get("PositionX"),
                    device["attributes"].get("PositionY"),
                    device["attributes"].get("Rotation"),
                )
                for device in snapshot["fieldsetDevices"]
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
            assert snapshot["triorbShapes"], "Expected at least one TriOrb shape in bootstrap data"
            assert snapshot["fieldsets"], "Expected at least one fieldset in bootstrap data"
            assert snapshot["scanPlanes"], "Expected at least one scanplane in bootstrap data"

            base_shape = copy.deepcopy(snapshot["triorbShapes"][0])
            duplicate_shape = copy.deepcopy(base_shape)
            duplicate_shape["id"] = "shape-duplicate"
            duplicate_shape["name"] = "Exact Duplicate"
            snapshot["triorbShapes"].append(duplicate_shape)

            first_field = snapshot["fieldsets"][0]["fields"][0]
            first_field.setdefault("shapeRefs", [])
            first_field["shapeRefs"].append({"shapeId": "shape-duplicate"})

            scan_device = copy.deepcopy(snapshot["scanPlanes"][0]["devices"][0])
            scan_device["attributes"]["Index"] = "1"
            scan_device["attributes"]["DeviceName"] = "Left"
            snapshot["scanPlanes"][0]["devices"] = [
                {
                    "attributes": {
                        **scan_device["attributes"],
                        "Index": "0",
                        "DeviceName": "Right",
                    }
                },
                scan_device,
            ]

            fieldset_device = copy.deepcopy(snapshot["fieldsetDevices"][0])
            fieldset_device["attributes"]["DeviceName"] = "Left"
            snapshot["fieldsetDevices"] = [
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
            snapshot["triorbShapes"] = []
            for index in range(4):
                snapshot["triorbShapes"].append(
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


def test_sick_save_omits_empty_warning_field_trees(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            snapshot = page.evaluate("window.__triorbTestApi.getStateSnapshot()")
            shape_id = snapshot["triorbShapes"][0]["id"]
            snapshot["fieldsets"] = [
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
            names = [shape["name"] for shape in snapshot["triorbShapes"]]

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

            assert len(snapshot["fieldsetDevices"]) == 2

            snapshot["fieldsetDevices"][0]["attributes"]["DeviceName"] = "Left"
            snapshot["fieldsetDevices"][1]["attributes"]["DeviceName"] = "Right"
            page.evaluate(
                "snapshot => window.__triorbTestApi.restoreStateSnapshot(snapshot)",
                snapshot,
            )

            roundtrip_xml = page.evaluate("window.__triorbTestApi.buildTriOrbXml()")
            page.evaluate("xml => window.__triorbTestApi.loadXml(xml)", roundtrip_xml)
            after = page.evaluate("window.__triorbTestApi.getStateSnapshot()")

            assert len(after["fieldsetDevices"]) == 2
            coords = {
                (
                    device["attributes"].get("PositionX"),
                    device["attributes"].get("PositionY"),
                    device["attributes"].get("Rotation"),
                )
                for device in after["fieldsetDevices"]
            }
            assert ("170", "102", "290") not in coords
            assert ("-170", "102", "70") not in coords
        finally:
            browser.close()
