from playwright.sync_api import sync_playwright
import sys


def run_playwright_test():
    server_url = "http://127.0.0.1:5000/?debug=1"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        errors = []
        page.on("console", lambda msg: errors.append(msg) if msg.type == "error" else None)
        page.goto(server_url, wait_until="networkidle")
        page.fill("#global-multiple-sampling", "5")
        page.fill("#global-resolution", "80")
        page.fill("#global-tolerance-positive", "3")
        page.fill("#global-tolerance-negative", "2")
        page.wait_for_timeout(500)
        first_field_multiple = page.locator(
            'input.field-attr[data-field="MultipleSampling"]'
        ).first
        if first_field_multiple.input_value() != "5":
            raise AssertionError("MultipleSampling did not update on Fieldset input.")
        resolution_field = page.locator(
            'input.field-attr[data-field="Resolution"]'
        ).first
        if resolution_field.input_value() != "80":
            raise AssertionError("Resolution did not sync to Fieldset.")
        positive_field = page.locator(
            'input.field-attr[data-field="TolerancePositive"]'
        ).first
        negative_field = page.locator(
            'input.field-attr[data-field="ToleranceNegative"]'
        ).first
        if positive_field.input_value() != "3" or negative_field.input_value() != "2":
            raise AssertionError("Tolerance values did not propagate.")
        buttons = [
            "#btn-new",
            "#btn-save",
            "#btn-toggle-legend",
            "#btn-fieldset-check-all",
            "#btn-fieldset-uncheck-all",
            "#btn-triorb-shape-check-all",
            "#btn-triorb-shape-uncheck-all",
        ]
        for selector in buttons:
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
