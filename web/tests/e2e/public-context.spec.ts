import { test, expect as baseExpect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const expect = baseExpect.configure({ timeout: 15000 });

const original = { id: "a54d9e6f-38ae-4780-8986-b9e169f3a178", title: "猫との引っ越し", updated_at: "2026-09-12T00:00:00.000000Z", origin_revision_id: "revision",
  tasks: [{ id: "e4a0b6d6-eec3-4efa-9d98-b9767cb65bd6", text: "ケージを確認する", default_priority: null, relative_start_day: -7, relative_end_day: 0 }],
  enrichment: { domain: "引っ越し", context_text: "猫と国内で引っ越す", task_groupings: [{ label: "移動", task_offsets: [0] }] } };
const revision = { id: "revision", title: original.title, published_at: original.updated_at, withdrawn_at: null, ...original.enrichment,
  tasks: original.tasks.map(task => ({ ...task, title: task.text })), shelves: [{ id: "shelf", title: "猫と暮らす人" }] };
const shelf = { id: "shelf", title: "猫と暮らす人", context: "猫と国内で引っ越す人", created_by: "other-user", updated_at: original.updated_at, item_count: 1,
  forked_from_shelf_id: null, items: [{ revision_id: revision.id, position: 0, revision }] };

async function fixtures(page: Page) {
  const mutations: string[] = [];
  let joined: string[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method !== "GET") mutations.push(`${method} ${path}`);
    if (path === "/api/memberships/shelf") { joined = [shelf.id]; return route.fulfill({ json: { joined: true } }); }
    if (path === "/api/shelves/shelf") return route.fulfill({ json: { shelf } });
    if (path === "/api/shelves/copy") return route.fulfill({ json: { shelf: { ...shelf, id: "copy", title: "猫2匹の転居と新生活", created_by: "local-user", forked_from_shelf_id: "shelf" } } });
    if (path === "/api/cuebook-revisions/revision") return route.fulfill({ json: { revision } });
    if (path === `/api/cuebooks/${original.id}`) return route.fulfill({ json: { cuebook: original } });
    if (path === "/api/search") return route.fulfill({ json: { results: [{ ...revision, tasks: original.tasks }], nextCursor: null } });
    return route.fulfill({ json: { shelves: [shelf], shelf_ids: joined, revisions: [] } });
  });
  return mutations;
}

test("D4/W03: direct public link retains context, grouping, placements and leads to membership", async ({ page }) => {
  const mutations = await fixtures(page);
  await page.goto("/?revision_id=revision");
  await expect(page.locator(".detail-context")).toHaveText(original.enrichment.context_text);
  await expect(page.locator(".public-revision-workspace")).toContainText("1タスク · 引っ越し");
  await expect(page.locator(".public-revision-workspace .result-facts").last()).toHaveText("移動");
  await expect(page.getByRole("button", { name: "参加する", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "日程を決めて使う" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `../docs/review-screenshots/web/public-context/revision-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("navigation", { name: "関連グループ" }).getByRole("button", { name: shelf.title }).click();
  await expect(page.getByRole("heading", { name: shelf.title, exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await expect(page.getByRole("button", { name: "参加を解除", exact: true })).toBeVisible();
  expect(mutations).toEqual(["PUT /api/memberships/shelf"]);
  await page.goBack();
  await expect(page.locator(".detail-context")).toHaveText(original.enrichment.context_text);
  await page.goForward();
  await expect(page.getByRole("button", { name: "参加を解除", exact: true })).toBeVisible();
  await page.getByRole("link", { name: original.title, exact: true }).click();
  await expect(page.locator(".detail-context")).toHaveText(original.enrichment.context_text);
  expect(mutations).toEqual(["PUT /api/memberships/shelf"]);
});

test("D4/W03: inline result and direct public link expose the same context and actual group", async ({ page }) => {
  await fixtures(page);
  await page.goto("/");
  await page.getByLabel("Search query").fill("猫との引っ越し");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: "全1件を見る", exact: true }).click();
  const modal = page.locator(".search-result-item");
  await expect(modal.locator(".result-context")).toHaveText(original.enrichment.context_text);
  await expect(modal.getByRole("navigation", { name: "関連グループ" })).toContainText(shelf.title);
  await modal.getByRole("link", { name: "この公開版を開く" }).click();
  await expect(page.locator(".public-revision-workspace .detail-context")).toHaveText(original.enrichment.context_text);
  await expect(page.getByRole("navigation", { name: "関連グループ" })).toContainText(shelf.title);
});

test("W03/W18: no placement is not a fake recommendation; failure retries and withdrawal never enables reuse", async ({ page }) => {
  await fixtures(page);
  let status = 503;
  await page.route("**/api/cuebook-revisions/revision", route => route.fulfill(status === 200
    ? { json: { revision: { ...revision, shelves: [] } } }
    : { status, json: { error: status === 503 ? "公開版を取得できませんでした" : "この公開版は公開を停止しています。" } }));
  await page.goto("/?revision_id=revision");
  await expect(page.locator(".public-revision-workspace").getByRole("alert")).toContainText("公開版を取得できませんでした");
  await expect(page.getByRole("button", { name: "日程を決めて使う" })).toHaveCount(0);
  status = 200;
  await page.getByRole("button", { name: "再取得", exact: true }).click();
  await expect(page.locator(".detail-context")).toHaveText(original.enrichment.context_text);
  await expect(page.getByRole("navigation", { name: "関連グループ" })).toHaveCount(0);
  status = 410;
  await page.reload();
  await expect(page.locator(".public-revision-workspace").getByRole("alert")).toContainText("公開を停止しています");
  await expect(page.getByRole("button", { name: "日程を決めて使う" })).toHaveCount(0);
});

test("D3/W07: copied group exposes its source without creating or joining anything", async ({ page }) => {
  const mutations = await fixtures(page);
  await page.goto("/?shelf_id=copy");
  await expect(page.getByRole("link", { name: "コピー元のグループを見る" })).toHaveAttribute("href", "/?shelf_id=shelf");
  await page.getByLabel("グループ名", { exact: true }).fill("猫2匹の転居と新生活・編集中");
  await page.screenshot({ path: `../docs/review-screenshots/web/public-context/source-group-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("link", { name: "コピー元のグループを見る" }).click();
  await expect(page.getByRole("heading", { name: shelf.title, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "コピー元のグループを見る" })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel("グループ名", { exact: true })).toHaveValue("猫2匹の転居と新生活・編集中");
  expect(mutations).toEqual([]);
});

test("W11/C01: borrowed original links to public source and browser return preserves private edits", async ({ page }) => {
  const mutations = await fixtures(page);
  await page.goto(`/?cuebook_id=${original.id}`);
  await page.getByLabel("タイトル", { exact: true }).fill("猫との引っ越し・編集中");
  await page.screenshot({ path: `../docs/review-screenshots/web/public-context/borrowed-original-${test.info().project.name}.png`, fullPage: true });
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("cuckoo-cue:web-workspace:v1:local-user") || "{}").saveTitle)).toBe("猫との引っ越し・編集中");
  await page.getByRole("link", { name: "借りた公開リストを見る" }).click();
  await expect(page.locator(".detail-context")).toHaveText(original.enrichment.context_text);
  await page.goBack();
  await expect(page.getByLabel("タイトル", { exact: true })).toHaveValue("猫との引っ越し・編集中");
  expect(mutations).toEqual([]);
});

test("C04/C06: public detail remains readable across widths with long context and group names", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/cuebook-revisions/revision", route => route.fulfill({ json: { revision: { ...revision,
    context_text: original.enrichment.context_text.repeat(30), shelves: [{ id: "shelf", title: shelf.title.repeat(12) }] } } }));
  await page.goto("/?revision_id=revision");
  await expect(page.locator(".detail-context")).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("W11: originals without an origin do not invent provenance", async ({ page }) => {
  const mutations = await fixtures(page);
  await page.route(`**/api/cuebooks/${original.id}`, route => route.fulfill({ json: { cuebook: { ...original, origin_revision_id: null } } }));
  await page.goto(`/?cuebook_id=${original.id}`);
  await expect(page.getByLabel("タイトル", { exact: true })).toHaveValue(original.title);
  await expect(page.getByRole("link", { name: "借りた公開リストを見る" })).toHaveCount(0);
  expect(mutations).toEqual([]);
});
