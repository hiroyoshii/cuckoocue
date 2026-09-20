import { test, expect } from "@playwright/test";
import { assertPublicCorpusSafe } from "../../src/lib/public-corpus-safety";
import AxeBuilder from "@axe-core/playwright";

const original = {
  id: "a54d9e6f-38ae-4780-8986-b9e169f3a178", title: "猫2匹との引っ越し", updated_at: "2026-09-12T00:00:00.000000Z", origin_revision_id: null,
  tasks: [{ id: "e4a0b6d6-eec3-4efa-9d98-b9767cb65bd6", text: "ケージを用意する", default_priority: 0, relative_start_day: -14, relative_end_day: -7 }],
  enrichment: { domain: "引っ越し", context_text: "猫2匹と公共交通で引っ越す", task_groupings: [{ label: "移動", task_offsets: [0] }] },
};

test("public group text rejects obvious contact details but allows reusable context", () => {
  expect(() => assertPublicCorpusSafe({ title: "猫との引っ越し", tasks: [], context_text: "連絡先: example@example.test" })).toThrow(/メールアドレス/);
  expect(() => assertPublicCorpusSafe({ title: "猫との引っ越し", tasks: [], context_text: "東京から名古屋へ、猫2匹と公共交通で移動する" })).not.toThrow();
});

test("search and detail link only to actual placements without joining", async ({ page }) => {
  const shelf = { id: "public-shelf", title: "猫と公共交通で引っ越す", context: "猫2匹と電車で移動する", is_owned: false, items: [], updated_at: "2026-09-12T00:00:00.000000Z" };
  const result = { id: "public-revision", title: original.title, tasks: original.tasks, ...original.enrichment, text_matched: true, shelves: [{ id: shelf.id, title: shelf.title }] };
  const mutations: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET" && path !== "/api/search") mutations.push(path);
    if (path === "/api/search") return route.fulfill({ json: { results: [result], nextCursor: null, searchDomain: "引っ越し" } });
    if (path === `/api/shelves/${shelf.id}`) return route.fulfill({ json: { shelf } });
    return route.fulfill({ json: { shelves: [], shelf_ids: [] } });
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Search query" }).fill("猫との引っ越し");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  const item = page.locator(".search-result-item");
  await expect(item.getByRole("navigation", { name: "関連グループ" })).toContainText(shelf.title);
  await expect(item.getByRole("button", { name: "参加する" })).toHaveCount(0);
  await item.getByRole("button", { name: "全1件を見る", exact: true }).click();
  const dialog = item;
  await expect(dialog.getByRole("navigation", { name: "関連グループ" })).toContainText(shelf.title);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: shelf.title, exact: true }).click();
  await expect(page.getByRole("heading", { name: shelf.title, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "参加する", exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test("group validation can be corrected; unknown publication outcome retries identically and refreshes navigation", async ({ page }) => {
  let groupCreated = false;
  const groupRequests: Record<string, unknown>[] = [];
  const publicationRequests: unknown[] = [];
  const shelf = { id: "created-shelf", title: "猫と公共交通で引っ越す", is_owned: true };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/memberships") return route.fulfill({ json: { shelf_ids: groupCreated ? [shelf.id] : [] } });
    if (path === "/api/shelf-description") return route.fulfill({ json: { description: { title: shelf.title, context: "猫2匹と電車で移動する" } } });
    if (path === "/api/cuebooks") return route.fulfill({ json: { cuebooks: [original], nextCursor: null } });
    if (path === `/api/cuebooks/${original.id}`) return route.fulfill({ json: { cuebook: original } });
    if (path === "/api/shelves" && method === "GET") return route.fulfill({ json: { shelves: groupCreated ? [shelf] : [] } });
    if (path === "/api/shelves" && method === "POST") {
      const input = route.request().postDataJSON(); groupRequests.push(input);
      if (input.context.includes("@")) return route.fulfill({ status: 422, json: { error: "公開できない可能性のある情報を検出しました: メールアドレス" } });
      groupCreated = true;
      return route.fulfill({ status: 201, json: { shelf } });
    }
    if (path === "/api/cuebook-revisions") {
      publicationRequests.push(route.request().postDataJSON());
      return route.fulfill(publicationRequests.length === 1 ? { status: 503, json: { error: "公開結果を確認できませんでした。" } } : { status: 201, json: { revision: { id: "revision" }, shelf } });
    }
    return route.fulfill({ json: { runs: [], nextCursor: null } });
  });
  await page.goto("/?view=history");
  await page.getByRole("button", { name: "自分のリスト", exact: true }).click();
  await expect(page.getByRole("heading", { name: "自分のリスト", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "自分のリスト", exact: true })).toBeVisible();
  await page.locator(".owner-list-workspace > .owner-list-rows button").click();
  await page.getByRole("button", { name: "グループに公開する", exact: true }).click();
  const panel = page.getByRole("region", { name: "公開先の確認" });
  await panel.getByLabel("グループ名", { exact: true }).fill(shelf.title);
  await panel.getByLabel("対象となる状況", { exact: true }).fill("example@example.test");
  await panel.getByRole("checkbox", { name: /個人情報/ }).check();
  await panel.getByRole("button", { name: "公開する", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("メールアドレス");
  await expect(panel.getByLabel("対象となる状況", { exact: true })).toBeEnabled();
  await panel.getByLabel("対象となる状況", { exact: true }).fill("猫2匹と電車で引っ越す");
  await panel.getByRole("button", { name: "公開する", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("公開結果を確認できませんでした");
  await expect(panel).toContainText("保存済みの内容");
  await page.reload();
  await panel.getByRole("button", { name: "公開を再試行", exact: true }).click();
  await expect(page.getByText("公開しました。", { exact: true })).toBeVisible();
  expect(publicationRequests[1]).toEqual(publicationRequests[0]);
  expect(groupRequests).toHaveLength(2);
  if (test.info().project.name === "mobile") await page.locator(".mobile-navigation summary").click();
  const navigation = page.getByRole("navigation", { name: test.info().project.name === "mobile" ? "モバイルの主な操作" : "主な操作", exact: true });
  await expect(navigation.getByRole("button", { name: shelf.title, exact: true })).toBeVisible();
});
