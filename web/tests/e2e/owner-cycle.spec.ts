import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";

const id = "963f1ef6-6265-483b-a286-a8a393c1c83b";
const tasks = [
  { id: "201296d0-92d7-45ac-8460-179a4a85a426", text: "猫を連れて移動する便を予約する", default_priority: 0, relative_start_day: -14, relative_end_day: -7 },
  { id: "e7371199-89ca-4573-bc96-e8b328a2df05", text: "新居で猫の水とトイレを用意する", default_priority: null, relative_start_day: 0, relative_end_day: null },
];
const original = { id, title: "猫2匹と東京から名古屋へ引っ越す", origin_revision_id: null, updated_at: "2026-09-12T00:00:00.000000Z", tasks,
  enrichment: { domain: "引っ越し", context_text: "猫2匹と賃貸の住み替え。東京から名古屋へ。", task_groupings: [{ label: "猫の移動と新居", task_offsets: [0, 1] }] } };

test("G03/W09/W11/W13: history, private original, conflict, publication recovery and reuse", async ({ page }, info) => {
  let saved = structuredClone(original);
  const publicationRequests: unknown[] = [];
  let conflict = true;
  await page.route("**/api/memberships", (route) => route.fulfill({ json: { shelf_ids: [] } }));
  await page.route("**/api/shelves", (route) => route.fulfill({ json: { shelves: [{ id: "mine", title: "猫との引っ越し", created_by: "local-user" }] } }));
  await page.route("**/api/runs", (route) => route.fulfill({ json: { runs: [{ id: "done", title: original.title, task_count: 2, completed_at: Date.parse("2026-09-10") }], nextCursor: null } }));
  await page.route("**/api/cuebooks", (route) => route.fulfill({ json: { cuebooks: [saved], nextCursor: null } }));
  await page.route(`**/api/cuebooks/${id}/revisions`, route => route.fulfill({ json: { revisions: [] } }));
  await page.route(`**/api/cuebooks/${id}`, async (route) => {
    if (route.request().method() === "PUT") {
      if (conflict) {
        conflict = false;
        saved = { ...saved, title: "他端末で確認した引っ越し", updated_at: "2026-09-12T01:00:00.000000Z" };
        await route.fulfill({ status: 409, json: { error: "別の変更が保存されています。" } }); return;
      }
      const input = route.request().postDataJSON();
      expect(input.expected_updated_at).toBe(saved.updated_at);
      saved = { ...saved, ...input.content, updated_at: "2026-09-12T02:00:00.000000Z" };
    }
    await route.fulfill({ json: { cuebook: saved } });
  });
  await page.route("**/api/cuebook-revisions", async (route) => {
    publicationRequests.push(route.request().postDataJSON());
    await route.fulfill(publicationRequests.length === 1 ? { status: 503, json: { error: "公開を確認できませんでした。自分用の保存は完了しています。" } } : { status: 201, json: { revision: { id: "published" }, shelf: { id: "mine" } } });
  });
  const capture = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    if (process.env.CUE_CAPTURE_DIR) await page.screenshot({ path: path.resolve(process.env.CUE_CAPTURE_DIR, `${name}-${info.project.name}.png`), fullPage: true });
  };
  await page.goto("/");
  await page.getByRole("button", { name: "完了履歴", exact: true }).click();
  await expect(page.locator(".owner-list-workspace > .owner-list-rows")).toContainText(original.title);
  await capture("history");
  await page.getByRole("button", { name: "自分のリスト", exact: true }).click();
  await expect(page.locator(".owner-list-workspace > .owner-list-rows")).toContainText(original.title);
  await capture("private-library");
  await page.locator(".owner-list-workspace > .owner-list-rows button").click();
  await page.getByLabel("1件目のタスク", { exact: true }).fill("猫と移動する便とケージを予約する");
  await page.getByLabel("1件目のタスク", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "自分用に保存" }).click();
  await expect(page.getByLabel("1件目のタスク", { exact: true })).toHaveValue("猫と移動する便とケージを予約する");
  await page.getByText("最新の保存内容を見る", { exact: true }).click();
  await capture("private-conflict");
  await page.getByRole("button", { name: "最新の内容を確認し、自分の編集で更新する" }).click();
  await expect(page.getByText("保存済み・自分だけ")).toBeVisible();
  expect(saved.tasks[0].id).toBe(tasks[0].id);
  await capture("private-saved");
  await page.getByRole("button", { name: "グループに公開する" }).click();
  await page.getByRole("combobox", { name: "公開先", exact: true }).selectOption("mine");
  await page.getByRole("checkbox", { name: /個人情報/ }).check();
  await page.getByRole("button", { name: "公開する", exact: true }).click();
  await expect(page.locator(".publication-panel")).toContainText("自分用の保存は完了しています");
  await capture("public-retry");
  await page.reload();
  await page.getByRole("button", { name: "公開を再試行" }).click();
  await expect(page.getByText("公開しました。", { exact: true })).toBeVisible();
  expect(publicationRequests[1]).toEqual(publicationRequests[0]);
  await page.route("**/api/reuse", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ source: { type: "cuebook", id }, target_anchor_day: "2026-10-01" });
    return route.fulfill({ json: { runId: "scheduled-result" } });
  });
  await page.getByRole("button", { name: "日程を決めて使う" }).click();
  await page.getByLabel("最終日", { exact: true }).fill("2026-10-01");
  await capture("private-schedule");
  await page.getByRole("button", { name: "この日程で保存" }).click();
  await expect(page.getByText("日程付きのリストを保存しました。", { exact: true })).toBeVisible();
  await capture("scheduled-saved");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
