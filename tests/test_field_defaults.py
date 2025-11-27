from __future__ import annotations

import re
from pathlib import Path

from main import create_app


_JS_PATH = Path("static/js/app.js")


def test_default_field_names_constant():
    content = _JS_PATH.read_text(encoding="utf-8")
    assert re.search(
        r"defaultFieldNames\s*=\s*\[\s*\"Protective\"\s*,\s*\"Warning\"\s*\]",
        content,
    )


def test_create_field_modal_default_labels():
    app = create_app()
    client = app.test_client()

    response = client.get("/")
    html = response.get_data(as_text=True)

    assert "Protective Field" in html
    assert "Warning Field" in html
    assert 'placeholder="Protective name"' in html
    assert 'placeholder="Warning name"' in html
