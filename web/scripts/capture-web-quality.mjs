import { chromium } from "@playwright/test";
import { resolve } from "node:path";

const baseUrl = process.env.CUE_SCREENSHOT_BASE_URL || "http://127.0.0.1:3111";
const output = (name) => resolve("../docs/review-screenshots/web/e2e", name);
const browser = await chromium.launch();

try {
  const searchContext = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    locale: "ja-JP",
    reducedMotion: "reduce",
  });
  const searchPage = await searchContext.newPage();
  await searchPage.goto(baseUrl);
  await searchPage.screenshot({ path: output("01-empty-desktop.png"), fullPage: true });
  await searchPage.setViewportSize({ width: 390, height: 844 });
  await searchPage.screenshot({ path: output("08-empty-mobile.png"), fullPage: true });
  await searchPage.setViewportSize({ width: 1440, height: 1050 });
  await searchPage.getByLabel("Search query").fill("東京から名古屋へ引っ越す。役所、ライフライン、郵便転送、住所変更を整理したい。");
  await searchPage.locator("form").getByRole("button", { name: "検索", exact: true }).click();
  await searchPage.locator(".cue-result").first().waitFor({ timeout: 45_000 });
  await searchPage.screenshot({ path: output("02-search-results-desktop.png"), fullPage: true });

  await searchPage.setViewportSize({ width: 390, height: 844 });
  await searchPage.screenshot({ path: output("05-search-results-mobile.png"), fullPage: true });

  await searchPage.setViewportSize({ width: 1440, height: 1050 });
  await searchPage.locator(".import-action").first().click();
  await searchPage.locator("#target-anchor-day").fill("2026-10-01");
  await searchPage.getByRole("button", { name: "Androidに取り込む", exact: true }).click();
  await searchPage.locator(".handoff-panel").waitFor({ timeout: 15_000 });
  await searchPage.screenshot({ path: output("03-import-ready-desktop.png"), fullPage: true });
  await searchContext.close();

  const saveContext = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    locale: "ja-JP",
    reducedMotion: "reduce",
  });
  const savePage = await saveContext.newPage();
  await savePage.goto(baseUrl);
  await savePage.locator(".product-rail").getByRole("button", { name: "公開" }).click();
  await savePage.locator("#save-title").fill("東京から名古屋への引っ越し手続き");
  const taskTitles = [
    "退去日と入居日を確定する",
    "転出届と転入届の提出先を確認する",
    "電気、ガス、水道、郵便転送を申し込む",
  ];
  for (const [index, title] of taskTitles.entries()) {
    await savePage.getByLabel(`Task ${index + 1}`).fill(title);
  }
  await savePage.getByLabel("Start date 1").fill("2026-08-01");
  await savePage.getByLabel("End date 1").fill("2026-08-08");
  await savePage.getByLabel("Start date 2").fill("2026-08-15");
  await savePage.getByLabel("End date 2").fill("2026-08-22");
  await savePage.getByLabel("Start date 3").fill("2026-08-22");
  await savePage.getByLabel("End date 3").fill("2026-09-01");
  await savePage.getByRole("button", { name: "検索情報を準備" }).click();
  await savePage.getByLabel("Group label 1").waitFor({ timeout: 30_000 });
  await savePage.screenshot({ path: output("04-save-review-desktop.png"), fullPage: true });
  await savePage.setViewportSize({ width: 390, height: 844 });
  await savePage.screenshot({ path: output("06-android-save-handoff-mobile.png"), fullPage: true });
  await saveContext.close();
} finally {
  await browser.close();
}
