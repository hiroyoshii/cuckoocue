import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { shelfDescriptionSchema, shelfDescriptionInputSchema } from "../../src/lib/shelf-description";

const original = {
  id: "a54d9e6f-38ae-4780-8986-b9e169f3a178", title: "猫2匹との引っ越し", updated_at: "2026-09-12T00:00:00.000000Z", origin_revision_id: null,
  tasks: [{ id: "e4a0b6d6-eec3-4efa-9d98-b9767cb65bd6", text: "ケージを用意する", default_priority: 0, relative_start_day: -14, relative_end_day: -7 }],
  enrichment: { domain: "引っ越し", context_text: "猫2匹と公共交通で引っ越す", task_groupings: [{ label: "移動", task_offsets: [0] }] },
};
const suggestion = { title: "猫2匹と公共交通で引っ越す", context: "猫2匹と公共交通で移動し、新生活を準備する人向け。" };
const shelf = { id: "shelf", title: "猫との暮らし", context: "猫と暮らす人向け", created_by: "other", updated_at: original.updated_at,
  items: [{ revision_id: "revision", position: 0, revision: { id: "revision", title: original.title, published_at: original.updated_at, withdrawn_at: null, tasks: original.tasks.map(task => ({ ...task, title: task.text })) } }] };

test("description contracts reject empty, oversized and extra output fields", () => {
  expect(shelfDescriptionSchema.safeParse({ title: "", context: "猫" }).success).toBe(false);
  expect(shelfDescriptionSchema.safeParse({ ...suggestion, items: [] }).success).toBe(false);
  expect(shelfDescriptionSchema.safeParse({ ...suggestion, title: "a".repeat(121) }).success).toBe(false);
  expect(shelfDescriptionInputSchema.safeParse({ title: "", context: "", lists: [] }).success).toBe(false);
  expect(shelfDescriptionInputSchema.safeParse({ title: shelf.title, context: shelf.context, lists: [] }).success).toBe(true);
});

test("new Shelf suggests text without publishing; manual edits and reload preserve it", async ({ page }) => {
  const mutations: string[] = [];
  let generated = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") mutations.push(path);
    if (path === "/api/shelf-description") { generated++; return route.fulfill({ json: { description: suggestion } }); }
    if (path === `/api/cuebooks/${original.id}`) return route.fulfill({ json: { cuebook: original } });
    return route.fulfill({ json: { shelves: [], shelf_ids: [], revisions: [] } });
  });
  await page.goto(`/?cuebook_id=${original.id}`);
  await page.getByRole("button", { name: "グループに公開する", exact: true }).click();
  const panel = page.getByRole("region", { name: "公開先の確認" });
  await expect(panel.getByLabel("グループ名", { exact: true })).toHaveValue(suggestion.title);
  await expect(panel.getByLabel("対象となる状況", { exact: true })).toHaveValue(suggestion.context);
  await expect(panel.getByRole("button", { name: "公開する", exact: true })).toBeDisabled();
  await panel.getByLabel("グループ名", { exact: true }).fill("猫2匹との新生活");
  await page.getByRole("button", { name: "公開先の確認を閉じる" }).click();
  await expect(page.getByRole("button", { name: "グループに公開する", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "グループに公開する", exact: true }).click();
  await expect(panel.getByLabel("グループ名", { exact: true })).toHaveValue("猫2匹との新生活");
  expect(generated).toBe(1);
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith("cuckoo-cue:publication:") && sessionStorage.getItem(key)?.includes("猫2匹との新生活")))).toBe(true);
  await page.reload();
  await expect(panel.getByLabel("グループ名", { exact: true })).toHaveValue("猫2匹との新生活");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "グループに公開する", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "グループに公開する", exact: true }).click();
  expect(generated).toBe(1);
  expect(mutations).toEqual(["/api/shelf-description"]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await panel.screenshot({ path: `../docs/review-screenshots/web/shelf-description/new-${test.info().project.name}.png` });
});

test("failed generation leaves manual input; retry uses edits and does not publish", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/shelf-description") {
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 503, json: { error: "名前・状況を生成できませんでした。" } });
      expect(route.request().postDataJSON().context).toBe("電車で猫2匹と移動する");
      return route.fulfill({ json: { description: suggestion } });
    }
    if (path === `/api/cuebooks/${original.id}`) return route.fulfill({ json: { cuebook: original } });
    return route.fulfill({ json: { shelves: [], shelf_ids: [], revisions: [] } });
  });
  await page.goto(`/?cuebook_id=${original.id}`);
  await page.getByRole("button", { name: "グループに公開する", exact: true }).click();
  const panel = page.getByRole("region", { name: "公開先の確認" });
  await expect(panel.getByRole("alert")).toContainText("生成できませんでした");
  await panel.getByLabel("対象となる状況", { exact: true }).fill("電車で猫2匹と移動する");
  await panel.getByRole("button", { name: "名前・状況を生成", exact: true }).click();
  await expect(panel.getByLabel("グループ名", { exact: true })).toHaveValue(suggestion.title);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("fork inherits source text; optional generation changes only the uncommitted draft", async ({ page }) => {
  const mutations: string[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") mutations.push(path);
    if (path === "/api/shelves/shelf") return route.fulfill({ json: { shelf } });
    if (path === "/api/shelf-description") return route.fulfill({ json: { description: suggestion } });
    return route.fulfill({ json: { shelves: [], shelf_ids: [] } });
  });
  await page.goto("/?shelf_id=shelf");
  await page.getByRole("button", { name: "全件コピー", exact: true }).click();
  const panel = page.getByRole("region", { name: "全件コピーの確認" });
  await expect(panel.getByLabel("コピー先のグループ名")).toHaveValue(shelf.title);
  expect(mutations).toEqual([]);
  await panel.getByRole("button", { name: "名前・状況を生成", exact: true }).click();
  await expect(panel.getByLabel("コピー先のグループ名")).toHaveValue(suggestion.title);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(shelf.title);
  expect(mutations).toEqual(["/api/shelf-description"]);
  await panel.screenshot({ path: `../docs/review-screenshots/web/shelf-description/fork-${test.info().project.name}.png` });
});

test("owner can generate and edit text without changing placements or saving automatically", async ({ page }) => {
  const mutations: string[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") mutations.push(path);
    if (path === "/api/shelves/shelf") return route.fulfill({ json: { shelf: { ...shelf, created_by: "local-user" } } });
    if (path === "/api/shelf-description") return route.fulfill({ json: { description: suggestion } });
    return route.fulfill({ json: { shelves: [], shelf_ids: [] } });
  });
  await page.goto("/?shelf_id=shelf");
  const editor = page.getByRole("region", { name: "グループを編集" });
  await editor.getByRole("button", { name: "名前・状況を生成", exact: true }).click();
  await expect(editor.getByLabel("グループ名", { exact: true })).toHaveValue(suggestion.title);
  await editor.getByLabel("グループ名", { exact: true }).fill("猫との新生活");
  await expect(editor.locator(".shelf-revision-row")).toHaveCount(1);
  await expect(editor).toContainText(original.tasks[0].text);
  await expect(editor.getByRole("button", { name: "変更を保存", exact: true })).toBeEnabled();
  expect(mutations).toEqual(["/api/shelf-description"]);
});

test("switching to an existing destination cancels generation without blocking publication", async ({ page }) => {
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/shelf-description") { await released; await route.fulfill({ json: { description: suggestion } }).catch(() => {}); return; }
    if (path === `/api/cuebooks/${original.id}`) return route.fulfill({ json: { cuebook: original } });
    return route.fulfill({ json: { shelves: [{ ...shelf, created_by: "local-user" }], shelf_ids: [], revisions: [] } });
  });
  await page.goto(`/?cuebook_id=${original.id}`);
  await page.getByRole("button", { name: "グループに公開する", exact: true }).click();
  const panel = page.getByRole("region", { name: "公開先の確認" });
  await expect(panel.getByRole("button", { name: "名前・状況を生成中", exact: true })).toBeVisible();
  await panel.getByLabel("公開先", { exact: true }).selectOption(shelf.id);
  release();
  await panel.getByRole("checkbox", { name: /個人情報/ }).check();
  await expect(panel.getByRole("button", { name: "公開する", exact: true })).toBeEnabled();
  await expect(panel.getByLabel("グループ名", { exact: true })).toHaveCount(0);
  await expect(panel.getByLabel("公開先", { exact: true })).toHaveValue(shelf.id);
});
