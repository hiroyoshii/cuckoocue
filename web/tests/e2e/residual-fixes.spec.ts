import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bqWrite, digest } from "../../src/lib/bq-store";
import type { BigQuery } from "@google-cloud/bigquery";

const original = { id: "a54d9e6f-38ae-4780-8986-b9e169f3a178", title: "猫との引っ越し", updated_at: "2026-09-12T00:00:00.000000Z", origin_revision_id: null,
  tasks: [{ id: "e4a0b6d6-eec3-4efa-9d98-b9767cb65bd6", text: "ケージを確認する", default_priority: null, relative_start_day: -7, relative_end_day: 0 }],
  enrichment: { domain: "引っ越し", context_text: "猫と国内で引っ越す", task_groupings: [{ label: "移動", task_offsets: [0] }] } };
const revision = { id: "revision", title: original.title, published_at: original.updated_at, withdrawn_at: null, tasks: original.tasks.map(task => ({ ...task, title: task.text })) };
const shelf = { id: "shelf", title: "猫と暮らす人", context: "猫と国内で引っ越す人", created_by: "local-user", updated_at: original.updated_at, item_count: 1,
  items: [{ revision_id: revision.id, position: 0, revision }] };
const result = { ...original, id: revision.id, ...original.enrichment, tasks: Array.from({ length: 5 }, (_, i) => ({ ...original.tasks[0], id: `t${i}`, text: `転居準備${i}` })), shelves: [{ id: shelf.id, title: shelf.title }] };

test("W15: changing identity drops private summary", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("cuckoo-cue:web-workspace:v1:local-user", JSON.stringify({ version: 1, view: "explore",
    preparedImport: { title: "Aだけの予定", target_anchor_day: "2026-12-01", tasks: [] } })));
  await page.route("**/api/**", route => route.fulfill({ json: { shelves: [], shelf_ids: [] } }));
  await page.goto("/");
  await expect(page.locator(".handoff-panel")).toContainText("Aだけの予定");
  if (test.info().project.name === "mobile") await page.setViewportSize({ width: 1024, height: 844 });
  await page.locator(".connection-panel summary").click();
  await page.getByLabel("Dev user").fill("account-B");
  await expect(page.locator(".handoff-panel")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("cuckoo-cue:web-workspace:v1:account-B") || "{}").preparedImport)).toBeNull();
});

test("W15/C01: history location survives identity replacement and reload without carrying private data", async ({ page }) => {
  const historyOwners: string[] = [];
  await page.route("**/api/**", route => {
    if (new URL(route.request().url()).pathname === "/api/runs") {
      historyOwners.push(route.request().headers()["x-dev-user-id"]);
      return route.fulfill({ json: { runs: [], nextCursor: null } });
    }
    return route.fulfill({ json: { shelves: [], shelf_ids: [] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "完了履歴", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\?view=history$/);
  await expect(page.getByRole("heading", { name: "完了履歴", exact: true })).toBeVisible();
  if (test.info().project.name === "mobile") await page.setViewportSize({ width: 1024, height: 844 });
  await page.locator(".connection-panel summary").click();
  await page.getByLabel("Dev user").fill("account-B");
  await expect.poll(() => historyOwners.at(-1)).toBe("account-B");
  await expect(page.getByRole("heading", { name: "完了履歴", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\?view=history$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "完了履歴", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\?view=history$/);
});

test("C01: search expansion survives group navigation and browser back/forward", async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/search") return route.fulfill({ json: { results: [result], nextCursor: null } });
    if (path === "/api/shelves/shelf") return route.fulfill({ json: { shelf } });
    return route.fulfill({ json: { shelves: [shelf], shelf_ids: [] } });
  });
  await page.goto("/");
  await page.getByLabel("Search query").fill("猫との引っ越し");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: "全5件を見る" }).click();
  await page.locator(".result-shelves button").click();
  await expect(page.locator(".shelf-detail-workspace")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "折りたたむ", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.locator(".shelf-detail-workspace")).toBeVisible();
});

test("W15: a private read finishing after account change cannot populate the new account", async ({ page }) => {
  let release: (() => void) | undefined;
  let started = false;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/cuebooks/${original.id}`) {
      if (route.request().headers()["x-dev-user-id"] === "local-user") {
        started = true;
        await new Promise<void>(resolve => { release = resolve; });
        return route.fulfill({ json: { cuebook: original } });
      }
      return route.fulfill({ status: 404, json: { error: "原本が見つかりません" } });
    }
    return route.fulfill({ json: { shelves: [], shelf_ids: [] } });
  });
  await page.setViewportSize({ width: 1024, height: 844 });
  await page.goto(`/?cuebook_id=${original.id}`);
  await expect.poll(() => started).toBe(true);
  await page.locator(".connection-panel summary").click();
  await page.getByLabel("Dev user").fill("account-B");
  await expect(page.locator(".error-banner")).toContainText("原本が見つかりません");
  release!();
  await expect(page.getByLabel("タイトル", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("cuckoo-cue:web-workspace:v1:account-B") || "{}").savedCuebook)).toBeNull();
});

test("C01: reloading an original preserves unsaved edits", async ({ page }) => {
  await page.route("**/api/**", route => {
    if (new URL(route.request().url()).pathname === `/api/cuebooks/${original.id}`) return route.fulfill({ json: { cuebook: original } });
    return route.fulfill({ json: { shelves: [], shelf_ids: [], revisions: [] } });
  });
  await page.goto(`/?cuebook_id=${original.id}`);
  await page.getByLabel("タイトル", { exact: true }).fill("猫との引っ越し・編集中");
  await page.reload();
  await expect(page.getByLabel("タイトル", { exact: true })).toHaveValue("猫との引っ越し・編集中");
});

test("G14: standalone group creation survives an unknown result and reload", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/search") return route.fulfill({ json: { results: [result], nextCursor: null } });
    if (path === "/api/shelves" && route.request().method() === "POST") {
      requests.push(route.request().postDataJSON());
      return requests.length === 1 ? route.fulfill({ status: 503, json: { error: "応答不明" } }) : route.fulfill({ status: 201, json: { shelf } });
    }
    if (path === "/api/shelves/shelf") return route.fulfill({ json: { shelf } });
    return route.fulfill({ json: { shelves: [shelf], shelf_ids: [] } });
  });
  await page.goto("/");
  await page.getByLabel("Search query").fill("猫");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: "新しい状況" }).click();
  await page.getByLabel("状況名", { exact: true }).fill("猫と電車で移動");
  await page.getByLabel("どんな状況か").fill("猫2匹と電車で引っ越す");
  await page.getByRole("button", { name: "作成", exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText("応答不明");
  await page.reload();
  await expect(page.getByLabel("状況名", { exact: true })).toHaveValue("猫と電車で移動");
  await page.getByRole("button", { name: "作成を再試行" }).click();
  await expect(page.locator(".shelf-detail-workspace")).toBeVisible();
  expect(requests[1]).toEqual(requests[0]);
});

test("W20/W14/C02: rejected publication can be reconfirmed, published links and unjoined owned groups are reachable", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/cuebooks") return route.fulfill({ json: { cuebooks: [original], nextCursor: null } });
    if (path === `/api/cuebooks/${original.id}`) return route.fulfill({ json: { cuebook: original } });
    if (path.endsWith("/revisions")) return route.fulfill({ json: { revisions: [{ ...revision, shelves: [shelf] }] } });
    if (path === "/api/cuebook-revisions/revision") return route.fulfill({ json: { revision } });
    if (path === "/api/cuebook-revisions") {
      requests.push(route.request().postDataJSON());
      return requests.length === 1 ? route.fulfill({ status: 409, json: { error: "原本が変更されています" } }) : route.fulfill({ status: 201, json: { revision, shelf } });
    }
    return route.fulfill({ json: { shelves: [shelf], shelf_ids: [], runs: [], nextCursor: null } });
  });
  await page.goto(`/?cuebook_id=${original.id}`);
  await page.getByRole("button", { name: "グループに公開する", exact: true }).click();
  await page.getByLabel("公開先", { exact: true }).selectOption(shelf.id);
  await page.getByRole("checkbox", { name: /個人情報/ }).check();
  await page.getByRole("button", { name: "公開する", exact: true }).click();
  await expect(page.getByRole("button", { name: "公開を再試行", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "最新の原本を確認" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `../docs/review-screenshots/web/residual-fixes/conflict-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "公開先を確認し直す" }).click();
  await page.getByRole("checkbox", { name: /個人情報/ }).check();
  await page.getByRole("button", { name: "公開する", exact: true }).click();
  await expect(page.getByRole("link", { name: "公開した版を見る" })).toHaveAttribute("href", "/?revision_id=revision");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `../docs/review-screenshots/web/residual-fixes/published-${test.info().project.name}.png`, fullPage: true });
  expect(requests[1].revision_id).not.toBe(requests[0].revision_id);
  await page.getByRole("link", { name: "公開した版を見る" }).click();
  await expect(page.getByRole("heading", { name: original.title, exact: true })).toBeVisible({ timeout: 15000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `../docs/review-screenshots/web/residual-fixes/revision-${test.info().project.name}.png`, fullPage: true });
  await page.goto("/?view=library");
  await expect(page.getByRole("region", { name: "自分のグループ" })).toContainText(shelf.title);
  await page.screenshot({ path: `../docs/review-screenshots/web/residual-fixes/owned-groups-${test.info().project.name}.png`, fullPage: true });
});

test("W17: invalid search pagination is an input error, not a connection failure", async ({ request }) => {
  const response = await request.post("/api/search", { headers: { "x-dev-user-id": "local-user" }, data: { message: "引っ越し", page_size: 100 } });
  expect(response.status()).toBe(400);
});

test("G06: a confirmed failed BQ job gets one deterministic successor; running/committed jobs are not replayed", async () => {
  for (const mode of ["failed", "running", "committed"] as const) {
    const created: string[] = [];
    const jobs = new Set<string>();
    const input = { test: mode };
    const fake = {
      createQueryJob: async ({ jobId }: { jobId: string }) => { if (jobs.has(jobId)) throw { code: 409 }; jobs.add(jobId); created.push(jobId); },
      job: (id: string) => ({
        getMetadata: async () => [{ configuration: { labels: { cue_request: digest(input).slice(0, 63) } }, status: id.includes("_retry_") ? { state: "DONE" } : mode === "running" ? { state: "RUNNING" } : { state: "DONE", errorResult: { reason: "backendError" } } }],
        getQueryResults: async () => { if (!id.includes("_retry_")) throw new Error("backendError"); return [[{ saved: true }]]; },
      }),
      getJobs: async () => [mode === "committed" ? [{ metadata: { statistics: { query: { statementType: "COMMIT_TRANSACTION" } }, status: { state: "DONE" } } }] : []],
    } as unknown as BigQuery;
    const write = () => bqWrite("owner", mode, input, "BEGIN TRANSACTION; COMMIT TRANSACTION;", {}, async () => [{ recovered: true }], fake);
    if (mode === "running") { await expect(write()).rejects.toThrow("backendError"); expect(created).toHaveLength(1); }
    else {
      const first = await write(); const again = await write(); expect(again).toEqual(first);
      expect(created).toHaveLength(mode === "failed" ? 2 : 1);
    }
  }
});
