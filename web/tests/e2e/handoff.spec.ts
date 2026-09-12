import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { completedRunToSaveDraft } from "../../src/lib/synced-run";

const run = { id: "handoff-run", title: "猫2匹と引っ越す", source_cuebook_id: "private-original", sort_order: 0, archived_at: null, completed_anchor_at: null, target_anchor_day: 1793458800000, time_zone: "Asia/Tokyo", created_at: 1, updated_at: 1,
  tasks: [{ id: "task-1", source_task_id: "source-task-1", title: "猫の移動用ケースを用意する", user_priority: 0, available_from_at: null, due_at: 1793458800000, sort_order: 0, completed_at: null, created_at: 1, updated_at: 1 }] };
test("saved Run fallback reads only, retries and returns to history", async ({ page }) => {
  let attempt = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    expect(route.request().method()).toBe("GET");
    if (path.endsWith("/snapshot")) return route.fulfill({ status: ++attempt === 1 ? 503 : 200, json: attempt === 1 ? { error: "読み込めませんでした。" } : { run } });
    return route.fulfill({ json: { shelf_ids: [], shelves: [], runs: [], nextCursor: null } });
  });
  await page.goto("/import?run_id=handoff-run");
  await expect(page.locator(".run-handoff").getByRole("alert")).toContainText("読み込めませんでした");
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByRole("heading", { name: run.title })).toBeVisible();
  await expect(page.getByRole("link", { name: "Androidで開く" })).toHaveAttribute("href", "https://cuckoocue.hiyozoo.com/import?run_id=handoff-run");
  await expect(page.getByText("開始: 未設定", { exact: false })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "完了履歴を見る" }).click();
  await expect(page.getByRole("heading", { name: "完了履歴", exact: true })).toBeVisible({ timeout: 30_000 });
});

test("missing and invalid Run links never create or expose a substitute", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ status: route.request().url().includes("/snapshot") ? 404 : 200, json: { shelf_ids: [], shelves: [] } }));
  await page.goto("/import?run_id=someone-elses-run");
  await expect(page.locator(".run-handoff").getByRole("alert")).toContainText("このアカウントではリストが見つかりません");
  await expect(page.getByRole("link", { name: "Androidで開く" })).toHaveCount(0);
  await page.goto("/import?run_id=a&run_id=b");
  await expect(page.getByRole("heading", { name: "リストのリンクが正しくありません" })).toBeVisible();
});

test("completed Run deep link retries the same read and consumes the link only after success", async ({ page }) => {
  let attempt = 0;
  const draft = completedRunToSaveDraft({ ...run, completed_anchor_at: 2, tasks: run.tasks.map((task) => ({ ...task, completed_at: 2 })) });
  await page.route("**/api/**", async (route) => {
    expect(route.request().method()).toBe("GET");
    if (new URL(route.request().url()).pathname === "/api/runs/handoff-run") return route.fulfill({ status: ++attempt === 1 ? 503 : 200, json: attempt === 1 ? { error: "一時的に読み込めません。" } : { run: draft } });
    return route.fulfill({ json: { shelf_ids: [], shelves: [] } });
  });
  await page.goto("/?run_id=handoff-run");
  await page.getByRole("button", { name: "完了したリストの読込を再試行" }).click();
  await expect(page.getByRole("heading", { name: run.title, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(attempt).toBe(2);
});

test("history focus refresh removes undone Runs and retries the failed first page", async ({ page }) => {
  let attempt = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/runs") {
      expect(url.search).toBe("");
      attempt += 1;
      return route.fulfill({ status: attempt === 2 ? 503 : 200, json: attempt === 2 ? { error: "再取得に失敗しました。" } : { runs: attempt === 1 ? [{ id: run.id, title: run.title, task_count: 1 }, ...Array.from({ length: 40 }, (_, i) => ({ id: `older-${i}`, title: `過去のリスト ${i}`, task_count: 1 }))] : [], nextCursor: attempt === 1 ? "later-page" : null } });
    }
    return route.fulfill({ json: { shelf_ids: [], shelves: [] } });
  });
  await page.goto("/?view=history");
  await expect(page.getByRole("button", { name: new RegExp(run.title) })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.getByText("同期済みの完了履歴はありません。", { exact: true })).toBeVisible();
  expect(attempt).toBe(3);
});
