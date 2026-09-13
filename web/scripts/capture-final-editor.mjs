import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const base = process.env.CUE_SCENARIO_BASE_URL || "http://127.0.0.1:3144";
const output = "../docs/review-screenshots/web/final-web-quality";
const corpus = JSON.parse(await readFile("../docs/review-screenshots/web/search-relevance/preparation-v4.json", "utf8"));
const cuebook = corpus.documents.find(document => document.id === "m-cat");
assert.ok(cuebook);
await mkdir(output, { recursive: true });
const evidence = { scope: "Existing evaluation Cuebook through real BQ API, real Vertex generation; only development identity header supplied. No save or publication.", views: [], errors: [], passed: false };
const browser = await chromium.launch();
try {
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, locale: "ja-JP", reducedMotion: "reduce" });
    const page = await context.newPage();
    const writes = [];
    page.on("pageerror", error => evidence.errors.push(error.message));
    await page.route("**/api/**", route => {
      if (route.request().method() !== "GET") writes.push(new URL(route.request().url()).pathname);
      return route.continue({ headers: { ...route.request().headers(), "x-dev-user-id": corpus.author } });
    });
    await page.goto(`${base}/?cuebook_id=${cuebook.cuebookId}`);
    await expect(page.getByLabel("タイトル", { exact: true })).toHaveValue(cuebook.title, { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/real-editor-${name}.png`, fullPage: true });
    await page.getByRole("tab", { name: "再利用情報", exact: true }).click();
    await page.screenshot({ path: `${output}/real-review-${name}.png`, fullPage: true });
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/shelf-description", { timeout: 60000 });
    await page.getByRole("button", { name: "グループに公開する", exact: true }).click();
    const generated = await pending;
    const result = await generated.json();
    assert.equal(generated.status(), 200);
    await expect(page.getByRole("region", { name: "公開先の確認" }).getByLabel("グループ名", { exact: true })).toHaveValue(result.description.title);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.getByRole("dialog").evaluate(element => element.scrollWidth > element.clientWidth), false);
    }
    await page.setViewportSize(viewport);
    await page.screenshot({ path: `${output}/real-publication-${name}.png` });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "グループに公開する", exact: true })).toBeFocused();
    assert.deepEqual(writes, ["/api/shelf-description"]);
    evidence.views.push({ name, cuebookId: cuebook.cuebookId, generated: result, writes });
    await context.close();
  }
  assert.deepEqual(evidence.errors, []);
  evidence.passed = true;
} finally {
  await browser.close();
  await writeFile(`${output}/real-editor-evidence.json`, JSON.stringify(evidence, null, 2));
}
