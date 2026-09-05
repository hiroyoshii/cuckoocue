import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const tasks = [
  task("退去日と入居日を確定する", 0, -35, -28),
  task("引越し業者の見積もりと搬出入時間を確定する", 0, -30, -25),
  task("転出届と転入届の提出先を確認する", 0, -21, -10),
  task("電気、ガス、水道の停止と開始を申し込む", 1, -14, -7),
  task("郵便転送と住所変更を申し込む", 2, -7, -4),
];

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

test.beforeEach(async ({ page }) => {
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
  await expect(page.locator(".brand-empty .brand-mark")).toBeVisible();
  await expect(page.getByLabel("完了予定日")).toHaveCount(0);
  await page.getByLabel("Search query").fill("東京から名古屋へ引っ越す。役所とライフラインを整理したい");
  const searchButton = page.locator("form").getByRole("button", { name: "探す", exact: true });
  await searchButton.focus();
  await expect(searchButton).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: searchResults[0].title })).toBeVisible();
  await expect(page.locator(".cue-result")).toHaveCount(2);
  await expect(page.locator(".task-preview input, .task-preview button")).toHaveCount(0);
  await expect(page.getByText("このリストが向いている状況").first()).toBeVisible();
  await expect(page.locator(".cue-result").first().locator(".task-row")).toHaveCount(3);

  await page.getByRole("button", { name: `${searchResults[0].title}をAndroidに取り込む` }).click();
  await expect(page.getByRole("heading", { name: "いつ完了する予定ですか？" })).toBeVisible();
  await page.getByLabel("完了予定日").fill("2026-10-01");
  await page.getByRole("button", { name: "この日程で使う" }).click();
  await expect(page.getByRole("heading", { name: searchResults[0].title })).toBeVisible();
  await expect(page.locator(".handoff-panel")).toContainText("2026/10/01を基準");
  await expect(page.getByRole("link", { name: "Androidで開く" })).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.reload();
  await expect(page.getByLabel("Search query")).toHaveValue(/東京から名古屋/);
  await expect(page.locator(".cue-result")).toHaveCount(2);
  await expect(page.locator(".handoff-panel")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("completed-list review uses dates and named task groups", async ({ page }) => {
  let savedBody: Record<string, unknown> = {};
  await page.route("**/api/runs/completed-run", async (route) => {
    await route.fulfill({ json: { run: { title: searchResults[0].title, source_anchor_day: "2026-10-01", tasks } } });
  });
  await page.route("**/api/task-list-enrichment", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ json: { enrichment: { domain: "引っ越し", context_text: searchResults[0].context_text, task_groupings: searchResults[0].task_groupings } } });
  });
  await page.route("**/api/task-list-entries", async (route) => {
    savedBody = route.request().postDataJSON();
    await route.fulfill({ json: { entry: { title: searchResults[0].title } } });
  });

  await page.goto("/?run_id=completed-run");
  await expect(page.getByRole("heading", { name: "完了した内容を残す" })).toBeVisible();
  await expect(page.locator(".save-form .brand-mark")).toHaveCount(0);
  await expect(page.getByText("2026/10/01")).toBeVisible();
  await expect(page.getByLabel("Start date 1")).toHaveValue("2026-08-27");
  await expect(page.getByLabel("End date 1")).toHaveValue("2026-09-03");
  await expect(page.getByText("-35", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "検索情報を準備" }).click();
  await expect(page.getByLabel("Group label 1")).toHaveValue("日程と業者");
  await expect(page.getByText(tasks[0].text).last()).toBeVisible();
  await expect(page.getByText(/task_offsets|offset/i)).toHaveCount(0);

  const operationId = await page.evaluate(() => JSON.parse(sessionStorage.getItem("cuckoo-cue:web-workspace:v1") ?? "{}").saveOperationId);
  await page.reload();
  await expect(page.getByLabel("Start date 1")).toHaveValue("2026-08-27");
  await expect(page.getByLabel("Group label 1")).toHaveValue("日程と業者");

  await page.getByRole("checkbox", { name: /個人情報が含まれていない/ }).check();
  await page.getByRole("button", { name: "確認して残す" }).click();
  await expect(page.getByRole("heading", { name: "残しました" })).toBeVisible();
  expect(savedBody).toHaveProperty("operation_id");
  expect(savedBody.operation_id).toBe(operationId);
  expect((savedBody as { tasks: typeof tasks }).tasks[0].relative_start_day).toBe(-35);
  expect((savedBody as { task_groupings: typeof searchResults[0]["task_groupings"] }).task_groupings[0].task_offsets).toEqual([0, 1]);
});

function task(text: string, default_priority: number, relative_start_day: number, relative_end_day: number) {
  return { text, default_priority, relative_start_day, relative_end_day };
}
