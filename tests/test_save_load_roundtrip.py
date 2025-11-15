from __future__ import annotations

import socket
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright
from playwright._impl._errors import Error as PlaywrightError


FLASK_PORT = 5001
SERVER_URL = f"http://127.0.0.1:{FLASK_PORT}/?debug=1"
_SERVER_START_TIMEOUT = 15


def _wait_for_port(port: int, host: str = "127.0.0.1", timeout: float = _SERVER_START_TIMEOUT) -> None:
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(1)
            try:
                sock.connect((host, port))
                return
            except OSError:
                time.sleep(0.2)
    raise TimeoutError(f"Unable to reach {host}:{port} within {timeout:.1f}s")


def _normalize_xml(xml: str) -> str:
    root = ET.fromstring(xml)
    root.attrib.pop("Timestamp", None)
    return ET.tostring(root, encoding="unicode")


@pytest.fixture(scope="session")
def flask_server():
    cmd = [
        sys.executable,
        "-u",
        "-c",
        "from main import create_app; create_app().run(port=5001)",
    ]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        cwd=Path(__file__).resolve().parents[1],
    )
    try:
        _wait_for_port(FLASK_PORT)
        yield
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()


def _capture_sick_xml(page):
    with page.expect_download() as download_info:
        page.click("#btn-save-sick")
    download = download_info.value
    file_path = Path(download.path())
    return file_path.read_text(encoding="utf-8")


def _upload_and_wait(page, xml_path: Path):
    page.set_input_files("#file-input", str(xml_path))
    page.wait_for_function("document.querySelector('#status-text').textContent.includes('loaded')")


def test_save_load_roundtrip(flask_server, tmp_path: Path):
    # sample/ScannerDTM-Export_Mini.sgexml を初期データとして使う
    import shutil
    sample_path = Path(__file__).resolve().parents[1] / "sample" / "ScannerDTM-Export_Mini.sgexml"
    assert sample_path.exists(), f"Sample XML not found: {sample_path}"
    first_path = tmp_path / "initial.sgexml"
    shutil.copy(sample_path, first_path)
    normalized_path = tmp_path / "normalized.sgexml"
    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(headless=True)
        except PlaywrightError as exc:  # pragma: no cover - depends on env setup
            message = str(exc)
            if "Executable doesn't exist" in message or "playwright install" in message:
                pytest.skip(
                    "Playwright Chromium がインストールされていないためスキップ。"
                    "CI で実行する場合は 'playwright install --with-deps chromium' を事前に実行してください。"
                )
            raise
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")


            # 1回目: サンプルXMLをアップロード
            _upload_and_wait(page, first_path)
            first_xml = _capture_sick_xml(page)
            # プロジェクト直下（tests/）にも保存
            first_saved = Path(__file__).parent / "evidence_saved_1st.sgexml"
            first_saved.write_text(first_xml, encoding="utf-8")
            first_path.write_text(first_xml, encoding="utf-8")

            # 2回目: 1回目の保存XMLを再アップロード
            _upload_and_wait(page, first_path)
            normalized_xml = _capture_sick_xml(page)
            # プロジェクト直下（tests/）にも保存
            second_saved = Path(__file__).parent / "evidence_saved_2nd.sgexml"
            second_saved.write_text(normalized_xml, encoding="utf-8")
            normalized_path.write_text(normalized_xml, encoding="utf-8")

            # 3回目: 2回目の保存XMLを再アップロード
            _upload_and_wait(page, normalized_path)
            repeat_xml = _capture_sick_xml(page)

            # 2回目と3回目の保存結果が一致することを検証
            assert _normalize_xml(normalized_xml) == _normalize_xml(repeat_xml)
        finally:
            browser.close()
