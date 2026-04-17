from playwright.sync_api import sync_playwright
import sys
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from tests.conftest import SERVER_URL, launch_chromium


def run_playwright_test():
    # Flask サーバーを別プロセスで起動している前提で、
    # TriOrb のグローバル入力が Fieldset に伝播するかを最小限確認する。
    server_url = os.environ.get("PLAYWRIGHT_SERVER_URL", SERVER_URL)
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page()
        errors = []
        page.on("console", lambda msg: errors.append(msg) if msg.type == "error" else None)
        page.goto(server_url, wait_until="networkidle")
        page.evaluate("document.querySelector('[data-panel-target=\"panel-triorb-settings\"]').click()")
        page.evaluate("document.querySelector('[data-panel-target=\"panel-fieldsets\"]').click()")
        page.locator(".fieldset-details").first.evaluate("node => (node.open = true)")
        page.locator(".field-details").first.evaluate("node => (node.open = true)")
        page.fill("#global-multiple-sampling", "5")
        page.fill("#global-resolution", "80")
        page.fill("#global-tolerance-positive", "3")
        page.fill("#global-tolerance-negative", "2")
        page.wait_for_timeout(500)
        first_field_multiple = page.locator(
            '.field-attribute:has(label:text("MultipleSampling")) input'
        ).first
        if first_field_multiple.input_value() != "5":
            raise AssertionError("MultipleSampling did not update on Fieldset input.")
        resolution_field = page.locator(
            '.field-attribute:has(label:text("Resolution")) input'
        ).first
        if resolution_field.input_value() != "80":
            raise AssertionError("Resolution did not sync to Fieldset.")
        positive_field = page.locator(
            '.field-attribute:has(label:text("TolerancePositive")) input'
        ).first
        negative_field = page.locator(
            '.field-attribute:has(label:text("ToleranceNegative")) input'
        ).first
        if positive_field.input_value() != "3" or negative_field.input_value() != "2":
            raise AssertionError("Tolerance values did not propagate.")
        buttons = [
            "#btn-new",
            "#btn-save-triorb",
            "#btn-save-sick",
            "#btn-toggle-legend",
            "#btn-fieldset-check-all",
            "#btn-fieldset-uncheck-all",
            "#btn-triorb-shape-check-all",
            "#btn-triorb-shape-uncheck-all",
        ]
        for selector in buttons:
            # ボタン表示状態は UI の条件によって変わるため、存在チェックの上で順番にクリックする。
            if page.is_visible(selector):
                page.click(selector)
                page.wait_for_timeout(200)
        if errors:
            raise AssertionError("Playwright logged console errors: " + "; ".join(err.text for err in errors))
        browser.close()


if __name__ == "__main__":
    try:
        run_playwright_test()
    except AssertionError as exc:
        print(f"Playwright test failure: {exc}")
        sys.exit(1)
    except Exception as exc:
        message = str(exc).encode("ascii", "replace").decode("ascii")
        print(f"Playwright test error: {message}")
        sys.exit(2)
    print("Playwright sanity test passed.")
