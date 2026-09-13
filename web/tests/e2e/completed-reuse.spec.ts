import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { completedRunToSaveDraft, syncedRunSnapshotSchema } from "../../src/lib/synced-run";
import { reuseCompletedRun, reuseCompletedRunSchema } from "../../src/lib/reuse-completed-run";
import { relativeScheduleLabel } from "../../src/components/tasks/task-values";
import { completedEditorSelection } from "../../src/lib/completed-editor-handoff";

const day = 86_400_000;
const anchor = Date.parse("2026-10-01T00:00:00+09:00");
const source = syncedRunSnapshotSchema.parse({
  id: "completed", title: "猫と暮らす家の引っ越し", sort_order: 9, archived_at: anchor + 3 * day,
  target_anchor_day: anchor, completed_anchor_at: anchor + 2 * day, time_zone: "Asia/Tokyo",
  created_at: anchor - 40 * day, updated_at: anchor + 3 * day,
  tasks: ["荷造りをする", "転居先を確認する", "鍵を返す"].map((title, i) => ({
    id: `task-${i}`, title, sort_order: [1, 0, 2][i], user_priority: i,
    available_from_at: anchor - 7 * day, due_at: anchor - day,
    completed_at: anchor + i * day, created_at: anchor - 20 * day, updated_at: anchor + i * day,
  })),
});
const run = completedRunToSaveDraft(source);
const operationId = "12345678-1234-4234-8234-123456789012";

test("Android handoff validates completed IDs without treating partial Runs as completed history", () => {
  const partial = { ...source, completed_anchor_at: null, tasks: source.tasks.map((task, i) => i === 2 ? { ...task, completed_at: null } : task) };
  expect(() => completedRunToSaveDraft(partial)).toThrow();
  const draft = completedRunToSaveDraft(partial, true);
  expect(draft.task_ids).toEqual(["task-1", "task-0"]);
  expect(completedEditorSelection("#edit_tasks=task-0,task-1", draft.task_ids)).toEqual(["task-1", "task-0"]);
  for (const hash of ["#edit_tasks=", "#edit_tasks=task-2", "#edit_tasks=task-0,task-0", "#edit_tasks=task-0&edit_tasks=task-1"]) {
    expect(() => completedEditorSelection(hash, draft.task_ids)).toThrow();
  }
  expect(completedEditorSelection("", draft.task_ids)).toBeNull();
});

test("Android selection opens the unsaved editor directly and survives retry and reload", async ({ page }, info) => {
  let reads = 0;
  const writes: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST") writes.push(request.url()); });
  await page.route("**/api/runs/completed?completed_tasks=true", async (route) => {
    reads += 1;
    await route.fulfill(reads === 1 ? { status: 503, json: { error: "同期内容を確認できませんでした" } } : { json: { run } });
  });
  await page.goto("/?run_id=completed#edit_tasks=task-0,task-1");
  await expect(page.getByText("同期内容を確認できませんでした", { exact: false })).toBeVisible();
  expect(page.url()).toContain("edit_tasks=");
  await page.reload();
  await expect(page.locator(".editable-tasks > li")).toHaveCount(2);
  await expect(page.locator(".completed-review")).toHaveCount(0);
  await expect(page.getByLabel("1件目のタスク", { exact: true })).toHaveValue("転居先を確認する");
  const field = page.getByLabel("2件目のタスク", { exact: true });
  await field.fill("次回用に荷造りをまとめる"); await field.press("Tab");
  await page.reload();
  await expect(page.getByLabel("2件目のタスク", { exact: true })).toHaveValue("次回用に荷造りをまとめる");
  expect(writes).toEqual([]);
  expect(page.url()).not.toContain("edit_tasks=");
  if (process.env.CUE_CAPTURE_DIR) await page.screenshot({ path: path.resolve(process.env.CUE_CAPTURE_DIR, `android-editor-${info.project.name}.png`), fullPage: true });
});

test("Android stale selection fails rather than silently including other tasks", async ({ page }) => {
  await page.route("**/api/runs/completed?completed_tasks=true", (route) => route.fulfill({ json: { run } }));
  await page.goto("/?run_id=completed#edit_tasks=missing");
  await expect(page.getByText(/選択した完了タスクを読み込めませんでした/)).toBeVisible();
  await expect(page.locator(".editable-tasks > li")).toHaveCount(0);
  expect(page.url()).toContain("edit_tasks=missing");
});

test("G07: relative dates use the planned day, never the completion timestamp", () => {
  expect(run.source_anchor_day).toBe("2026-10-01");
  expect(run.tasks[0]).toMatchObject({ relative_start_day: -7, relative_end_day: -1 });
  expect(relativeScheduleLabel(run.tasks[0])).toBe("最終日の1週間前〜前日");
  const missing = completedRunToSaveDraft({ ...source, target_anchor_day: undefined });
  expect(missing.source_anchor_day).toBeNull();
  expect(missing.tasks.every((task) => task.relative_start_day === null && task.relative_end_day === null)).toBe(true);
  const dst = completedRunToSaveDraft({ ...source, time_zone: "Europe/London", target_anchor_day: Date.parse("2026-03-30T00:00:00+01:00"), tasks: [{ ...source.tasks[0], available_from_at: Date.parse("2026-03-28T00:00:00Z"), due_at: Date.parse("2026-03-29T00:00:00Z") }] });
  expect(dst.tasks[0]).toMatchObject({ relative_start_day: -2, relative_end_day: -1 });
});

test("D2/D6: tasks-only reuse clears execution metadata, preserves source order and leaves history intact", () => {
  const before = structuredClone(source);
  const copy = reuseCompletedRun(source, operationId, ["task-0", "task-1"], anchor + 10 * day);
  expect(syncedRunSnapshotSchema.safeParse(copy).success).toBe(true);
  expect(copy.tasks.map((task) => task.title)).toEqual(["転居先を確認する", "荷造りをする"]);
  expect(copy.tasks.map((task) => task.sort_order)).toEqual([0, 1]);
  expect(copy.tasks.every((task) => task.user_priority === null && task.due_at === null && task.available_from_at === null && task.completed_at === null)).toBe(true);
  expect(copy).toMatchObject({ archived_at: null, target_anchor_day: null, completed_anchor_at: null });
  expect(source).toEqual(before);
  expect(copy.tasks.every((task) => !source.tasks.some((old) => old.id === task.id))).toBe(true);
  expect(copy.tasks.map((task) => task.id)).toEqual(reuseCompletedRun(source, operationId, ["task-1", "task-0"], anchor + 11 * day).tasks.map((task) => task.id));
  expect(() => reuseCompletedRun(source, operationId, ["unknown"], anchor)).toThrow(/見つかりません/);
  expect(() => reuseCompletedRun({ ...source, completed_anchor_at: null }, operationId, ["task-0"], anchor)).toThrow(/完了した/);
  expect(reuseCompletedRunSchema.safeParse({ operation_id: operationId, task_ids: ["task-0", "task-0"] }).success).toBe(false);
  expect(reuseCompletedRunSchema.safeParse({ operation_id: operationId, task_ids: ["task-0"], tasks: [] }).success).toBe(false);
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/memberships", (route) => route.fulfill({ json: { shelf_ids: [] } }));
  await page.route("**/api/shelves", (route) => route.fulfill({ json: { shelves: [] } }));
  await page.route("**/api/runs/completed", (route) => route.fulfill({ json: { run } }));
});

test("W12/C01: selection skips editing, retries the same request after reload, reports only storage success", async ({ page }, info) => {
  const requests: unknown[] = [];
  await page.route("**/api/runs/completed/reuse", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill(requests.length === 1 ? { status: 503, json: { error: "保存を確認できませんでした。" } } : { json: { runId: `reuse-${operationId}` } });
  });
  await page.goto("/?run_id=completed");
  await expect(page.getByRole("heading", { name: "完了したリスト", exact: true })).toBeVisible();
  await page.getByLabel("すべて選択", { exact: true }).uncheck();
  await expect(page.getByRole("button", { name: "タスクだけもう一度使う" })).toBeDisabled();
  await page.getByLabel("転居先を確認する", { exact: true }).check();
  await page.getByLabel("荷造りをする", { exact: true }).check();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (process.env.CUE_CAPTURE_DIR) await page.screenshot({ path: path.resolve(process.env.CUE_CAPTURE_DIR, `completed-selection-${info.project.name}.png`), fullPage: true });
  await page.getByRole("button", { name: "タスクだけもう一度使う" }).click();
  await expect(page.locator(".completed-review .field-error")).toContainText("保存を確認できませんでした");
  await expect(page.getByLabel("荷造りをする", { exact: true })).toBeDisabled();
  await expect(page.locator(".inline-task-editor")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "保存を再試行" }).click();
  await expect(page.getByRole("heading", { name: "リストを保存しました" })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[0]).toMatchObject({ task_ids: ["task-1", "task-0"] });
  expect(Object.keys(requests[0] as object).sort()).toEqual(["operation_id", "task_ids"]);
  await expect(page.getByRole("link", { name: "Androidで開く" })).toHaveCount(0);
  await expect(page.getByText(/端末に反映しました/)).toHaveCount(0);
  if (process.env.CUE_CAPTURE_DIR) await page.screenshot({ path: path.resolve(process.env.CUE_CAPTURE_DIR, `reused-saved-${info.project.name}.png`), fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "リストを保存しました" })).toBeVisible();
  expect(requests).toHaveLength(2);
});

test("W12-6: selected tasks enter editor; text cancel, date cancel, null priority, add/delete undo", async ({ page }) => {
  await page.goto("/?run_id=completed");
  await page.getByLabel("鍵を返す", { exact: true }).uncheck();
  await page.getByRole("button", { name: "再利用用に整える", exact: true }).click();
  await expect(page.locator(".editable-tasks > li")).toHaveCount(2);
  const text = page.getByLabel("1件目のタスク", { exact: true });
  await text.fill("取り消す予定の本文"); await text.press("Escape");
  await expect(text).toHaveValue("転居先を確認する");
  await text.fill("");
  await expect(page.getByText("タスクの内容を入力してください。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "再利用情報を準備" })).toBeDisabled();
  await text.press("Escape");
  await page.getByRole("button", { name: /^1件目の日程:/ }).click();
  await page.getByRole("button", { name: "日程をクリア" }).click();
  await page.getByLabel("開始（最終日から）", { exact: true }).press("Escape");
  await expect(page.getByRole("button", { name: /^1件目の日程:/ })).toContainText("1週間前〜前日");
  await page.getByLabel("1件目の優先度").selectOption("");
  await page.getByLabel("新しい項目").fill("住所の変更を連絡する");
  await page.getByLabel("新しい項目").press("Enter");
  await expect(page.locator(".editable-tasks > li")).toHaveCount(3);
  await expect(page.getByLabel("3件目の優先度")).toHaveValue("");
  await expect(page.getByRole("button", { name: /^3件目の日程:/ })).toContainText("未設定");
  await page.getByLabel("2件目のタスク", { exact: true }).press("ControlOrMeta+A");
  await page.getByLabel("2件目のタスク", { exact: true }).press("Backspace");
  await expect(page.locator(".editable-tasks > li")).toHaveCount(3);
  await page.getByLabel("2件目のタスク", { exact: true }).press("Backspace");
  await expect(page.locator(".editable-tasks > li")).toHaveCount(2);
  await expect(page.getByLabel("2件目のタスク", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  await expect(page.getByLabel("2件目のタスク", { exact: true })).toHaveValue("荷造りをする");
  await page.reload();
  await expect(page.getByLabel("1件目の優先度")).toHaveValue("");
  await expect(page.getByLabel("3件目のタスク", { exact: true })).toHaveValue("住所の変更を連絡する");
});

test("W12-6: empty-text deletion ignores composition and repeat; software keyboard deletion is undoable", async ({ page }) => {
  await page.goto("/?run_id=completed");
  await page.getByRole("button", { name: "再利用用に整える", exact: true }).click();
  const text = page.getByLabel("1件目のタスク", { exact: true });
  await expect(page.locator(".inline-task-editor details")).toHaveCount(0);
  await expect(page.locator(".inline-task-editor").getByRole("button", { name: /削除|その他の操作/ })).toHaveCount(0);
  await text.fill("");
  await text.dispatchEvent("keydown", { key: "Backspace", repeat: true });
  await expect(page.locator(".editable-tasks > li")).toHaveCount(3);
  await text.dispatchEvent("compositionstart");
  await text.dispatchEvent("keydown", { key: "Backspace", isComposing: true });
  await text.evaluate((element) => element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "deleteContentBackward", isComposing: true })));
  await expect(page.locator(".editable-tasks > li")).toHaveCount(3);
  await text.dispatchEvent("compositionend");
  await text.evaluate((element) => element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "deleteContentBackward" })));
  await expect(page.locator(".editable-tasks > li")).toHaveCount(2);
  await expect(page.getByLabel("1件目のタスク", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  await expect(page.getByLabel("1件目のタスク", { exact: true })).toHaveValue("転居先を確認する");
  await expect(page.getByLabel("1件目の優先度")).toHaveValue("1");
  await expect(page.getByRole("button", { name: /^1件目の日程:/ })).toContainText("1週間前〜前日");
});

test("W12-6/C01: deleting the final task focuses add input; an empty draft survives reload", async ({ page }) => {
  await page.goto("/?run_id=completed");
  await page.getByRole("button", { name: "再利用用に整える", exact: true }).click();
  for (let remaining = 3; remaining > 0; remaining--) {
    const text = page.getByLabel("1件目のタスク", { exact: true });
    await text.fill("");
    await text.press("Delete");
    await expect(page.locator(".editable-tasks > li")).toHaveCount(remaining - 1);
  }
  await expect(page.getByLabel("新しい項目")).toBeFocused();
  await expect(page.getByRole("button", { name: "再利用情報を準備" })).toBeDisabled();
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  await expect(page.getByLabel("1件目のタスク", { exact: true })).toHaveValue("鍵を返す");
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "再利用用に整える" })).toBeVisible();
  await expect(page.locator(".editable-tasks > li")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "再利用情報を準備" })).toBeDisabled();
  await page.getByLabel("新しい項目").fill("新しいタスク");
  await page.getByLabel("新しい項目").press("Enter");
  await expect(page.getByLabel("1件目のタスク", { exact: true })).toHaveValue("新しいタスク");
});

test("W12-6: pointer reorder preserves the task's date and priority", async ({ page }, info) => {
  await page.goto("/?run_id=completed");
  await page.getByRole("button", { name: "再利用用に整える", exact: true }).click();
  const from = (await page.getByRole("button", { name: "1件目を並べ替え", exact: true }).boundingBox())!;
  const to = (await page.getByRole("button", { name: "3件目を並べ替え", exact: true }).boundingBox())!;
  if (info.project.name === "mobile") {
    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: to.x + to.width / 2, y: to.y + to.height / 2 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await client.detach();
  } else {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.getByLabel("3件目のタスク", { exact: true })).toHaveValue("転居先を確認する");
  await expect(page.getByLabel("3件目の優先度")).toHaveValue("1");
  await expect(page.getByRole("button", { name: /^3件目の日程:/ })).toContainText("1週間前〜前日");
});
