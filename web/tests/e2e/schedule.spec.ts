import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";

const tasks = [
  { id: "source-1", text: "猫を連れて移動する便とケージを予約する", default_priority: 0, relative_start_day: -14, relative_end_day: -7 },
  { id: "source-2", text: "新居で猫の水とトイレを用意する", default_priority: null, relative_start_day: 0, relative_end_day: null },
];
const result = { id: "public-schedule", title: "猫2匹と東京から名古屋へ引っ越す", domain: "引っ越し", context_text: "猫2匹と国内で引っ越す", tasks, task_groupings: null, text_matched: true };
test.use({ timezoneId: "America/New_York" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-12T00:00:00Z"));
  await page.route("**/api/memberships", (route) => route.fulfill({ json: { shelf_ids: [] } }));
  await page.route("**/api/shelves", (route) => route.fulfill({ json: { shelves: [] } }));
  await page.route("**/api/search", (route) => route.fulfill({ json: { results: [result], nextCursor: null, searchDomain: result.domain } }));
});
async function open(page: Page) {
  await page.goto("/");
  await page.getByLabel("Search query").fill("猫2匹と引っ越す");
  await page.locator(".search-composer").getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: `${result.title}の日程を決めて使う` }).click();
  await expect(page.getByLabel("最終日", { exact: true })).toBeEnabled();
}
async function capture(page: Page, name: string, info: TestInfo) {
  if (!process.env.CUE_CAPTURE_DIR) return;
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("dialog").evaluate((el) => { el.scrollTop = 0; });
  await page.screenshot({ path: path.resolve(process.env.CUE_CAPTURE_DIR, `${name}-${info.project.name}.png`) });
}

test("W04: generated dates, keep/recalculate/cancel, nulls, validation and identical retry after reload", async ({ page }, info) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/reuse", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill(requests.length === 1 ? { status: 503, json: { error: "保存結果を確認できませんでした。" } } : { json: { runId: "scheduled-corrected" } });
  });
  await open(page);
  const anchor = page.getByLabel("最終日", { exact: true });
  const start = page.getByLabel("1件目の開始日", { exact: true });
  const due = page.getByLabel("1件目の期限", { exact: true });
  await anchor.fill("2026-11-02");
  await expect(start).toHaveValue("2026-10-19");
  await expect(due).toHaveValue("2026-10-26");
  await expect(page.getByLabel("2件目の期限", { exact: true })).toHaveValue("");
  await start.fill("2026-10-20");
  await due.fill("2026-10-27");
  await anchor.fill("2026-11-09");
  await expect(page.getByRole("button", { name: "この日程で保存" })).toBeDisabled();
  await capture(page, "schedule-keep-choice", info);
  await page.getByRole("button", { name: "個別の変更を残す" }).click();
  await expect(start).toHaveValue("2026-10-20");
  await expect(due).toHaveValue("2026-10-27");
  await expect(page.getByLabel("2件目の開始日")).toHaveValue("2026-11-09");
  await anchor.fill("2026-11-16");
  await page.getByRole("button", { name: "変更を取り消す" }).click();
  await expect(anchor).toHaveValue("2026-11-09");
  await anchor.fill("2026-11-16");
  await page.getByRole("button", { name: "すべて再計算" }).click();
  await expect(start).toHaveValue("2026-11-02");
  await expect(due).toHaveValue("2026-11-09");
  await due.fill("2026-11-01");
  await expect(page.getByText("開始日は期限以前の日付にしてください。")).toBeVisible();
  await expect(page.getByRole("button", { name: "この日程で保存" })).toBeDisabled();
  await page.getByRole("button", { name: "1件目の日程を自動生成に戻す" }).click();
  await expect(due).toHaveValue("2026-11-09");
  await due.fill("2026-11-10");
  await page.getByLabel("2件目の開始日").fill("");
  await capture(page, "schedule-edited", info);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.reload();
  await page.getByRole("button", { name: `${result.title}の日程を決めて使う` }).click();
  await expect(due).toHaveValue("2026-11-10");
  await expect(page.getByLabel("2件目の開始日")).toHaveValue("");
  await page.getByRole("button", { name: "この日程で保存" }).click();
  await expect(page.getByText("保存結果を確認できませんでした。", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: `${result.title}の日程を決めて使う` }).click();
  await expect(due).toHaveValue("2026-11-10");
  await expect(due).toBeDisabled();
  await page.getByRole("button", { name: "保存を再試行" }).click();
  await expect(page.locator(".handoff-panel")).toContainText("日程付きのリストを保存しました");
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[0]).toMatchObject({ target_anchor_day: "2026-11-16", time_zone: "America/New_York", task_dates: [
    { task_id: "source-1", available_from_day: "2026-11-02", due_day: "2026-11-10" },
    { task_id: "source-2", available_from_day: null, due_day: null },
  ] });
  await expect(page.locator(".handoff-panel li").first()).toContainText("2026/11/10");
  await page.getByRole("button", { name: `${result.title}の日程を決めて使う` }).click();
  await expect(page.getByRole("dialog").getByText("日程付きのリストを保存しました。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "別の日程で使う" }).click();
  await expect(anchor).toHaveValue("");
});

test("W04: rejected input can be corrected without being trapped in retry", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/reuse", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill(requests.length === 1 ? { status: 400, json: { error: "日付とタイムゾーンを確認してください。" } } : { json: { runId: "corrected-after-rejection" } });
  });
  await open(page);
  await page.getByLabel("最終日", { exact: true }).fill("2026-11-02");
  await page.getByRole("button", { name: "この日程で保存" }).click();
  await expect(page.getByText("日付とタイムゾーンを確認してください。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("最終日", { exact: true })).toBeEnabled();
  await page.getByLabel("最終日", { exact: true }).fill("2026-11-03");
  await page.getByRole("button", { name: "この日程で保存" }).click();
  await expect(page.locator(".handoff-panel")).toBeVisible();
  expect(requests[0].operation_id).not.toEqual(requests[1].operation_id);
  expect(requests[1].target_anchor_day).toBe("2026-11-03");
});

test("W04: past schedule is explicit and 200 long task rows fit supported widths", async ({ page }, info) => {
  await page.route("**/api/search", (route) => route.fulfill({ json: { results: [{ ...result, tasks: Array.from({ length: 200 }, (_, i) => ({ ...tasks[i % 2], id: `task-${i}`, text: `${i + 1}. ${tasks[i % 2].text.repeat(4)}` })) }], nextCursor: null } }));
  await open(page);
  await page.getByLabel("最終日", { exact: true }).fill("2026-09-15");
  await expect(page.getByRole("button", { name: "この日程で保存" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "過去の日付を含む日程で保存する" }).check();
  await expect(page.getByRole("button", { name: "この日程で保存" })).toBeEnabled();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.locator(".run-date-row").evaluateAll((rows) => rows.every((row) => row.scrollWidth <= row.clientWidth))).toBe(true);
  }
  await page.setViewportSize(info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  await capture(page, "schedule-long", info);
});
