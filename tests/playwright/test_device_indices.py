from __future__ import annotations

import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright

from tests.conftest import SERVER_URL, launch_chromium


def test_triorb_save_sequential_device_indices(flask_server):
    with sync_playwright() as playwright:
        browser = launch_chromium(playwright)
        try:
            context = browser.new_context(accept_downloads=True)
            context.add_init_script(
                """
                if (!window.Plotly) {
                  window.Plotly = {
                    react: () => Promise.resolve(),
                    purge: () => {},
                    Plots: { resize: () => {} },
                  };
                }
                if (!HTMLElement.prototype.on) {
                  HTMLElement.prototype.on = function () {};
                }
                """
            )
            page = context.new_page()
            page.goto(SERVER_URL, wait_until="networkidle")
            page.wait_for_function("window.appBootstrapData !== undefined")
            page.wait_for_function("window.__triorbTestApi !== undefined")

            page.locator(".scanplane-details").first.evaluate("node => (node.open = true)")
            page.evaluate(
                "document.querySelector('button[data-action=\"add-device\"]').click()"
            )
            page.wait_for_function(
                "document.querySelectorAll('.scanplane-card .device-card').length >= 2"
            )

            xml_text = page.evaluate("window.__triorbTestApi.buildTriOrbXml()")
            assert xml_text, "TriOrb XML was not captured"

            wrapped = "<Root>" + xml_text.replace('<?xml version=\"1.0\" encoding=\"utf-8\"?>', "") + "</Root>"
            root = ET.fromstring(wrapped)
            devices = root.findall("./SdImportExport/Export_ScanPlanes/ScanPlane/Devices/Device")
            indices = [device.attrib.get("Index") for device in devices]
            assert indices == [str(i) for i in range(len(indices))]
        finally:
            context.close()
            browser.close()
