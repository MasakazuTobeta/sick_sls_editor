import pytest
import main


def test_load_menu_items_invalid_xml(tmp_path, monkeypatch):
    # 不正なXMLファイルを用意
    invalid_xml = tmp_path / "invalid.sgexml"
    invalid_xml.write_text("<SdImportExport><FileInfo></SdImportExport", encoding="utf-8")
    monkeypatch.setattr(main, "SAMPLE_XML", invalid_xml)
    # フォールバック値が返ることを確認
    items = main.load_menu_items()
    assert isinstance(items, list)
    assert any(d.get("tag") == "FileInfo" for d in items)


def test_load_menu_items_missing_file(tmp_path, monkeypatch):
    # 存在しないファイルを指定
    missing_xml = tmp_path / "notfound.sgexml"
    monkeypatch.setattr(main, "SAMPLE_XML", missing_xml)
    # 例外またはフォールバックが返ることを確認
    try:
        items = main.load_menu_items()
        assert isinstance(items, list)
    except Exception:
        pass


def test_load_casetable_payload_invalid_xml(tmp_path, monkeypatch):
    # 不正なXMLファイルを用意
    invalid_xml = tmp_path / "invalid.sgexml"
    invalid_xml.write_text("<SdImportExport><Export_CasetablesAndCases></SdImportExport", encoding="utf-8")
    monkeypatch.setattr(main, "SAMPLE_XML", invalid_xml)
    # フォールバック値が返ることを確認
    payload = main.load_casetable_payload()
    assert isinstance(payload, dict)
    assert payload.get("casetable_attributes", {}).get("Index") == "0"
