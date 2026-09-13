import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tasks = [
  task("退去日と入居日を確定する", 0, -35, -28),
  task("引越し業者の見積もりと搬出入時間を確定する", 0, -30, -25),
  task("転出届と転入届の提出先を確認する", 0, -21, -10),
  task("電気、ガス、水道の停止と開始を申し込む", 1, -14, -7),
  task("郵便転送と住所変更を申し込む", 2, -7, -4),
].map((task, index) => ({ ...task, id: `source-task-${index}` }));

const searchResults = [
  {
    id: "moving-japan",
    title: "東京から名古屋への引っ越し手続き",
    domain: "引っ越し",
    context_text: "日本国内で地域をまたいで転居する際の、行政手続きと生活基盤の変更に向いています。",
    tasks,
    task_groupings: [
      { label: "日程と業者", task_offsets: [0, 1] },
      { label: "行政手続き", task_offsets: [2] },
      { label: "生活基盤", task_offsets: [3, 4] },
    ],
    text_matched: true,
    shelves: [{ id: "shelf-1", title: "猫と暮らす人の引っ越し" }],
  },
  {
    id: "moving-uk",
    title: "ロンドンからブライトンへの引っ越し手続き",
    domain: "引っ越し",
    context_text: "英国国内で転居する際の Council Tax や住所変更に向いています。",
    tasks: tasks.slice(0, 4).map((item, index) => ({ ...item, text: `英国の手続き ${index + 1}` })),
    task_groupings: [{ label: "英国の手続き", task_offsets: [0, 1, 2, 3] }],
    text_matched: true,
  },
];

const shelfDetail = {
  id: "shelf-1",
  title: "猫と暮らす人の引っ越し",
  context: "猫と暮らしながら賃貸を退去し、県外へ引っ越す人向け。",
  forked_from_shelf_id: null,
  created_by: "another-user",
  created_at: "2026-09-06T00:00:00.000Z",
  updated_at: "2026-09-06T00:00:00.000Z",
  item_count: 2,
  items: [
    shelfItem("revision-1", "猫の移動準備", 0),
    shelfItem("revision-2", "賃貸退去の手続き", 1),
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/memberships", (route) => route.fulfill({ json: { shelf_ids: [] } }));
  await page.route("**/api/reuse", (route) => route.fulfill({ json: { runId: "scheduled-example" } }));
  await page.route("**/api/shelves", (route) => route.fulfill({ json: { shelves: [] } }));
  await page.route("**/api/search", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({ json: { results: searchResults, searchDomain: "引っ越し", nextCursor: null } });
  });
  await page.route("**/api/import-payload/**", async (route) => {
    await route.fulfill({ json: { importPayload: { version: 1, title: searchResults[0].title, target_anchor_day: "2026-10-01", tasks: tasks.map((item) => ({ title: item.text, ...item, text: undefined })) } } });
  });
});

test("search is scannable, accessible, and restored after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('img[alt="Cuckoo Cue"]:visible')).toBeVisible();
  await expect(page.getByRole("region", { name: /探して、選んで、\s*スマホで管理する。/ }).getByRole("img", { name: /使い方の例/ })).toBeVisible();
  await expect(page.locator(".brand-empty")).toHaveCount(0);
  await expect(page.locator("#target-anchor-day")).toHaveCount(0);
  await page.getByLabel("Search query").fill("東京から名古屋へ引っ越す。役所とライフラインを整理したい");
  const searchButton = page.locator("form").getByRole("button", { name: "検索", exact: true });
  await searchButton.focus();
  await expect(searchButton).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: searchResults[0].title })).toBeVisible();
  await expect(page.locator(".search-introduction")).toHaveCount(0);
  await expect(page.locator(".cue-result")).toHaveCount(2);
  await expect(page.locator(".result-task-preview input, .result-task-preview button")).toHaveCount(0);
  await expect(page.locator(".cue-result").first()).toContainText(searchResults[0].context_text);
  await expect(page.locator(".cue-result").first().locator(".result-task-preview")).toHaveText(searchResults[0].tasks.slice(0, 3).map(task => task.text).join(" / "));

  await page.getByRole("button", { name: `${searchResults[0].title}の日程を決めて使う` }).click();
  await expect(page.getByRole("heading", { name: "最終日を選ぶ" })).toBeVisible();
  await page.locator("#target-anchor-day").fill("2026-10-01");
  const pastConfirmation = page.getByRole("checkbox", { name: "過去の日付を含む日程で保存する" });
  if (await pastConfirmation.isVisible()) await pastConfirmation.check();
  await page.getByRole("button", { name: "この日程で保存", exact: true }).click();
  await expect(page.getByRole("heading", { name: searchResults[0].title })).toBeVisible();
  await expect(page.locator(".handoff-panel")).toContainText("2026/10/01を基準");
  await expect(page.getByRole("link", { name: "Androidで開く" })).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.reload();
  await expect(page.getByLabel("Search query")).toHaveValue(/東京から名古屋/);
  await expect(page.locator(".search-introduction")).toHaveCount(0);
  await expect(page.locator(".cue-result")).toHaveCount(2);
  await expect(page.locator(".handoff-panel")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("completed-list review uses relative dates and named task groups", async ({ page }) => {
  let savedBody: Record<string, unknown> = {};
  await page.route("**/api/runs/completed-run", async (route) => {
    await route.fulfill({ json: { run: { title: searchResults[0].title, run_id: "completed-run", task_ids: tasks.map((_, i) => `task-${i}`), source_anchor_day: "2026-10-01", tasks } } });
  });
  await page.route("**/api/task-list-enrichment", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ json: { enrichment: { domain: "引っ越し", context_text: searchResults[0].context_text, task_groupings: searchResults[0].task_groupings } } });
  });
  await page.route("**/api/cuebooks/*", async (route) => {
    savedBody = route.request().postDataJSON();
    await route.fulfill({ json: { cuebook: { ...route.request().postDataJSON().content, id: "owned", origin_revision_id: null, updated_at: "2026-09-12T00:00:00.000000Z" } } });
  });

  await page.goto("/?run_id=completed-run");
  await page.getByRole("button", { name: "再利用用に整える", exact: true }).click();
  await expect(page.getByRole("heading", { name: "再利用用に整える" })).toBeVisible();
  await expect(page.locator(".save-form .brand-mark")).toHaveCount(0);
  await expect(page.locator(".completion-anchor")).toHaveCount(0);
  await page.getByRole("button", { name: /^1件目の日程:/ }).click();
  await expect(page.getByLabel("開始（最終日から）", { exact: true })).toHaveValue("35");
  await expect(page.getByLabel("期限（最終日から）", { exact: true })).toHaveValue("28");
  await page.getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByText("-35", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "再利用情報を準備" }).click();
  await expect(page.getByLabel("Group label 1")).toHaveValue("日程と業者");
  await expect(page.getByText(tasks[0].text).last()).toBeVisible();
  await expect(page.getByText(/task_offsets|offset/i)).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".editable-tasks")).toContainText("最終日の5週間前〜4週間前");
  await expect(page.getByLabel("Group label 1")).toHaveValue("日程と業者");

  await page.getByRole("button", { name: "自分用に保存" }).click();
  await expect(page.getByText("保存済み・自分だけ", { exact: true })).toBeVisible();
  expect(savedBody).toHaveProperty("operation_id");
  expect((savedBody as { content: { tasks: typeof tasks } }).content.tasks[0].relative_start_day).toBe(-35);
  expect((savedBody as { content: { enrichment: { task_groupings: typeof searchResults[0]["task_groupings"] } } }).content.enrichment.task_groupings[0].task_offsets).toEqual([0, 1]);
});

test("public contexts fork into an independently editable shelf", async ({ page }) => {
  let currentShelf = {
    ...structuredClone(shelfDetail),
    forked_from_shelf_id: null as string | null,
  };
  await page.route("**/api/shelves", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        json: {
          shelf: {
            ...shelfDetail,
            id: "created-shelf",
            title: "新しい本棚",
            context: "新しい文脈",
            item_count: 0,
            items: [],
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { shelves: [{ ...currentShelf, items: undefined }] } });
  });
  await page.route("**/api/shelves/shelf-1", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { items: Array<{ revision_id: string; position: number }> };
      currentShelf = {
        ...currentShelf,
        items: body.items.map((item) => currentShelf.items.find((existing) => existing.revision_id === item.revision_id)!),
        item_count: body.items.length,
      };
    }
    await route.fulfill({ json: { shelf: currentShelf } });
  });
  await page.route("**/api/shelves/shelf-1/fork", async (route) => {
    currentShelf = {
      ...currentShelf,
      id: "forked-shelf",
      title: `${shelfDetail.title}の派生`,
      created_by: "local-user",
      forked_from_shelf_id: "shelf-1",
    };
    await route.fulfill({ status: 201, json: { shelf: currentShelf } });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /探して、選んで、\s*スマホで管理する。/, exact: true })).toBeVisible();
  await page.getByLabel("Search query").fill("猫と引っ越す");
  await page.locator(".search-composer").getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByRole("heading", { name: "状況から探す" })).toBeVisible();
  await expect(page.getByRole("button", { name: "完了履歴" })).toBeVisible();
  await expect(page.locator('a[href^="intent://"]')).toHaveCount(0);
  await page.locator(".result-shelves").getByRole("button", { name: shelfDetail.title, exact: true }).click();

  await expect(page.getByRole("heading", { name: shelfDetail.title })).toBeVisible();
  await expect(page.getByRole("button", { name: "参加する" })).toBeVisible();
  await page.getByRole("button", { name: "全件コピー", exact: true }).click();
  await page.getByRole("button", { name: "公開グループとしてコピー" }).click();
  await expect(page.getByLabel("グループ名", { exact: true })).toHaveValue(`${shelfDetail.title}の派生`);
  await expect(page.getByRole("button", { name: "日程を決めて使う" })).toHaveCount(2);
  await expect(page.locator(".shelf-revision")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /上へ|下へ|外す/ })).toHaveCount(6);
  await page.getByRole("button", { name: "日程を決めて使う" }).first().click();
  await expect(page.getByLabel("最終日", { exact: true })).toBeEnabled();
  await page.getByLabel("最終日", { exact: true }).fill("2026-12-01");
  await expect(page.getByLabel("1件目の開始日", { exact: true })).toHaveValue("2026-10-27");
  await expect(page.getByLabel("1件目の期限", { exact: true })).toHaveValue("2026-11-03");
});

test("G10/W06: joining persists, failed leaving does not hide membership", async ({ page }, info) => {
  let joined = false;
  let failLeave = true;
  await page.route("**/api/shelves", (route) => route.fulfill({ json: { shelves: [shelfDetail] } }));
  await page.route("**/api/shelves/shelf-1", (route) => route.fulfill({ json: { shelf: shelfDetail } }));
  await page.route("**/api/memberships", (route) => route.fulfill({ json: { shelf_ids: joined ? [shelfDetail.id] : [] } }));
  await page.route("**/api/memberships/shelf-1", (route) => {
    const requested = route.request().postDataJSON().joined;
    if (!requested && failLeave) {
      failLeave = false;
      return route.fulfill({ status: 503, json: { error: "参加状態を保存できませんでした。" } });
    }
    joined = requested;
    return route.fulfill({ json: { shelf_ids: joined ? [shelfDetail.id] : [] } });
  });
  await page.goto("/");
  await page.getByLabel("Search query").fill("猫と引っ越す");
  await page.locator(".search-composer").getByRole("button", { name: "検索", exact: true }).click();
  await page.locator(".result-shelves").getByRole("button", { name: shelfDetail.title, exact: true }).click();
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await expect(page.getByRole("button", { name: "参加を解除", exact: true })).toBeVisible();
  await page.reload();
  if (info.project.name === "mobile") {
    await page.locator(".mobile-navigation summary").click();
    await page.locator(".mobile-navigation").getByRole("button", { name: shelfDetail.title, exact: true }).click();
  } else {
    await page.locator(".joined-groups").getByRole("button", { name: shelfDetail.title, exact: true }).click();
  }
  await page.getByRole("button", { name: "参加を解除", exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText("参加状態を保存できませんでした。");
  await expect(page.getByRole("button", { name: "参加を解除", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "参加を解除", exact: true }).click();
  await expect(page.getByRole("button", { name: "参加する", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".joined-groups, .mobile-navigation summary")).toHaveCount(0);
});

test("G14: fork retries the confirmed version after reload and source updates", async ({ page }) => {
  let source = structuredClone(shelfDetail);
  const requests: unknown[] = [];
  await page.route("**/api/shelves", (route) => route.fulfill({ json: { shelves: [source] } }));
  await page.route("**/api/shelves/shelf-1", (route) => route.fulfill({ json: { shelf: source } }));
  await page.route("**/api/shelves/shelf-1/fork", (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      source = { ...source, updated_at: "2026-09-12T01:00:00.000Z", items: [] };
      return route.fulfill({ status: 503, json: { error: "保存結果を確認できませんでした。" } });
    }
    return route.fulfill({ status: 201, json: { shelf: { ...shelfDetail, id: "forked-shelf", created_by: "local-user", forked_from_shelf_id: source.id } } });
  });
  await page.goto("/");
  await page.getByLabel("Search query").fill("猫と引っ越す");
  await page.locator(".search-composer").getByRole("button", { name: "検索", exact: true }).click();
  await page.locator(".result-shelves").getByRole("button", { name: shelfDetail.title, exact: true }).click();
  await page.getByRole("button", { name: "全件コピー", exact: true }).click();
  await page.getByRole("button", { name: "公開グループとしてコピー" }).click();
  await expect(page.locator(".shelf-detail-workspace [role=alert]")).toContainText("保存結果を確認できませんでした。");
  await page.reload();
  await page.getByRole("button", { name: "コピーを再試行" }).click();
  await expect(page.getByLabel("グループ名", { exact: true })).toHaveValue(shelfDetail.title);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[0]).toMatchObject({ expected_updated_at: shelfDetail.updated_at });
  await expect(page.locator(".shelf-revision")).toHaveCount(2);
});

function task(text: string, default_priority: number, relative_start_day: number, relative_end_day: number) {
  return { text, default_priority, relative_start_day, relative_end_day };
}

function shelfItem(revisionId: string, title: string, position: number) {
  return {
    revision_id: revisionId,
    position,
    revision: {
      id: revisionId,
      source_cuebook_id: `cuebook-${revisionId}`,
      revision: 1,
      title,
      published_at: "2026-09-06T00:00:00.000Z",
      withdrawn_at: null,
      tasks: tasks.slice(0, 3).map((item) => ({
        id: item.id,
        title: item.text,
        default_priority: item.default_priority,
        relative_start_day: item.relative_start_day,
        relative_end_day: item.relative_end_day,
      })),
    },
  };
}
