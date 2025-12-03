from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

from tests.conftest import SERVER_URL, launch_chromium


def _capture_sick_xml(page):
    with page.expect_download() as download_info:
        page.click("#btn-save-sick")
    download = download_info.value
    file_path = Path(download.path())
    return file_path.read_text(encoding="utf-8")


def _upload_and_wait(page, xml_path: Path):
    page.set_input_files("#file-input", str(xml_path))
    page.wait_for_function("document.querySelector('#status-text').textContent.includes('loaded')")


def _extract_polygon_points(xml_text: str):
    root = ET.fromstring(xml_text)
    field = root.find(
        ".//Export_FieldsetsAndFields/ScanPlane/Fieldsets/Fieldset[@Name='Min10']/Field[@Name='Protective']"
    )
    assert field is not None, "Min10/Protective フィールドが見つかりません"
    return [
        [
            (point.attrib.get("X"), point.attrib.get("Y"))
            for point in polygon.findall("Point")
        ]
        for polygon in field.findall("Polygon")
    ]


def test_shape_added_to_legacy_export_is_saved(flask_server):
    sample_path = Path(__file__).parent / "data" / "legacy_min10.sgexml"
    assert sample_path.exists(), "テスト用レガシーXMLが見つかりません"

    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")

            _upload_and_wait(page, sample_path)

            page.click("#btn-add-shape-overlay")
            page.wait_for_selector("#create-shape-modal[aria-hidden='false']")
            page.fill("#create-shape-name", "Playwright Polygon")
            page.fill("#create-shape-points", "(0,0),(100,0),(0,50)")
            page.locator("#create-shape-fieldset-list").get_by_role("button", name="Min10").click()
            page.click("#create-shape-modal-save")

            xml_text = _capture_sick_xml(page)
            polygons = _extract_polygon_points(xml_text)
            assert polygons, "新規ShapeがXMLに出力されていません"
            assert ("0", "50") in polygons[0], "Polygonポイントが保存されていません"
        finally:
            browser.close()
