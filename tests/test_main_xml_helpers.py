from __future__ import annotations

import main


def test_load_menu_items_returns_fallback_when_sample_is_missing(monkeypatch, tmp_path):
    missing_path = tmp_path / "missing.sgexml"
    monkeypatch.setattr(main, "SAMPLE_XML", missing_path)

    items = main.load_menu_items()

    assert items == [
        {"tag": "FileInfo", "summary": "Metadata"},
        {"tag": "Export_ScanPlanes", "summary": "Scan plane definitions"},
        {"tag": "Export_FieldsetsAndFields", "summary": "Fieldsets (placeholder)"},
        {"tag": "Export_CasetablesAndCases", "summary": "Case tables (placeholder)"},
    ]


def test_load_menu_items_summarizes_first_two_attributes(monkeypatch, write_sample_xml):
    sample_path = write_sample_xml(
        """
        <FileInfo Creator="Tool" Version="1.0" Extra="ignored" />
        <Export_ScanPlanes Timestamp="2025-01-01T00:00:00Z" />
        <Export_FieldsetsAndFields />
        """,
    )
    monkeypatch.setattr(main, "SAMPLE_XML", sample_path)

    items = main.load_menu_items()

    assert items[0] == {"tag": "FileInfo", "summary": "Creator=Tool / Version=1.0"}
    assert items[1] == {
        "tag": "Export_ScanPlanes",
        "summary": "Timestamp=2025-01-01T00:00:00Z",
    }
    assert items[2] == {
        "tag": "Export_FieldsetsAndFields",
        "summary": "No additional attributes",
    }


def test_load_fileinfo_fields_returns_tag_value_pairs(monkeypatch, write_sample_xml):
    sample_path = write_sample_xml(
        """
        <FileInfo>
            <ContentId>
                Scanner Complete Export
            </ContentId>
            <Company>Example Corp</Company>
            <CreationToolVersion></CreationToolVersion>
        </FileInfo>
        <Export_ScanPlanes />
        """,
    )
    monkeypatch.setattr(main, "SAMPLE_XML", sample_path)

    fields = main.load_fileinfo_fields()

    assert fields == [
        {"tag": "ContentId", "value": "Scanner Complete Export"},
        {"tag": "Company", "value": "Example Corp"},
        {"tag": "CreationToolVersion", "value": ""},
    ]
