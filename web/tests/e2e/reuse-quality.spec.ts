import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";

// These are UI contract tests, not evidence of BQ/Firestore/Android integration.
const tasks = Array.from({ length: 6 }, (_, i) => ({
  id: `source-task-${i}`,
  text: ["転居先の条件と入居日を確認する", "引っ越し業者と猫の移動方法を決める", "通院記録と必要な薬をまとめる", "電気・水道の手続きをする", "郵便の転送を申し込む", "鍵を受け取る"][i],
  default_priority: i === 0 ? 0 : null,
  relative_start_day: i === 0 ? -30 : null,
  relative_end_day: i === 0 ? -21 : i === 5 ? 0 : -7,
}));
const result = {
  id: "public-list", title: "猫と暮らす家の引っ越し", domain: "引っ越し",
  context_text: "猫2匹と、東京から名古屋へ。賃貸の退去とペットの移動を含む引っ越し準備。",
  tasks, task_groupings: [{ label: "引っ越し準備", task_offsets: [0, 1, 2, 3, 4, 5] }], text_matched: true,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/memberships", (route) => route.fulfill({ json: { shelf_ids: [] } }));
  await page.route("**/api/cuebooks/*", (route) => route.fulfill({ json: { cuebook: { ...route.request().postDataJSON().content, id: "owned", origin_revision_id: null, updated_at: "2026-09-12T00:00:00.000000Z" } } }));
  await page.route("**/api/shelves", (route) => route.fulfill({ json: { shelves: [] } }));
  await page.route("**/api/search", (route) => route.fulfill({ json: { results: [result], nextCursor: null, searchDomain: "引っ越し" } }));
  await page.route("**/api/runs/completed", (route) => route.fulfill({ json: { run: { title: result.title, run_id: "completed", task_ids: tasks.map((_, i) => `task-${i}`), source_anchor_day: "2026-10-30", tasks } } }));
  await page.route("**/api/task-list-enrichment", (route) => route.fulfill({ json: { enrichment: { domain: result.domain, context_text: result.context_text, task_groupings: result.task_groupings } } }));
});

async function openEditor(page: Page) {
  await page.goto("/?run_id=completed");
  await page.getByRole("button", { name: "再利用用に整える", exact: true }).click();
}

async function search(page: Page) {
  await page.getByLabel("Search query").fill("猫2匹と東京から名古屋へ引っ越す");
  await page.locator(".search-composer").getByRole("button", { name: "検索", exact: true }).click();
}

async function capture(page: Page, name: string, info: TestInfo) {
  if (!process.env.CUE_CAPTURE_DIR) return;
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.resolve(process.env.CUE_CAPTURE_DIR, `${name}-${info.project.name}.png`), fullPage: await page.getByRole("dialog").count() === 0 });
}

test("W02/C04: expand and inspect without completion controls; close restores focus", async ({ page }, info) => {
  await page.goto("/");
  await capture(page, "search", info);
  await search(page);
  const card = page.locator(".search-result-item");
  await expect(card).toBeVisible();
  await expect(card.locator(".task-preview li")).toHaveCount(3);
  await card.getByRole("button", { name: "全6件を見る" }).click();
  await expect(card.getByText("鍵を受け取る", { exact: true })).toBeVisible();
  await capture(page, "results-expanded", info);
  const detailButton = card.getByRole("button", { name: "内容を見る" });
  await detailButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".read-task-list > li")).toHaveCount(6);
  await expect(dialog).toContainText("最終日の30日前〜3週間前");
  await expect(dialog).toContainText("当日まで");
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByText("未設定", { exact: true })).toHaveCount(0);
  if (info.project.name === "mobile") {
    const bounds = await dialog.boundingBox();
    expect(bounds?.x).toBe(0);
    expect(bounds?.y).toBe(0);
    expect(bounds?.width).toBe(page.viewportSize()!.width);
  }
  await capture(page, "detail", info);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(detailButton).toBeFocused();
  await expect(card.getByRole("button", { name: "折りたたむ" })).toHaveAttribute("aria-expanded", "true");
});

test("W17/W18: loading and failed requests never appear as zero results", async ({ page }, info) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/search", async (route) => { await wait; await route.fulfill({ status: 503, json: { error: "unavailable" } }); });
  await page.goto("/");
  await search(page);
  await expect(page.getByRole("region", { name: "検索結果" })).toHaveAttribute("aria-busy", "true");
  await expect(page.getByText("条件に合うリストはありません")).toHaveCount(0);
  await capture(page, "search-loading", info);
  release();
  await expect(page.locator(".error-banner")).toContainText("検索に失敗しました");
  await expect(page.getByText("条件に合うリストはありません")).toHaveCount(0);
  await expect(page.getByLabel("Search query")).toHaveValue(/猫2匹/);
  await capture(page, "search-error", info);
  await page.route("**/api/search", (route) => route.fulfill({ json: { results: [], nextCursor: null } }));
  await page.getByRole("button", { name: "再検索", exact: true }).click();
  await expect(page.getByText("条件に合うリストはありません")).toBeVisible();
  await expect(page.locator(".error-banner")).toHaveCount(0);
  await capture(page, "search-empty", info);
});

test("W18-2: paging fails once, retains results, retries only on request, deduplicates", async ({ page }, info) => {
  let pages = 0;
  await page.route("**/api/search", async (route) => {
    const request = route.request().postDataJSON();
    if (!request.cursor) return route.fulfill({ json: { results: [result], nextCursor: "page-2" } });
    pages++;
    if (pages === 1) return route.fulfill({ status: 503, json: { error: "unavailable" } });
    return route.fulfill({ json: { results: [result, { ...result, id: "second", title: "住所変更の手続き" }], nextCursor: null } });
  });
  await page.goto("/"); await search(page);
  await expect(page.locator(".search-result-item")).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator(".error-banner")).toContainText("続きを読み込めませんでした");
  await expect(page.locator(".search-result-item")).toHaveCount(1);
  await page.waitForTimeout(700);
  expect(pages).toBe(1);
  await capture(page, "paging-error", info);
  await page.getByRole("button", { name: "続きを再読込" }).click();
  await expect(page.locator(".search-result-item")).toHaveCount(2);
  expect(pages).toBe(2);
});

test("W12-6: direct cells edit, validate, preserve null, reorder independently, undo and restore", async ({ page }, info) => {
  await openEditor(page);
  await expect(page.getByRole("heading", { name: "再利用用に整える" })).toBeVisible();
  await expect(page.getByText("基準日", { exact: true })).toHaveCount(0);
  await expect(page.locator(".inline-task-editor").getByRole("checkbox")).toHaveCount(0);
  await capture(page, "editor", info);
  if (info.project.name === "desktop") {
    const bodyWidth = (await page.locator(".task-text-cell").first().boundingBox())!.width;
    const rowWidth = (await page.locator(".editable-task-row").first().boundingBox())!.width;
    expect(bodyWidth).toBeGreaterThan(550);
    expect(bodyWidth / rowWidth).toBeGreaterThan(0.55);
  }
  const text = page.getByLabel("1件目のタスク", { exact: true });
  await text.fill("入居条件と鍵の受け取り日を確認する");
  await text.press("Enter");
  await page.getByRole("button", { name: /^1件目の日程:/ }).click();
  await expect(page.getByLabel("開始（最終日から）", { exact: true })).toBeFocused();
  await page.getByLabel("開始（最終日から）", { exact: true }).fill("3");
  await expect(page.getByText("開始を期限以前にしてください。")).toBeVisible();
  await expect(page.getByRole("button", { name: "適用", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "再利用情報を準備" })).toBeDisabled();
  await capture(page, "editor-invalid", info);
  await page.getByLabel("開始（最終日から）", { exact: true }).fill("");
  await capture(page, "editor-schedule", info);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByRole("button", { name: /^1件目の日程:/ })).toBeFocused();
  await page.getByLabel("1件目の優先度").selectOption("2");
  await page.getByRole("button", { name: "1件目を並べ替え", exact: true }).press("ArrowDown");
  await expect(page.getByRole("button", { name: "2件目を並べ替え", exact: true })).toBeFocused();
  const read = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("cuckoo-cue:web-workspace:v1:local-user")!).tasks);
  expect((await read())[1]).toEqual({ ...tasks[0], text: "入居条件と鍵の受け取り日を確認する", relative_start_day: null, default_priority: 2 });
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  expect((await read())[0].text).toBe("入居条件と鍵の受け取り日を確認する");
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  expect((await read())[0].default_priority).toBe(0);
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  expect((await read())[0].relative_start_day).toBe(-30);
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  expect((await read())[0]).toEqual(tasks[0]);
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("1件目のタスク", { exact: true })).toHaveValue("入居条件と鍵の受け取り日を確認する");
});

test("W13: editing a reviewed snapshot clears confirmation and preserves typing focus", async ({ page }, info) => {
  await openEditor(page);
  await page.getByRole("button", { name: "再利用情報を準備" }).click();
  await page.getByRole("button", { name: "自分用に保存", exact: true }).click();
  await page.getByRole("button", { name: "グループに公開する", exact: true }).click();
  const confirmation = page.getByRole("checkbox", { name: /個人情報が含まれていない/ });
  await confirmation.check();
  await page.getByLabel("Group label 1").fill("引っ越し前の確認");
  await expect(page.getByLabel("Group label 1")).toBeFocused();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole("button", { name: "公開する", exact: true })).toHaveCount(0);
  await capture(page, "publication-review", info);
});

test("W13: cell edits retain reviewed context; reorder keeps grouping membership and new tasks require a choice", async ({ page }) => {
  await page.route("**/api/task-list-enrichment", (route) => route.fulfill({ json: { enrichment: {
    domain: "引っ越し", context_text: "自分で確認した対象条件", task_groupings: [{ label: "住居", task_offsets: [0] }, { label: "手続き", task_offsets: [1, 2, 3, 4, 5] }],
  } } }));
  await openEditor(page);
  await page.getByRole("button", { name: "再利用情報を準備" }).click();
  await page.getByLabel("対象となる状況").fill("確認済みの対象条件を残す");
  await page.getByLabel("1件目のタスク", { exact: true }).fill("入居条件を確認する");
  await page.getByLabel("1件目のタスク", { exact: true }).press("Enter");
  await page.getByLabel("1件目の優先度").selectOption("2");
  await expect(page.getByLabel("対象となる状況")).toHaveValue("確認済みの対象条件を残す");
  await page.getByRole("button", { name: "1件目を並べ替え", exact: true }).press("ArrowDown");
  await expect(page.getByLabel("入居条件を確認するのまとまり")).toHaveValue("0");
  const groups = await page.evaluate(() => JSON.parse(sessionStorage.getItem("cuckoo-cue:web-workspace:v1:local-user")!).enrichment.task_groupings);
  expect(groups[0].task_offsets).toEqual([1]);
  expect(groups[1].task_offsets).toEqual([0, 2, 3, 4, 5]);
  await page.getByLabel("新しい項目").fill("銀行に住所変更を届ける");
  await page.getByLabel("新しい項目").press("Enter");
  await expect(page.getByLabel("銀行に住所変更を届けるのまとまり")).toHaveValue("");
  await page.getByLabel("銀行に住所変更を届けるのまとまり").selectOption("1");
  await expect(page.locator(".ungrouped-tasks")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "自分用に保存", exact: true })).toBeEnabled();
});

test("W12: failed private save keeps the input and resends the same operation", async ({ page }, info) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/cuebooks/*", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill(requests.length === 1 ? { status: 503, json: { error: "unavailable" } } : { json: { cuebook: { ...route.request().postDataJSON().content, id: "owned", origin_revision_id: null, updated_at: "2026-09-12T00:00:00.000000Z" } } });
  });
  await openEditor(page);
  await page.getByRole("button", { name: "再利用情報を準備" }).click();
  await page.getByRole("button", { name: "自分用に保存", exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText("保存できませんでした");
  await expect(page.locator(".editable-tasks > li")).toHaveCount(6);
  await capture(page, "publication-error", info);
  await page.getByRole("button", { name: "自分用に保存", exact: true }).click();
  await expect(page.getByText("保存済み・自分だけ", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});

test("C01: unavailable browser storage warns without losing the working edit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("disabled", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("disabled", "SecurityError"); };
    Storage.prototype.removeItem = () => { throw new DOMException("disabled", "SecurityError"); };
  });
  await openEditor(page);
  await expect(page.locator(".error-banner")).toContainText("一時保存できません");
  await page.getByLabel("1件目のタスク", { exact: true }).fill("ブラウザに一時保存できない場合の編集");
  await page.getByLabel("1件目のタスク", { exact: true }).press("Enter");
  await expect(page.getByLabel("1件目のタスク", { exact: true })).toHaveValue("ブラウザに一時保存できない場合の編集");
  expect(errors).toEqual([]);
});

test("C06: 200 long tasks fit at supported widths; editing and validation remain usable", async ({ page }, info) => {
  const manyTasks = Array.from({ length: 200 }, (_, index) => ({ ...tasks[1], text: `${index + 1}: 長いタスクの内容と必要な書類の確認 / ${"LongTaskWithoutSpaces".repeat(4)}` }));
  await page.route("**/api/runs/completed", (route) => route.fulfill({ json: { run: { title: result.title, run_id: "completed", task_ids: manyTasks.map((_, i) => `task-${i}`), source_anchor_day: "2026-10-30", tasks: manyTasks } } }));
  await openEditor(page);
  await expect(page.locator(".editable-tasks > li")).toHaveCount(200);
  await page.getByLabel("200件目のタスク", { exact: true }).click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByLabel("200件目のタスク", { exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: info.project.name === "mobile" ? 320 : 1440, height: 900 });
  await expect(page.getByLabel("200件目のタスク", { exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
