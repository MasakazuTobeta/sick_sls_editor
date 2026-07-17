from __future__ import annotations

from playwright.sync_api import sync_playwright

from tests.conftest import PROJECT_ROOT, SERVER_URL, launch_chromium


def _assert_input_delay_state_and_exports(page, expected: str) -> None:
    document_state = page.evaluate("window.__triorbTestApi.getDocumentState()")
    input_delay_nodes = [
        child
        for child in document_state["casetableConfiguration"]["children"]
        if child.get("tag") == "InputDelay"
    ]
    assert len(input_delay_nodes) == 1
    assert input_delay_nodes[0]["text"] == expected
    expected_xml = f"<InputDelay>{expected}</InputDelay>"
    for builder in ("buildLegacyXml", "buildTriOrbXml"):
        xml_text = page.evaluate(f"window.__triorbTestApi.{builder}()")
        assert xml_text.count("<InputDelay>") == 1
        assert xml_text.count(expected_xml) == 1


def test_new_clears_cases_and_eval_case_assignments(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            before = page.evaluate("window.__triorbTestApi.getDocumentState()")
            assert before["casetableCases"]

            page.locator("#btn-new").click()
            page.wait_for_function(
                "document.querySelector('#status-text').textContent === 'New canvas ready.'"
            )

            document_state = page.evaluate("window.__triorbTestApi.getDocumentState()")
            store_state = page.evaluate("window.__triorbTestApi.getStoreState()")
            assert document_state["casetableCases"] == []
            assert all(
                entry["cases"] == []
                for entry in document_state["casetableEvals"]["evals"]
            )
            assert store_state["assignments"]["caseToggleStates"] == []
            assert store_state["assignments"]["caseFieldAssignments"] == []
            assert page.locator("#casetable-cases .casetable-case-card").count() == 0
            assert "No cases defined." in page.locator("#casetable-cases").inner_text()
            assert page.locator("#case-checkboxes .toggle-pill-btn").count() == 0
        finally:
            browser.close()


def test_svg_cutout_type_change_keeps_shapes_and_serializes_plotly(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            console_errors = []
            page_errors = []
            page.on(
                "console",
                lambda message: console_errors.append(message.text)
                if message.type == "error"
                else None,
            )
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")
            page.locator("#btn-new").click()
            page.locator("#svg-file-input").set_input_files(
                PROJECT_ROOT / "tests" / "data" / "bodies.svg"
            )
            page.wait_for_function(
                "window.__triorbTestApi.getStoreState().shapes.items.length === 23"
            )
            page.wait_for_function(
                "document.querySelector('#plot').data?.filter(trace => trace.meta?.isTriOrbShape).length === 23"
            )
            assert page.evaluate(
                "document.querySelector('#plot').data.filter(trace => trace.meta?.isTriOrbShape).length"
            ) == 23
            page.locator('[data-panel-target="panel-triorb-shapes"]').click()

            page.evaluate(
                """
                () => {
                  const originalReact = window.Plotly.react.bind(window.Plotly);
                  window.__plotlyRenderProbe = { active: 0, maxActive: 0, calls: 0 };
                  window.Plotly.react = (...args) => {
                    const probe = window.__plotlyRenderProbe;
                    probe.active += 1;
                    probe.calls += 1;
                    probe.maxActive = Math.max(probe.maxActive, probe.active);
                    return Promise.resolve(originalReact(...args)).finally(() => {
                      probe.active -= 1;
                    });
                  };
                }
                """
            )

            card = page.locator(".triorb-shape-card").filter(has_text="ID: CutOut").first
            card.scroll_into_view_if_needed()
            trace_count_before = page.evaluate("document.querySelector('#plot').data.length")
            rendered_trace_count_before = page.locator("#plot .scatterlayer .trace").count()

            card.hover()
            page.wait_for_timeout(250)
            page.wait_for_function("window.__plotlyRenderProbe.active === 0")
            assert page.evaluate(
                "document.querySelector('#plot').data"
                ".filter(trace => trace.meta?.isTriOrbShape)"
                ".every(trace => (trace.opacity ?? 1) === 1)"
            )
            kind_select = card.locator(".triorb-shape-kind")
            kind_select.click()
            page.keyboard.press("ArrowDown")
            page.keyboard.press("Enter")
            page.wait_for_timeout(750)
            page.wait_for_function("window.__plotlyRenderProbe.active === 0")
            page.wait_for_function(
                "document.querySelector('#plot').data.every(trace => trace.opacity !== 0.16)"
            )
            assert not card.evaluate("node => node.classList.contains('is-hovered')")
            assert not card.evaluate("node => node.classList.contains('is-selected')")
            page.mouse.move(0, 0)

            shape = page.evaluate(
                "window.__triorbTestApi.getStoreState().shapes.items.find(shape => shape.id === 'CutOut')"
            )
            probe = page.evaluate("window.__plotlyRenderProbe")
            assert shape["kind"] == "CutOut"
            assert shape["polygon"]["Type"] == "CutOut"
            assert page.evaluate("document.querySelector('#plot').data.length") == trace_count_before
            assert page.locator("#plot .scatterlayer .trace").count() == rendered_trace_count_before
            assert probe["calls"] >= 1
            assert probe["maxActive"] == 1
            assert not card.evaluate("node => node.classList.contains('is-selected')")
            assert console_errors == []
            assert page_errors == []
        finally:
            browser.close()


def test_add_fieldset_omits_empty_warning_field(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")
            page.locator("#btn-new").click()

            page.locator("#btn-add-shape-overlay").click()
            page.locator("#create-shape-name").fill("Protective only")
            page.locator("#create-shape-points").fill("(0,0),(100,0),(0,100)")
            page.locator("#create-shape-modal-save").click()
            page.wait_for_function(
                "window.__triorbTestApi.getStoreState().shapes.items.length === 1"
            )

            page.locator("#btn-add-field-overlay").click()
            protective_shape = page.locator(
                "#create-field-shape-list-0-field .create-field-shape-btn"
            ).filter(has_text="Protective only")
            protective_shape.click()
            assert page.locator(
                "#create-field-shape-list-1-field .create-field-shape-btn.active"
            ).count() == 0
            page.locator("#create-field-modal-save").click()

            page.wait_for_function(
                "window.__triorbTestApi.getDocumentState().fieldsets.length === 1"
            )
            fieldset = page.evaluate(
                "window.__triorbTestApi.getDocumentState().fieldsets[0]"
            )
            assert len(fieldset["fields"]) == 1
            assert fieldset["fields"][0]["attributes"]["Fieldtype"] == "ProtectiveSafeBlanking"
            assert fieldset["fields"][0]["shapeRefs"] == [
                {"shapeId": page.evaluate(
                    "window.__triorbTestApi.getStoreState().shapes.items[0].id"
                )}
            ]

            page.locator("#btn-new").click()
            page.locator("#btn-add-shape-overlay").click()
            page.locator("#create-shape-name").fill("Warning only")
            page.locator("#create-shape-fieldtype").select_option("WarningSafeBlanking")
            page.locator("#create-shape-points").fill("(0,0),(120,0),(0,120)")
            page.locator("#create-shape-modal-save").click()
            page.locator("#btn-add-field-overlay").click()
            page.locator(
                "#create-field-shape-list-1-field .create-field-shape-btn"
            ).filter(has_text="Warning only").click()
            page.locator("#create-field-modal-save").click()

            warning_fieldset = page.evaluate(
                "window.__triorbTestApi.getDocumentState().fieldsets[0]"
            )
            assert len(warning_fieldset["fields"]) == 1
            assert warning_fieldset["fields"][0]["attributes"]["Fieldtype"] == "WarningSafeBlanking"
        finally:
            browser.close()


def test_add_empty_fieldset_keeps_only_protective_fallback(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")
            page.locator("#btn-new").click()
            page.locator("#btn-add-field-overlay").click()
            page.locator("#create-field-modal-save").click()

            fieldset = page.evaluate(
                "window.__triorbTestApi.getDocumentState().fieldsets[0]"
            )
            assert len(fieldset["fields"]) == 1
            assert fieldset["fields"][0]["attributes"]["Fieldtype"] == "ProtectiveSafeBlanking"
            assert fieldset["fields"][0]["shapeRefs"] == []

            page.evaluate(
                "document.querySelector('#fieldsets-editor [data-action=\"add-field\"]').click()"
            )
            page.locator("#create-field-modal-save").click()
            assert page.locator("#create-field-modal").get_attribute("aria-hidden") == "false"
            assert "Shape" in page.locator("#status-text").inner_text()
            assert len(page.evaluate(
                "window.__triorbTestApi.getDocumentState().fieldsets[0].fields"
            )) == 1
        finally:
            browser.close()


def test_input_delay_defaults_to_zero_but_preserves_imported_value(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            page = browser.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            assert page.locator("#casetable-config-input-delay").input_value() == "12"
            page.locator("#btn-new").click()
            assert page.locator("#casetable-config-input-delay").input_value() == "0"
            _assert_input_delay_state_and_exports(page, "0")

            missing_delay_xml = b"""
                <SdImportExport>
                  <Export_CasetablesAndCases>
                    <Casetable Index="0">
                      <Configuration>
                        <UseSpeed>false</UseSpeed>
                        <CaseSequenceEnabled>false</CaseSequenceEnabled>
                      </Configuration>
                    </Casetable>
                  </Export_CasetablesAndCases>
                </SdImportExport>
            """
            page.locator("#file-input").set_input_files(
                {
                    "name": "missing-input-delay.sgexml",
                    "mimeType": "application/xml",
                    "buffer": missing_delay_xml,
                }
            )
            page.wait_for_function(
                "document.querySelector('#status-text').textContent.includes('missing-input-delay.sgexml loaded')"
            )
            assert page.locator("#casetable-config-input-delay").input_value() == "0"
            _assert_input_delay_state_and_exports(page, "0")
            configuration_tags = [
                child["tag"]
                for child in page.evaluate(
                    "window.__triorbTestApi.getDocumentState().casetableConfiguration.children"
                )
            ]
            assert configuration_tags.index("UseSpeed") < configuration_tags.index("InputDelay")
            assert configuration_tags.index("InputDelay") < configuration_tags.index("CaseSequenceEnabled")

            explicit_delay_xml = b"""
                <SdImportExport>
                  <Export_CasetablesAndCases>
                    <Casetable Index="0">
                      <Configuration><InputDelay>37</InputDelay></Configuration>
                    </Casetable>
                  </Export_CasetablesAndCases>
                </SdImportExport>
            """
            page.locator("#file-input").set_input_files(
                {
                    "name": "explicit-input-delay.sgexml",
                    "mimeType": "application/xml",
                    "buffer": explicit_delay_xml,
                }
            )
            page.wait_for_function(
                "document.querySelector('#status-text').textContent.includes('explicit-input-delay.sgexml loaded')"
            )
            assert page.locator("#casetable-config-input-delay").input_value() == "37"
            _assert_input_delay_state_and_exports(page, "37")
        finally:
            browser.close()
