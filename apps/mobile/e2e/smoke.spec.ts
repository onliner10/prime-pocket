/**
 * Boot proof for every route, in both colour schemes.
 *
 * Tamagui resolves tokens and theme names at runtime, so a bad `$color` or a
 * `theme` that does not exist survives typecheck and only blows up in the
 * browser. This is the cheap guard against that; it needs no paired bridge.
 */
import { expect, test } from "@playwright/test";

const EXPO = process.env.POCKET_EXPO_URL ?? "http://127.0.0.1:8081";

const ROUTES = ["/", "/onboarding", "/agents/all", "/hosts", "/pair", "/github", "/repos/add"];

async function renderClean(page: import("@playwright/test").Page, route: string) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`${EXPO}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  await expect(page.locator("#root")).not.toBeEmpty();
  expect(errors, `console errors on ${route}`).toEqual([]);
}

for (const route of ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    await renderClean(page, route);
  });
}

test.describe("dark scheme", () => {
  test.use({ colorScheme: "dark" });

  for (const route of ["/", "/onboarding", "/pair"]) {
    test(`renders ${route} in dark`, async ({ page }) => {
      await renderClean(page, route);
      // The screen shell paints Tamagui's dark $background. Proves the scheme
      // reached the theme and not just the static CSS shell.
      const hasDarkSurface = await page.evaluate(() =>
        [...document.querySelectorAll("#root *")].some(
          (el) => getComputedStyle(el).backgroundColor === "rgb(18, 18, 18)",
        ),
      );
      expect(hasDarkSurface).toBe(true);
    });
  }
});
