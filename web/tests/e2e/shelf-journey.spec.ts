import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const revision = (id: string, title: string) => ({ id, source_cuebook_id: `original-${id}`, title, published_at: "2026-09-12T00:00:00.000Z", withdrawn_at: null,
  tasks: [{ id: `task-${id}`, title: `${title}を確認する`, default_priority: null, relative_start_day: -7, relative_end_day: 0 }] });
const revisions = [revision("r1", "猫の移動準備"), revision("r2", "新居の準備"), revision("r3", "住所手続き")];
const source = { id: "source", title: "猫と引っ越す", context: "猫と電車で引っ越す人", created_by: "author", updated_at: "2026-09-12T00:00:00.000Z", created_at: "2026-09-12T00:00:00.000Z", forked_from_shelf_id: null, item_count: 2,
  items: revisions.slice(0, 2).map((revision, position) => ({ revision, revision_id: revision.id, position })) };

test("W06/W07: membership unknown is not unjoined; fork retries the fixed snapshot and survives auto-join failure", async ({ page }) => {
  let failMembershipReads = true; let joined: string[] = []; const forks: Record<string, unknown>[] = [];
  const original = structuredClone(source);
  const copied = { ...source, id: "copied", created_by: "local-user", forked_from_shelf_id: source.id };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/memberships") return failMembershipReads ? route.fulfill({ status: 503, json: { error: "参加状態の読込失敗" } }) : route.fulfill({ json: { shelf_ids: joined } });
    if (path === "/api/memberships/source") { joined = ["source"]; return route.fulfill({ json: { joined: true } }); }
    if (path === "/api/shelves") return route.fulfill({ json: { shelves: [original, ...(forks.length > 1 ? [copied] : [])] } });
    if (path === "/api/shelves/source") return route.fulfill({ json: { shelf: original } });
    if (path === "/api/shelves/source/fork") {
      forks.push(route.request().postDataJSON());
      if (forks.length === 1) { original.items = []; original.updated_at = "2026-09-12T01:00:00.000Z"; return route.fulfill({ status: 503, json: { error: "自動参加の結果を確認できませんでした" } }); }
      return route.fulfill({ status: 201, json: { shelf: copied } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/?shelf_id=source");
  await expect(page.getByRole("button", { name: "参加状態を確認中" })).toBeDisabled();
  failMembershipReads = false;
  await page.getByRole("button", { name: "参加状態を再取得" }).click();
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await expect(page.getByRole("button", { name: "参加を解除", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "全件コピー", exact: true }).click();
  const confirmation = page.getByRole("region", { name: "全件コピーの確認" });
  await expect(confirmation.getByText(/2件すべて/)).toBeVisible();
  await page.getByRole("button", { name: "公開グループとしてコピー" }).click();
  await expect(page.locator(".shelf-detail-workspace [role=alert]")).toContainText("自動参加");
  await page.reload();
  await expect(confirmation).toContainText("猫の移動準備");
  await expect(confirmation).toContainText("新居の準備");
  await page.getByRole("button", { name: "コピーを再試行" }).click();
  await expect(page.getByLabel("グループ名", { exact: true })).toHaveValue(source.title);
  expect(forks).toHaveLength(2); expect(forks[1]).toEqual(forks[0]);
  expect(forks[0].expected_updated_at).toBe(source.updated_at);
  await expect(page.locator(".shelf-revision")).toHaveCount(2);
});

test("W08: add/remove/reorder/undo are one saved placement; draft and unknown save recover after reload", async ({ page }) => {
  let saved = { ...structuredClone(source), id: "copied", created_by: "local-user", forked_from_shelf_id: "source" };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/memberships") return route.fulfill({ json: { shelf_ids: [saved.id] } });
    if (path === "/api/shelves") return route.fulfill({ json: { shelves: [source, saved] } });
    if (path === "/api/search") return route.fulfill({ json: { results: [{ ...revisions[2], context_text: "引っ越し後", tasks: [{ text: "住所を更新する" }] }], nextCursor: null } });
    if (path === "/api/cuebook-revisions/r3") return route.fulfill({ json: { revision: revisions[2] } });
    if (path === "/api/shelves/copied" && route.request().method() === "PATCH") {
      const input = route.request().postDataJSON(); writes.push(input);
      saved = { ...saved, title: input.title, context: input.context, items: input.items.map((item: { revision_id: string; position: number }) => ({ ...item, revision: revisions.find((r) => r.id === item.revision_id)! })), updated_at: "2026-09-12T01:00:00.000Z" };
      return writes.length === 1 ? route.fulfill({ status: 503, json: { error: "応答を受け取れませんでした" } }) : route.fulfill({ json: { shelf: saved } });
    }
    return route.fulfill({ json: { shelf: saved } });
  });
  await page.goto("/?shelf_id=copied");
  await page.getByLabel("グループ名", { exact: true }).fill("自分の引っ越し準備");
  await page.getByRole("button", { name: "新居の準備を上へ" }).click();
  await page.getByRole("button", { name: "猫の移動準備を外す" }).click();
  await page.getByRole("button", { name: "配置の変更を取り消す" }).click();
  await expect(page.locator(".shelf-revision")).toHaveCount(2);
  await page.getByRole("button", { name: "猫の移動準備を外す" }).click();
  await page.getByRole("button", { name: "公開リストを追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("追加するリストの検索条件").fill("住所手続き");
  await dialog.getByRole("button", { name: "検索", exact: true }).click();
  await dialog.getByRole("button", { name: "内容と公開版を確認" }).click();
  await expect(dialog.getByRole("region", { name: "追加する公開版の確認" })).toContainText("2026-09-12");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "配置に追加" }).click();
  expect(writes).toHaveLength(0);
  await page.reload();
  await expect(page.getByLabel("グループ名", { exact: true })).toHaveValue("自分の引っ越し準備");
  await expect(page.locator(".shelf-revision h2")).toHaveText(["新居の準備", "住所手続き"]);
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect(page.locator(".shelf-detail-workspace [role=alert]")).toContainText("応答を受け取れませんでした");
  await page.reload();
  await page.getByRole("button", { name: "保存を再試行" }).click();
  await expect(page.getByText("変更を保存しました。", { exact: true })).toBeVisible();
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0].items).toEqual([{ revision_id: "r2", position: 0 }, { revision_id: "r3", position: 1 }]);
  await page.getByRole("button", { name: "新居の準備を外す" }).click();
  await page.getByRole("button", { name: "住所手続きを外す" }).click();
  await expect(page.getByText("リストはまだありません。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "変更を破棄" }).click();
  await expect(page.locator(".shelf-revision")).toHaveCount(2);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("W08: conflict keeps changes and requires inspection before a new save operation", async ({ page }) => {
  const saved = { ...source, created_by: "local-user" }; const writes: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/memberships") return route.fulfill({ json: { shelf_ids: [] } });
    if (path === "/api/shelves") return route.fulfill({ json: { shelves: [saved] } });
    if (route.request().method() === "PATCH") {
      writes.push(route.request().postDataJSON());
      return writes.length === 1 ? route.fulfill({ status: 409, json: { error: "別の変更が保存されています" } }) : route.fulfill({ json: { shelf: { ...saved, title: "自分の編集" } } });
    }
    return route.fulfill({ json: { shelf: { ...saved, updated_at: writes.length ? "2026-09-12T01:00:00.000Z" : saved.updated_at } } });
  });
  await page.goto("/?shelf_id=source");
  await page.getByLabel("グループ名", { exact: true }).fill("自分の編集");
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect(page.getByLabel("グループ名", { exact: true })).toHaveValue("自分の編集");
  await expect(page.getByRole("button", { name: "変更を保存", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "最新の内容を確認", exact: true }).click();
  await page.getByRole("button", { name: "確認した版に自分の編集を適用する" }).click();
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect(page.getByText("変更を保存しました。", { exact: true })).toBeVisible();
  expect(writes[1].operation_id).not.toBe(writes[0].operation_id);
  expect(writes[1].expected_updated_at).toBe("2026-09-12T01:00:00.000Z");
});

test("W06: failed group reads retain the destination across reload and retry", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/memberships") return route.fulfill({ json: { shelf_ids: [source.id] } });
    if (path === "/api/shelves") return route.fulfill({ json: { shelves: [source] } });
    if (path === "/api/shelves/source") {
      reads++;
      return reads < 3 ? route.fulfill({ status: 503, json: { error: "グループを取得できませんでした" } }) : route.fulfill({ json: { shelf: source } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: test.info().project.name === "mobile" ? "モバイルの主な操作" : "主な操作", exact: true });
  if (test.info().project.name === "mobile") await nav.locator("summary").click();
  await nav.getByRole("button", { name: source.title, exact: true }).click();
  await expect(page).toHaveURL(/shelf_id=source/);
  await expect(page.getByRole("button", { name: "グループを再取得", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "グループを再取得", exact: true }).click();
  await expect(page.getByRole("heading", { name: source.title, exact: true })).toBeVisible();
  expect(reads).toBe(3);
});

test("W06/C06: all long tasks expand without hiding overflow at supported widths", async ({ page }) => {
  const shelf = structuredClone(source);
  shelf.title = "猫と暮らしながら公共交通機関を利用して遠方への転居を準備する人のグループ";
  shelf.items[0].revision.tasks = Array.from({ length: 200 }, (_, index) => ({ ...shelf.items[0].revision.tasks[0], id: `task-${index}`, title: `${index + 1}件目の準備事項について引っ越しに必要な条件や変更内容を確認して関係者へ連絡する` }));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === "/api/memberships" ? { shelf_ids: [] } : path === "/api/shelves" ? { shelves: [shelf] } : { shelf } });
  });
  await page.goto("/?shelf_id=source");
  await page.getByText("全200件を見る", { exact: true }).click();
  await expect(page.locator(".shelf-revision").first().locator("li")).toHaveCount(200);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("C01: a save finishing after navigation does not reopen the old group; its retry survives", async ({ page }) => {
  let saved = { ...source, created_by: "local-user" }; let calls = 0;
  let release: () => void = () => {};
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/memberships") return route.fulfill({ json: { shelf_ids: [source.id] } });
    if (path === "/api/shelves") return route.fulfill({ json: { shelves: [source] } });
    if (route.request().method() === "PATCH") {
      calls++;
      saved = { ...saved, title: "保存中に移動したグループ" };
      if (calls === 1) await new Promise<void>((resolve) => { release = resolve; });
    }
    return route.fulfill({ json: { shelf: saved } });
  });
  await page.goto("/?shelf_id=source");
  await page.getByLabel("グループ名", { exact: true }).fill("保存中に移動したグループ");
  const response = page.waitForResponse((r) => r.request().method() === "PATCH");
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  const nav = page.getByRole("navigation", { name: test.info().project.name === "mobile" ? "モバイルの主な操作" : "主な操作", exact: true });
  await nav.getByRole("button", { name: "探す", exact: true }).click();
  release(); await response;
  await expect(page.getByRole("heading", { name: /探して、選んで、\s*スマホで管理する。/, exact: true })).toBeVisible();
  if (test.info().project.name === "mobile") await nav.locator("summary").click();
  await nav.getByRole("button", { name: source.title, exact: true }).click();
  await page.getByRole("button", { name: "保存を再試行" }).click();
  await expect(page.getByText("変更を保存しました。", { exact: true })).toBeVisible();
  expect(calls).toBe(2);
});
