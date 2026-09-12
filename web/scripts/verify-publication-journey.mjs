import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { BigQuery } from "@google-cloud/bigquery";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (process.env.CUE_BIGQUERY_DATASET !== "cuckoo_cue_web_verification" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" || process.env.FIRESTORE_EMULATOR_HOST || process.env.CUE_JOURNEY_CLOUD_FIRESTORE !== "true") throw Error("Isolated verification dataset, Auth emulator and cloud Firestore are required");
const base = "http://127.0.0.1:3113";
const output = "../docs/review-screenshots/web/publication-journey";
await mkdir(output, { recursive: true });
const evidence = { passed: false, environment: { web: base, bigquery: "cuckoocue.cuckoo_cue_web_verification", vertex: "real", firestore: "real cuckoocue, dedicated test users", auth: "Auth emulator Google provider, real SDK", seed: "previous Android journey completed snapshot, re-registered through Run API" }, operations: [] };
const browser = await chromium.launch();
const contexts = [];
const recordings = [];
const cleanup = [];
const app = initializeApp({ projectId: "cuckoocue" }, "publication-journey");
const firestore = getFirestore(app);
const bq = new BigQuery({ projectId: "cuckoocue" });
async function user(label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  contexts.push(context);
  const account = { label, page: await context.newPage() };
  account.page.setDefaultTimeout(90_000);
  context.on("response", (response) => {
    if (response.url().includes("accounts:signInWithIdp")) recordings.push(response.json().then((body) => { account.uid = body.localId; account.token = body.idToken; }));
    if (!response.url().startsWith(`${base}/api/`)) return;
    recordings.push(response.json().then((body) => evidence.operations.push({ user: label, method: response.request().method(), path: response.url().slice(base.length), input: response.request().postDataJSON(), status: response.status(), body })).catch(() => {}));
  });
  await account.page.goto(base);
  await account.page.locator(".connection-panel summary").click();
  const popupPromise = context.waitForEvent("page");
  await account.page.getByRole("button", { name: "Googleでログイン", exact: true }).first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.getByText("Add new account", { exact: false }).click();
  await popup.locator("#email-input").fill(`publication-${label}-${Date.now()}@example.test`);
  await popup.getByRole("button", { name: /sign in/i }).click();
  await expect.poll(() => account.uid, { timeout: 60_000 }).toBeTruthy();
  await Promise.all(recordings);
  assert.ok(account.uid && account.token);
  return account;
}
async function api(account, path, method = "GET", input, status = 200, headers = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${account.token}`, "content-type": "application/json", ...headers }, ...(input ? { body: JSON.stringify(input) } : {}) });
  const body = await response.json();
  evidence.operations.push({ user: account.label, path, method, input, status: response.status, body });
  console.log(account.label, response.status, method, path);
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
function responseFor(page, method, path, status = 200) {
  return page.waitForResponse((response) => response.request().method() === method && new URL(response.url()).pathname === path && response.status() === status, { timeout: 120_000 });
}
async function save(page) {
  const response = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/api/cuebooks/") && r.status() === 200, { timeout: 120_000 });
  await page.getByRole("button", { name: "自分用に保存", exact: true }).click();
  const saved = (await (await response).json()).cuebook;
  await expect(page.getByText("保存済み・自分だけ", { exact: true })).toBeVisible();
  return saved;
}
async function findRevision(account, revisionId, absent = false) {
  let result = await api(account, "/api/search", "POST", { message: "猫2匹と東京から名古屋へ引っ越す", page_size: 20 });
  const results = [...result.results];
  while (result.nextCursor) {
    result = await api(account, "/api/search", "POST", { cursor: result.nextCursor, page_size: 20 });
    results.push(...result.results);
  }
  const match = results.find((r) => r.id === revisionId || r.source_cuebook_id === revisionId);
  if (absent) assert.equal(match, undefined); else assert.ok(match);
  return match;
}
try {
  const owner = await user("author");
  const other = await user("reader");
  evidence.users = { author: owner.uid, reader: other.uid };
  const previous = JSON.parse(await readFile("../docs/review-screenshots/web/run-journey/evidence.json", "utf8"));
  assert.equal(previous.passed, true);
  const source = structuredClone(previous.after);
  source.id = `publication-source-${randomUUID()}`;
  source.source_cuebook_id = null;
  source.tasks = source.tasks.map((task) => ({ ...task, id: randomUUID(), source_task_id: null }));
  source.tasks.push({ ...source.tasks[0], id: randomUUID(), title: "個人用の控えを処分する", sort_order: 2 });
  cleanup.push(`users/${owner.uid}/runs/${source.id}`);
  await api(owner, `/api/runs/${source.id}`, "PUT", source);
  evidence.source = source;
  await api(other, `/api/runs/${source.id}/snapshot`, "GET", undefined, 404);
  const page = owner.page;
  await page.goto(`${base}/?view=history`);
  await page.getByRole("button", { name: new RegExp(source.title) }).click();
  await page.getByRole("checkbox", { name: "個人用の控えを処分する", exact: true }).uncheck();
  await shot(page, "01-history-selection-desktop");
  await page.getByRole("button", { name: "再利用用に整える", exact: true }).click();
  await expect(page.getByLabel("最終日", { exact: true })).toHaveCount(0);
  await page.getByLabel("タイトル", { exact: true }).fill("猫2匹との国内引っ越し");
  await page.getByLabel("1件目のタスク", { exact: true }).fill("猫の移動用ケージと乗車条件を確認する");
  await page.getByLabel("1件目のタスク", { exact: true }).press("Enter");
  const privateOnly = await save(page);
  assert.equal(privateOnly.enrichment, null);
  evidence.privateOnly = privateOnly;
  await shot(page, "02-private-saved-desktop");
  await api(other, `/api/cuebooks/${privateOnly.id}`, "GET", undefined, 404);
  await findRevision(other, privateOnly.id, true);
  await page.getByRole("button", { name: "自分のリスト", exact: true }).click();
  await page.reload();
  await page.locator(".owner-list-rows").getByRole("button", { name: /猫2匹との国内引っ越し/ }).click();
  const enrichmentResponse = responseFor(page, "POST", "/api/task-list-enrichment");
  await page.getByRole("button", { name: "再利用情報を準備", exact: true }).click();
  evidence.generated = await (await enrichmentResponse).json();
  await expect(page.getByLabel("分野", { exact: true })).toBeVisible();
  await page.getByLabel("対象となる状況", { exact: true }).fill("猫2匹と東京から名古屋へ引っ越す。公共交通機関で移動し、新居の水とトイレを準備する。");
  const ready = await save(page);
  evidence.approved = ready;
  await shot(page, "03-approved-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "04-approved-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "グループに公開する", exact: true }).click();
  const panel = page.getByRole("region", { name: "公開先の確認" });
  await panel.getByLabel("グループ名", { exact: true }).fill("猫と公共交通で引っ越す");
  await panel.getByLabel("対象となる状況", { exact: true }).fill("連絡先: contact@example.test");
  await panel.getByRole("checkbox", { name: /個人情報/ }).check();
  const rejectedShelfResponse = responseFor(page, "POST", "/api/shelves", 422);
  await panel.getByRole("button", { name: "公開する", exact: true }).click();
  const rejectedShelf = await rejectedShelfResponse;
  await expect(panel.getByRole("alert")).toContainText("メールアドレス");
  await expect(panel.getByLabel("対象となる状況", { exact: true })).toBeEnabled();
  await api(owner, `/api/shelves/${rejectedShelf.request().postDataJSON().operation_id}`, "GET", undefined, 404);
  assert.deepEqual((await api(owner, `/api/cuebooks/${ready.id}`)).cuebook, ready);
  await shot(page, "05-rejected-group-desktop");
  await panel.getByLabel("対象となる状況", { exact: true }).fill("猫と暮らし、国内の引っ越しで電車を利用する人");
  await panel.getByRole("checkbox", { name: /個人情報/ }).check();
  await shot(page, "05-publication-confirmation-desktop");
  const publishResponse = responseFor(page, "POST", "/api/cuebook-revisions", 201);
  await panel.getByRole("button", { name: "公開する", exact: true }).click();
  const publishedResponse = await publishResponse;
  const published = await publishedResponse.json();
  evidence.publication = published;
  const publicationInput = publishedResponse.request().postDataJSON();
  await expect(page.getByText("公開しました。", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主な操作", exact: true }).getByRole("button", { name: published.shelf.title, exact: true })).toBeVisible();
  await shot(page, "06-published-desktop");
  await api(owner, "/api/cuebook-revisions", "POST", publicationInput, 201);
  await api(other, "/api/cuebook-revisions", "POST", publicationInput, 404);
  const reader = other.page;
  await reader.getByRole("textbox", { name: "Search query" }).fill("猫2匹と東京から名古屋へ引っ越す");
  const searchResponse = responseFor(reader, "POST", "/api/search");
  await reader.getByRole("button", { name: "検索", exact: true }).click();
  let search = await (await searchResponse).json();
  const results = [...search.results];
  while (!results.some((r) => r.id === published.revision.id) && search.nextCursor) {
    const next = responseFor(reader, "POST", "/api/search");
    await reader.getByRole("button", { name: /続きを/ }).click();
    search = await (await next).json(); results.push(...search.results);
  }
  const resultIndex = results.findIndex((r) => r.id === published.revision.id);
  assert.ok(resultIndex >= 0, "New public revision must be searchable by another user");
  assert.ok(results[resultIndex].shelves.some((s) => s.id === published.shelf.id));
  evidence.searchResult = results[resultIndex];
  await shot(reader, "07-reader-search-desktop");
  await reader.locator(".search-result-item").nth(resultIndex).getByRole("button", { name: published.shelf.title, exact: true }).click();
  await expect(reader.getByRole("heading", { name: published.shelf.title, exact: true })).toBeVisible();
  assert.deepEqual((await api(other, "/api/memberships")).shelf_ids, []);
  await shot(reader, "07-reader-group-desktop");
  await reader.locator(".shelf-navigation").getByRole("button", { name: "探す", exact: true }).click();
  await reader.locator(".search-result-item").nth(resultIndex).getByRole("button", { name: /Androidに取り込む/ }).click();
  await reader.getByLabel("最終日", { exact: true }).fill("2026-12-10");
  await shot(reader, "08-reader-schedule-desktop");
  const reuseResponse = responseFor(reader, "POST", "/api/reuse");
  await reader.getByRole("button", { name: "この日程で保存", exact: true }).click();
  const reused = await reuseResponse;
  const { runId } = await reused.json();
  cleanup.push(`users/${other.uid}/runs/${runId}`);
  await expect(reader.getByText("日程付きのリストを保存しました", { exact: true })).toBeVisible();
  const run = (await api(other, `/api/runs/${runId}/snapshot`)).run;
  const borrowed = (await api(other, `/api/cuebooks/${run.source_cuebook_id}`)).cuebook;
  evidence.readerRun = run; evidence.borrowed = borrowed;
  assert.equal(borrowed.origin_revision_id, published.revision.id);
  assert.notEqual(borrowed.id, ready.id);
  const content = (task) => [task.text, task.default_priority, task.relative_start_day, task.relative_end_day];
  assert.deepEqual(borrowed.tasks.map(content), ready.tasks.map(content));
  assert.ok(borrowed.tasks.every((task) => !ready.tasks.some((original) => original.id === task.id)));
  assert.equal(run.tasks.length, 2);
  assert.ok(run.tasks.every((task) => task.completed_at === null));
  assert.equal(run.tasks[0].due_at, Date.parse("2026-12-04T00:00:00+09:00"));
  assert.equal(run.tasks[1].due_at, null);
  assert.deepEqual(run.tasks.map((task) => task.source_task_id), borrowed.tasks.map((task) => task.id));
  await api(owner, `/api/runs/${runId}/snapshot`, "GET", undefined, 404);
  assert.deepEqual((await api(owner, `/api/runs/${source.id}/snapshot`)).run, source);
  await api(other, "/api/reuse", "POST", reused.request().postDataJSON());
  await shot(reader, "09-reader-saved-desktop");
  await page.getByLabel("タイトル", { exact: true }).fill("自分だけの次回の引っ越し");
  await save(page);
  const unchanged = (await api(other, `/api/shelves/${published.shelf.id}`)).shelf;
  assert.equal(unchanged.items.length, 1);
  assert.equal(unchanged.items[0].revision.title, ready.title);
  assert.deepEqual((await api(other, `/api/cuebooks/${borrowed.id}`)).cuebook, borrowed);
  assert.deepEqual((await api(other, `/api/runs/${runId}/snapshot`)).run, run);
  for (const table of ["cuebooks", "cuebook_revisions", "shelves"]) {
    const ownerColumn = table === "shelves" ? "created_by" : "owner_user_id";
    const [rows] = await bq.query({ query: `SELECT * FROM \`cuckoocue.cuckoo_cue_web_verification.${table}\` WHERE ${ownerColumn} IN (@author, @reader)`, params: { author: owner.uid, reader: other.uid }, location: "asia-northeast1" });
    evidence[table] = rows;
    assert.equal(rows.length, table === "cuebooks" ? 2 : 1);
  }
  evidence.passed = true;
  console.log("Publication journey passed", published.revision.id, runId);
} finally {
  if (!evidence.passed) for (let i = 0; i < contexts.length; i++) {
    for (const [j, page] of contexts[i].pages().entries()) await shot(page, `failed-${i}-${j}`).catch(() => {});
  }
  await Promise.all(recordings);
  for (const path of cleanup) {
    const document = await firestore.doc(path).get();
    (evidence.cloudRuns ??= []).push({ path, data: document.data() });
    await document.ref.delete();
  }
  evidence.cloudTestRunsRemoved = cleanup;
  await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
  await firestore.terminate(); await deleteApp(app);
}
