import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { editorialCuebooks, editorialShelves, editorialSources } from "../../data/editorial-shelves.mjs";
import type { TaskDraft } from "../../src/components/tasks/task-values";

// Actual seed content, API transport replaced. These tests do not prove BQ/auth integration.
function shelfFixture(index: number) {
  const group = editorialShelves[index];
  return { ...group, item_count: 6, is_owned: false, created_at: "2026-09-21", updated_at: "2026-09-21",
    curation: { is_default: true, curator_label: "CuckooCue編集", reviewed_at: "2026-09-21" },
    items: group.cuebook_keys.map((key: string, position: number) => {
      const cue = editorialCuebooks.find(c => c.key === key)!;
      return { revision_id: cue.revision_id, position, revision: {
        id: cue.revision_id, title: cue.title, withdrawn_at: null, published_at: "2026-09-21",
        tasks: cue.tasks.map((task: TaskDraft, i: number) => ({ ...task, id: `${cue.cuebook_id}-task-${i + 1}`, title: task.text })),
        provenance: { ...cue.provenance, sources: cue.source_ids.map((id: string) => editorialSources.find(source => source.id === id)) },
      } };
    }),
  };
}
async function fixtures(page: Page) {
  await page.route("**/api/cuebook-revisions/editorial-revision-*", route => {
    const id = route.request().url().split("/").at(-1);
    const cue = editorialCuebooks.find(c => c.revision_id === id)!;
    const summary = editorialShelves.flatMap((_, index) => shelfFixture(index).items).find(item => item.revision.id === id)!.revision;
    return route.fulfill({ json: { revision: { ...summary, context_text: cue.context_text, domain: cue.domain, task_groupings: cue.task_groupings, shelves: [] } } });
  });
  await page.route("**/api/memberships", route => route.fulfill({ json: { shelf_ids: [] } }));
  await page.route("**/api/shelves", route => route.fulfill({ json: { shelves: [] } }));
  await page.route("**/api/shelves/editorial-shelf-*", route => {
    const index = editorialShelves.findIndex(group => route.request().url().endsWith(group.id));
    return route.fulfill({ json: { shelf: shelfFixture(index) } });
  });
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.resolve("../docs/review-screenshots/web/context-qa-fixed-tests", `${name}-${test.info().project.name}.png`), fullPage: true });
}
test("examples preserve the search draft, selected procedure, cancellation and reload", async ({ page }) => {
  await fixtures(page);
  const draft = "猫2匹と来月引っ越す。車がない";
  let searches = 0;
  await page.route("**/api/search", route => { searches++; return route.fulfill({ json: { results: [] } }); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "運営が用意した例", exact: true })).toBeVisible();
  await page.getByLabel("Search query").fill(draft);
  await page.getByRole("button", { name: /^一泊のソロキャンプに行く/ }).click();
  await page.locator(".context-candidates").getByRole("button", { name: /^雨天時/ }).click();
  const detail = page.locator(".context-candidate-detail");
  await expect(detail).toContainText("雨天時に調理しないキャンプ飯へ切り替える");
  await expect(detail.locator(".read-task-list li")).toHaveCount(5);
  await expect(page.getByLabel("Search query")).toHaveValue(draft);
  await expect(page.locator(".context-preset-option")).toHaveCount(0);
  await capture(page, "selected");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "他の例を見る", exact: true }).click();
  await page.getByRole("button", { name: "閲覧中の例に戻る", exact: true }).click();
  await expect(detail).toContainText("雨天時に調理しないキャンプ飯へ切り替える");
  await expect(page.getByLabel("Search query")).toHaveValue(draft);
  await page.reload();
  await expect(detail).toContainText("雨天時に調理しないキャンプ飯へ切り替える");
  await expect(page.getByLabel("Search query")).toHaveValue(draft);
  await expect(page.getByText("あなたの状況", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "例を閉じる", exact: true }).click();
  await expect(page.getByLabel("Search query")).toHaveValue(draft);
  await expect(page.getByLabel("Search query")).toBeFocused();
  expect(searches).toBe(0);
});
test("typing a preset label searches procedures and retains their actual placement links", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/shelves", route => route.fulfill({ json: { shelves: [{ ...shelfFixture(2), id: "other-user-group", title: "他の人のグループ" }] } }));
  const group = shelfFixture(2);
  const revision = group.items[0].revision;
  await page.route("**/api/search", route => route.fulfill({ json: { results: [{ ...revision,
    tasks: revision.tasks, context_text: "一泊のキャンプで食事を準備する", domain: "キャンプ・アウトドア", task_groupings: null,
    shelves: [{ id: "other-user-group", title: "他の人のグループ" }],
  }], nextCursor: null } }));
  await page.goto("/");
  await page.getByRole("button", { name: /^一泊のソロキャンプに行く/ }).click();
  await expect(page.locator(".context-candidates button")).toHaveCount(6);
  await page.getByLabel("Search query").fill("一泊のソロキャンプに行く");
  await page.locator(".search-composer").getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.locator(".search-result-item")).toHaveCount(1);
  await expect(page.getByLabel("Search query")).toHaveValue("一泊のソロキャンプに行く");
  await expect(page.locator(".context-preset-contents")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "関連グループ" })).toContainText("他の人のグループ");
  await expect(page.locator(".related-contexts")).toHaveCount(0);
  await capture(page, "free-input");
  await page.reload();
  await expect(page.locator(".context-preset-contents")).toHaveCount(0);
  await expect(page.getByLabel("Search query")).toHaveValue("一泊のソロキャンプに行く");
});
test("preset read failure retries; uncurated groups and withdrawn revisions cannot be used", async ({ page }) => {
  await fixtures(page);
  let mode = "failure";
  await page.route("**/api/shelves/editorial-shelf-solo-camp-meals", route => {
    if (mode === "failure") return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    const shelf = shelfFixture(2);
    if (mode === "uncurated") shelf.curation.is_default = false;
    if (mode === "withdrawn") return route.fulfill({ json: { shelf: { ...shelf, items: shelf.items.map((item: { revision: object }) => ({ ...item, revision: { ...item.revision, withdrawn_at: "2026-10-26" } })) } } });
    return route.fulfill({ json: { shelf } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /^一泊のソロキャンプに行く/ }).click();
  await expect(page.locator(".context-preset-error")).toContainText("例を読み込めませんでした");
  await expect(page.getByLabel("Search query")).toBeVisible();
  mode = "uncurated";
  await page.getByRole("button", { name: "例を再読み込み", exact: true }).click();
  await expect(page.locator(".context-preset-error")).toContainText("現在利用できません");
  mode = "withdrawn";
  await page.getByRole("button", { name: "例を再読み込み", exact: true }).click();
  await expect(page.getByText("現在利用できる手順はありません。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "日程を決めて使う", exact: true })).toHaveCount(0);
});
test("preset reuse keeps the selected revision and real relative dates", async ({ page }) => {
  await fixtures(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^一泊のソロキャンプに行く/ }).click();
  await page.locator(".context-candidates").getByRole("button", { name: /^キャンプ飯の調理道具をそろえる/ }).click();
  await page.getByRole("button", { name: "日程を決めて使う", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("キャンプ飯の調理道具をそろえる");
  await dialog.getByLabel("最終日", { exact: true }).fill("2027-01-20");
  await expect(dialog).toContainText("燃料の残量と使用可能な火器を確認する");
  await expect(dialog.getByLabel("1件目の期限", { exact: true })).toHaveValue("2027-01-15");
  await expect(dialog.getByLabel("2件目の期限", { exact: true })).toHaveValue("2027-01-17");
  await page.route("**/api/reuse", route => route.fulfill({ status: 503, json: { error: "保存の確認待ち" } }));
  const request = page.waitForRequest(request => request.url().endsWith("/api/reuse") && request.method() === "POST");
  await dialog.getByRole("button", { name: "この日程で保存", exact: true }).click();
  const input = (await request).postDataJSON();
  expect(input.source).toEqual({ type: "revision", id: "editorial-revision-camp-cooking-tools-v1" });
  expect(input.task_dates).toHaveLength(5);
});

test("a failed search stays with its original request while examples can be browsed", async ({ page }) => {
  await fixtures(page);
  const sent: unknown[] = [];
  let fail = true;
  await page.route("**/api/search", route => {
    sent.push(route.request().postDataJSON());
    return route.fulfill(fail ? { status: 503, json: { error: "検索に失敗しました。" } } : { json: { results: [], nextCursor: null } });
  });
  await page.goto("/");
  await page.getByLabel("Search query").fill("猫との引っ越し");
  await page.locator(".search-composer").getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText("猫との引っ越し");
  await page.getByRole("button", { name: "運営が用意した例を見る", exact: true }).click();
  await page.getByRole("button", { name: /^一泊のソロキャンプに行く/ }).click();
  await expect(page.locator(".context-candidate-detail .read-task-list li")).toHaveCount(5);
  await expect(page.locator(".error-banner")).toHaveCount(0);
  await page.getByRole("button", { name: "検索結果に戻る", exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText("猫との引っ越し");
  await page.getByLabel("Search query").fill("別の未送信の条件");
  fail = false;
  const retried = page.waitForResponse(r => r.url().endsWith("/api/search"));
  await page.getByRole("button", { name: "再検索", exact: true }).click();
  await retried;
  expect(sent).toEqual([{ message: "猫との引っ越し", page_size: 20 }, { message: "猫との引っ越し", page_size: 20 }]);
  await expect(page.getByLabel("Search query")).toHaveValue("別の未送信の条件");
  await expect(page.locator(".error-banner")).toHaveCount(0);
});

test("individual applicability and private save destination are visible before use", async ({ page }) => {
  await fixtures(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^猫2匹と暮らしている/ }).click();
  await page.locator(".context-candidates").getByRole("button", { name: /^猫2匹を残して一泊する準備/ }).click();
  await expect(page.locator(".context-applicability")).toContainText("健康な成猫二匹");
  await page.getByRole("button", { name: "日程を決めて使う", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("自分用のリスト · 非公開");
  await expect(page.getByRole("dialog")).toContainText("猫2匹を残して一泊する準備");
});

test("revision failure and withdrawal never fall back to an incomplete usable summary", async ({ page }) => {
  await fixtures(page);
  let status = 503;
  await page.route("**/api/cuebook-revisions/editorial-revision-two-cats-daily-v1", route => route.fulfill({ status, json: { error: "Unavailable" } }));
  await page.goto("/");
  await page.getByRole("button", { name: /^猫2匹と暮らしている/ }).click();
  await expect(page.locator(".context-candidate-detail")).toContainText("手順の内容を読み込めませんでした");
  await expect(page.getByRole("button", { name: "日程を決めて使う", exact: true })).toHaveCount(0);
  status = 410;
  await page.getByRole("button", { name: "手順を再読み込み", exact: true }).click();
  await expect(page.locator(".context-candidate-detail")).toContainText("公開を停止しています");
  await expect(page.getByRole("button", { name: "日程を決めて使う", exact: true })).toHaveCount(0);
  await page.locator(".context-candidates").getByRole("button", { name: /^猫2匹を残して一泊する準備/ }).click();
  await expect(page.locator(".context-applicability")).toContainText("健康な成猫二匹");
});

test("mobile shows the selected content before the candidate list and supports returning to it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile reading order");
  await fixtures(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^一泊のソロキャンプに行く/ }).click();
  await expect(page.locator(".context-candidate-detail .read-task-list li")).toHaveCount(5);
  const detail = await page.locator(".context-candidate-detail").boundingBox();
  const candidates = await page.locator(".context-candidates").boundingBox();
  expect(detail!.y).toBeLessThan(candidates!.y);
  await page.getByRole("button", { name: "この例の手順を選ぶ（6件）", exact: true }).click();
  await expect(page.locator(".context-candidates")).toBeFocused();
  await page.locator(".context-candidates").getByRole("button", { name: /^雨天時/ }).click();
  await expect(page.locator(".context-candidate-detail")).toBeFocused();
  await expect(page.locator(".context-candidate-detail .read-task-list li")).toHaveCount(5);
  await expect(page.locator(".context-candidate-detail h3")).toBeInViewport();
});
