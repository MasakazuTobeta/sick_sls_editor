from __future__ import annotations

from pathlib import Path
import sys
import textwrap

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
