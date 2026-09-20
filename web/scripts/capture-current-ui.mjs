import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.CUE_SCREENSHOT_BASE_URL || "http://127.0.0.1:3112";
const outDir = resolve("../docs/review-screenshots/web/current-ui");
await mkdir(outDir, { recursive: true });

const tasks = [
  ["退去日と入居日を確定する", 0, -35, -28],
  ["引っ越し業者を決める", 0, -30, -25],
  ["転出届と転入届を確認する", 1, -21, -10],
  ["電気・ガス・水道を切り替える", 1, -14, -7],
  ["郵便転送と住所変更を申し込む", 2, -7, -4],
].map(([text, default_priority, relative_start_day, relative_end_day]) => ({ text, default_priority, relative_start_day, relative_end_day }));

const searchResult = {
  id: "moving-japan",
  title: "東京から名古屋への引っ越し手続き",
  domain: "引っ越し",
  context_text: "日本国内で地域をまたいで転居する場合。行政手続きと生活基盤の切り替えをまとめた段取りです。",
  tasks,
  task_groupings: [{ label: "住まい", task_offsets: [0, 1] }, { label: "手続き", task_offsets: [2, 3, 4] }],
  text_matched: true,
};

const shelf = {
  id: "cat-moving",
  title: "猫と暮らす人の引っ越し",
  context: "猫の移動、住環境の切り替え、行政手続きをまとめて確認する状況。",
  forked_from_shelf_id: null,
  is_owned: false,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-07T00:00:00.000Z",
  item_count: 2,
  items: ["猫の移動準備", "賃貸退去の手続き"].map((title, index) => ({
    revision_id: `revision-${index + 1}`,
    position: index,
    revision: {
      id: `revision-${index + 1}`,
      revision: 1,
      title,
      tasks: tasks.slice(index, index + 3).map((task) => ({ title: task.text, ...task, text: undefined })),
      published_at: "2026-09-01T00:00:00.000Z",
      withdrawn_at: null,
    },
  })),
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ja-JP", reducedMotion: "reduce" });
const page = await context.newPage();

await page.route("**/api/search", (route) => route.fulfill({ json: { results: [searchResult], searchDomain: "引っ越し", nextCursor: null } }));
await page.route("**/api/shelves", (route) => route.fulfill({ json: { shelves: [{ ...shelf, items: undefined }] } }));
await page.route("**/api/shelves/cat-moving**", (route) => {
  if (route.request().url().endsWith("/fork")) {
    return route.fulfill({ status: 201, json: { shelf: { ...shelf, id: "forked-cat-moving", title: `${shelf.title}の派生`, is_owned: true, forked_from_shelf_id: shelf.id } } });
  }
  return route.fulfill({ json: { shelf } });
});

await page.goto(baseUrl);
await page.getByLabel("Search query").fill("猫と東京から名古屋へ引っ越す");
await page.getByRole("button", { name: "検索", exact: true }).click();
await page.getByRole("heading", { name: searchResult.title }).waitFor();
await page.screenshot({ path: `${outDir}/01-search-desktop.png`, fullPage: true });

await page.getByRole("button", { name: /猫と暮らす人の引っ越し/ }).click();
await page.getByRole("heading", { name: shelf.title }).waitFor();
await page.screenshot({ path: `${outDir}/02-shelf-detail-desktop.png`, fullPage: true });

await page.getByRole("button", { name: "この状況をもとに作る" }).click();
await page.getByLabel("状況名").waitFor();
await page.screenshot({ path: `${outDir}/03-fork-editor-desktop.png`, fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(baseUrl);
await page.getByRole("heading", { name: searchResult.title }).waitFor();
await page.screenshot({ path: `${outDir}/04-search-mobile.png`, fullPage: true });

await browser.close();
