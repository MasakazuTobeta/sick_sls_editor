from __future__ import annotations

import main


def test_load_casetable_payload_returns_fallback_when_sample_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "SAMPLE_XML", tmp_path / "missing.sgexml")

    payload = main.load_casetable_payload()

    assert payload["casetable_attributes"]["Index"] == "0"
    assert payload["cases"] == []
    assert payload["layout"] == [
        {"kind": "configuration"},
        {"kind": "cases"},
        {"kind": "evals"},
        {"kind": "fields_configuration"},
    ]


def test_load_casetable_payload_serializes_cases_and_evals(
    monkeypatch, write_sample_xml
):
    sample_path = write_sample_xml(
        """
        <Export_ScanPlanes>
            <ScanPlane Index="0" Name="Plane A">
                <Devices>
                    <Device Index="1" Typekey="NANS3-TEST" />
                </Devices>
            </ScanPlane>
        </Export_ScanPlanes>
        <Export_CasetablesAndCases>
            <Casetable Index="0" Name="Main">
                <Configuration>
                    <ConfigItem Key="Foo" Value="Bar" />
                </Configuration>
                <Cases>
                    <Case Name="CaseA" Index="1">
                        <StaticInputs>
                            <StaticInput>
                                <Match>High</Match>
                            </StaticInput>
                        </StaticInputs>
                        <SpeedActivation Mode="Auto" />
                        <ExtraNode Flag="1" />
                    </Case>
                </Cases>
                <Evals>
                    <Eval Index="10">
                        <Name>Eval One</Name>
                        <NameLatin9Key>KEY</NameLatin9Key>
                        <Q>42</Q>
                        <Reset>
                            <ResetType>Auto</ResetType>
                        </Reset>
                        <PermanentPreset>
                            <ScanPlanes>
                                <ScanPlane Orientation="Horizontal">
                                    <FieldMode>Protective</FieldMode>
                                </ScanPlane>
                            </ScanPlanes>
                        </PermanentPreset>
                        <Cases>
                            <Case Index="5">
                                <ScanPlanes>
                                    <ScanPlane Axis="X">
                                        <UserFieldId>UF1</UserFieldId>
                                        <IsSplitted>true</IsSplitted>
                                    </ScanPlane>
                                </ScanPlanes>
                            </Case>
                        </Cases>
                    </Eval>
                </Evals>
                <FieldsConfiguration Enabled="true" />
            </Casetable>
        </Export_CasetablesAndCases>
        """,
        filename="casetable.sgexml",
    )
    monkeypatch.setattr(main, "SAMPLE_XML", sample_path)

    payload = main.load_casetable_payload()

    assert payload["casetable_attributes"]["Name"] == "Main"
    assert payload["configuration"]["tag"] == "Configuration"
    assert payload["fields_configuration"]["tag"] == "FieldsConfiguration"
    assert {segment["kind"] for segment in payload["layout"]} >= {
        "configuration",
        "cases",
        "evals",
        "fields_configuration",
    }

    case_entry = payload["cases"][0]
    assert case_entry["attributes"]["Name"] == "CaseA"
    assert case_entry["static_inputs"][0]["value_key"] == "Match"
    assert case_entry["static_inputs"][0]["attributes"]["Match"] == "High"
    assert case_entry["speed_activation"]["mode_key"] == "Mode"
    assert any(segment["kind"] == "node" for segment in case_entry["layout"])

    eval_entry = payload["evals"]["evals"][0]
    assert eval_entry["name"] == "Eval One"
    assert eval_entry["reset"]["resetType"] == "Auto"
    assert eval_entry["cases"][0]["scanPlane"]["userFieldId"] == "UF1"
    assert eval_entry["permanentPreset"]["fieldMode"] == "Protective"


def test_load_scan_planes_returns_devices(monkeypatch, write_sample_xml):
    sample_path = write_sample_xml(
        """
        <Export_ScanPlanes>
            <ScanPlane Index="0" Name="Plane A" MultipleSampling="2">
                <Devices>
                    <Device Index="1" Typekey="NANS3-TEST" />
                </Devices>
            </ScanPlane>
        </Export_ScanPlanes>
        """,
    )
    monkeypatch.setattr(main, "SAMPLE_XML", sample_path)

    scan_planes = main.load_scan_planes()

    assert scan_planes == [
        {
            "attributes": {"Index": "0", "Name": "Plane A", "MultipleSampling": "2"},
            "devices": [{"attributes": {"Index": "1", "Typekey": "NANS3-TEST"}}],
        }
    ]
