import { expect, test } from "@playwright/test";

const EXPO = process.env.POCKET_EXPO_URL ?? "http://127.0.0.1:8081";

/**
 * Boot proof: every route must render without a console error. Cheap guard
 * against a bad Tamagui token/theme name, which fails at runtime rather than
 * at typecheck.
 */
const ROUTES = ["/", "/onboarding", "/agents/all", "/hosts", "/pair", "/github", "/repos/add"];

for (const route of ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(String(err)));

    await page.goto(`${EXPO}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    expect(errors, `console errors on ${route}`).toEqual([]);
    await expect(page.locator("#root")).not.toBeEmpty();
  });
}
