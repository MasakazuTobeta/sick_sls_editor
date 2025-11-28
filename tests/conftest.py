from __future__ import annotations

from pathlib import Path
import socket
import subprocess
import sys
import textwrap
import time

import pytest


# pytest 実行時にプロジェクトルートを import path に追加し、`main` などの
# ルートモジュールを確実に解決できるようにする。GitHub Actions では
# ワーキングディレクトリが tests ディレクトリではなくても先頭に入らない
# ことがあり、ModuleNotFoundError が発生していた。
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture
def write_sample_xml(tmp_path: Path):
    """Return a helper that writes a minimal SdImportExport XML file."""

    def _writer(body: str, filename: str = "sample.sgexml") -> Path:
        xml_text = textwrap.dedent(
            f"""\
            <?xml version="1.0" encoding="utf-8"?>
            <SdImportExport>
            {body}
            </SdImportExport>
            """
        ).strip()
        sample_path = tmp_path / filename
        sample_path.write_text(xml_text, encoding="utf-8")
        return sample_path

    return _writer


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
