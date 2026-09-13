import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = process.env.CUE_CAPTURE_DIR || "../docs/review-screenshots/web/search-relevance";
await mkdir(root, { recursive: true });
const users = JSON.parse(await readFile("../docs/review-screenshots/web/residual-fixes/data-evidence.json", "utf8"));
const browser = await chromium.launch();
const evidence = { scope: "Real local Web UI and search API; only development UID header supplied. No fulfilled/mock API responses.", checks: [] };
try {
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, locale: "ja-JP", reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.route("**/api/**", route => route.continue({ headers: { ...route.request().headers(), "x-dev-user-id": users.neutral } }));
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(process.env.CUE_SCENARIO_BASE_URL || "http://127.0.0.1:3135/");
    await page.getByLabel("Search query").fill("子どもの転校を伴う東京から名古屋への引っ越し");
    const pending = page.waitForResponse(r => r.url().endsWith("/api/search") && r.request().method() === "POST", { timeout: 90000 });
    await page.getByRole("button", { name: "検索", exact: true }).click();
    const response = await pending;
    const body = await response.json();
    assert.equal(response.status(), 200);
    assert.equal(body.results.length, 7);
    await page.locator(".search-result-item").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator(".search-result-item").count(), 7);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.screenshot({ path: `${root}/real-search-${name}.png`, fullPage: true });
    await page.screenshot({ path: `${root}/real-search-${name}-viewport.png` });
    await page.locator(".search-result-item h2 button").first().click();
    await page.locator(".search-result-item .read-task-list").first().waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.screenshot({ path: `${root}/real-detail-${name}.png` });
    assert.deepEqual(errors, []);
    evidence.checks.push({ name, viewport, body, errors, passed: true });
    await context.close();
  }
} finally {
  await writeFile(`${root}/screenshots.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await browser.close();
}
