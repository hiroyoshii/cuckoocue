import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect as playwrightExpect } from "@playwright/test";
import { BigQuery } from "@google-cloud/bigquery";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (process.env.CUE_BIGQUERY_DATASET !== "cuckoo_cue_web_verification" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" || process.env.FIRESTORE_EMULATOR_HOST || process.env.CUE_JOURNEY_CLOUD_FIRESTORE !== "true") throw Error("Verification dataset, Auth emulator and cloud Firestore are required");
const base = "http://127.0.0.1:3113";
const expect = playwrightExpect.configure({ timeout: 90_000 });
const output = "../docs/review-screenshots/web/shelf-journey";
await mkdir(output, { recursive: true });
const evidence = { passed: false, environment: { bigquery: "cuckoocue.cuckoo_cue_web_verification", firestore: "real", vertexSearch: "real", auth: "Auth emulator, Google provider SDK", seed: "Three approved public revisions created by real APIs, not LLM enrichment evaluation" }, operations: [] };
const bq = new BigQuery({ projectId: "cuckoocue" });
const app = initializeApp({ projectId: "cuckoocue" }, "shelf-journey");
const firestore = getFirestore(app);
const browser = await chromium.launch();
const accounts = [], recordings = [];
async function user(label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const account = { label, context, page: await context.newPage() }; accounts.push(account);
  account.page.setDefaultTimeout(90_000);
  context.on("response", (response) => {
    if (response.url().includes("accounts:signInWithIdp")) recordings.push(response.json().then((body) => { account.uid = body.localId; account.token = body.idToken; }));
    if (response.url().startsWith(`${base}/api/`)) recordings.push(response.json().then((body) => evidence.operations.push({ user: label, method: response.request().method(), path: response.url().slice(base.length), input: response.request().postDataJSON(), status: response.status(), body })).catch(() => {}));
  });
  await account.page.goto(base);
  await account.page.locator(".connection-panel summary").click();
  const waiting = context.waitForEvent("page");
  await account.page.getByRole("button", { name: "Googleでログイン", exact: true }).first().click();
  const popup = await waiting; await popup.waitForLoadState();
  await popup.getByText("Add new account", { exact: false }).click();
  await popup.locator("#email-input").fill(`shelf-${label}-${Date.now()}@example.test`);
  await popup.getByRole("button", { name: /sign in/i }).click();
  await expect.poll(() => account.uid, { timeout: 60_000 }).toBeTruthy();
  return account;
}
async function api(account, path, method = "GET", input, expected = 200) {
  const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${account.token}`, "content-type": "application/json" }, ...(input ? { body: JSON.stringify(input) } : {}) });
  const body = await response.json();
  evidence.operations.push({ user: account.label, method, path, input, status: response.status, body });
  console.log(account.label, response.status, method, path);
  assert.equal(response.status, expected, JSON.stringify(body)); return body;
}
async function shot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
const responseFor = (page, path, method, status = 200) => page.waitForResponse((r) => new URL(r.url()).pathname === path && r.request().method() === method && r.status() === status, { timeout: 120_000 });
try {
  const author = await user("author"), reader = await user("reader");
  evidence.users = { author: author.uid, reader: reader.uid };
  let source = (await api(author, "/api/shelves", "POST", { operation_id: randomUUID(), title: "猫と暮らす人の転居準備", context: "猫と暮らし、国内で転居する人" }, 201)).shelf;
  const revisions = [], originals = [];
  for (const [index, title] of ["猫の移動準備", "新居の受け入れ準備", "引っ越し後の住所手続き"].entries()) {
    const input = { operation_id: randomUUID(), expected_updated_at: null, content: { title,
      tasks: [{ id: randomUUID(), text: ["猫の移動用ケージと乗車条件を確認する", "新居で水とトイレを用意する", "転居後に住所変更の手続きを行う"][index], default_priority: index === 2 ? null : 0, relative_start_day: -7, relative_end_day: index === 2 ? 7 : 0 }],
      enrichment: { domain: "引っ越し", context_text: "猫と暮らす人が国内で転居する際の準備と手続き", task_groupings: [{ label: "準備", task_offsets: [0] }] } } };
    const cuebook = (await api(author, `/api/cuebooks/${randomUUID()}`, "PUT", input)).cuebook; originals.push(cuebook);
    const result = await api(author, "/api/cuebook-revisions", "POST", { revision_id: randomUUID(), source_cuebook_id: cuebook.id, expected_source_updated_at: cuebook.updated_at, shelf_id: source.id, title, tasks: cuebook.tasks.map((task) => ({ title: task.text, default_priority: task.default_priority, relative_start_day: task.relative_start_day, relative_end_day: task.relative_end_day })) }, 201);
    revisions.push(result.revision); source = result.shelf;
  }
  source = (await api(author, `/api/shelves/${source.id}`, "PATCH", { operation_id: randomUUID(), expected_updated_at: source.updated_at, items: source.items.slice(0, 2).map(({ revision_id, position }) => ({ revision_id, position })) })).shelf;
  evidence.sourceBefore = source; evidence.revisionsBefore = revisions;
  const page = reader.page;
  await page.getByLabel("Search query").fill("猫と暮らす人の転居準備");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  const link = page.locator(`.search-result-item [data-shelf-id="${source.id}"]`).first();
  await expect(link).toBeVisible(); await link.click();
  await expect(page.getByRole("heading", { name: source.title, exact: true })).toBeVisible();
  assert.deepEqual((await api(reader, "/api/memberships")).shelf_ids, []);
  await shot(page, "01-related-group");
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await expect(page.getByRole("button", { name: "参加を解除", exact: true })).toBeVisible();
  assert.deepEqual((await api(reader, "/api/memberships")).shelf_ids, [source.id]);
  await page.reload();
  await expect(page.getByRole("button", { name: "参加を解除", exact: true })).toBeVisible();
  await shot(page, "02-joined");
  await page.getByRole("button", { name: "全件コピー", exact: true }).click();
  await page.getByLabel("コピー先のグループ名").fill("猫2匹と電車で転居する準備");
  await page.getByLabel("コピー先の状況").fill("猫2匹と公共交通で国内転居する人");
  await shot(page, "03-copy-confirmation");
  const copiedResponse = responseFor(page, `/api/shelves/${source.id}/fork`, "POST", 201);
  await page.getByRole("button", { name: "公開グループとしてコピー" }).click();
  const forkResponse = await copiedResponse;
  let copied = (await forkResponse.json()).shelf;
  const copyInput = forkResponse.request().postDataJSON();
  evidence.copyInput = copyInput; evidence.copied = copied;
  assert.equal(copied.is_owned, true); assert.equal(copied.forked_from_shelf_id, source.id);
  assert.deepEqual(copied.items, source.items); assert.notEqual(copied.id, source.id);
  assert.deepEqual((await api(author, `/api/shelves/${source.id}`)).shelf, source);
  await expect(page.getByLabel("グループ名", { exact: true })).toHaveValue(copied.title);
  await page.getByRole("button", { name: "新居の受け入れ準備を上へ" }).click();
  await page.getByRole("button", { name: "猫の移動準備を外す" }).click();
  await page.getByRole("button", { name: "配置の変更を取り消す" }).click();
  await expect(page.locator(".shelf-revision")).toHaveCount(2);
  await page.getByRole("button", { name: "猫の移動準備を外す" }).click();
  await page.getByRole("button", { name: "公開リストを追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("追加するリストの検索条件").fill("引っ越し後の住所手続き");
  await dialog.getByRole("button", { name: "検索", exact: true }).click();
  await dialog.locator(`[data-revision-id="${revisions[2].id}"]`).getByRole("button", { name: "内容と公開版を確認" }).click();
  await expect(dialog.getByRole("region", { name: "追加する公開版の確認" })).toContainText(revisions[2].title);
  await shot(page, "04-add-public-revision");
  await dialog.getByRole("button", { name: "配置に追加" }).click();
  await page.getByLabel("グループ名", { exact: true }).fill("猫2匹の転居と新生活");
  await page.getByLabel("グループの状況").fill("猫2匹と暮らし、新居の準備と転居後の手続きをまとめる");
  assert.deepEqual((await api(reader, `/api/shelves/${copied.id}`)).shelf, copied);
  await page.reload();
  await expect(page.getByLabel("グループ名", { exact: true })).toHaveValue("猫2匹の転居と新生活");
  await expect(page.locator(".shelf-revision h2")).toHaveText([revisions[1].title, revisions[2].title]);
  await shot(page, "05-unsaved-restored");
  const saveResponse = responseFor(page, `/api/shelves/${copied.id}`, "PATCH");
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  const savedResponse = await saveResponse; copied = (await savedResponse.json()).shelf;
  evidence.saved = copied;
  await expect(page.getByText("変更を保存しました。", { exact: true })).toBeVisible();
  assert.deepEqual(copied.items.map((item) => item.revision_id), [revisions[1].id, revisions[2].id]);
  await api(reader, `/api/shelves/${copied.id}`, "PATCH", savedResponse.request().postDataJSON());
  await page.getByRole("navigation", { name: "主な操作", exact: true }).getByRole("button", { name: "探す", exact: true }).click();
  await page.getByRole("navigation", { name: "主な操作", exact: true }).getByRole("button", { name: copied.title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`shelf_id=${copied.id}`));
  await expect(page.getByLabel("グループ名", { exact: true })).toHaveValue(copied.title);
  await page.reload();
  await expect(page.getByLabel("グループ名", { exact: true })).toHaveValue(copied.title);
  await expect(page.locator(".shelf-revision h2")).toHaveText([revisions[1].title, revisions[2].title]);
  await shot(page, "06-revisited-desktop");
  await page.setViewportSize({ width: 390, height: 1000 }); await shot(page, "07-revisited-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await api(author, `/api/shelves/${copied.id}`, "PATCH", { operation_id: randomUUID(), expected_updated_at: copied.updated_at, title: "権限外の変更" }, 404);
  await api(reader, `/api/cuebook-revisions/${originals[0].id}`, "GET", undefined, 404);
  await api(author, `/api/shelves/${source.id}`, "PATCH", { operation_id: randomUUID(), expected_updated_at: source.updated_at, context: "元のグループだけを変更する", items: [] });
  assert.deepEqual((await api(reader, `/api/shelves/${copied.id}`)).shelf, copied);
  assert.equal((await api(reader, `/api/shelves/${source.id}/fork`, "POST", copyInput, 201)).shelf.id, copied.id);
  assert.deepEqual((await api(reader, "/api/memberships")).shelf_ids.sort(), [source.id, copied.id].sort());
  for (const revision of revisions) assert.deepEqual((await api(reader, `/api/cuebook-revisions/${revision.id}`)).revision, revision);
  for (const table of ["cuebooks", "cuebook_revisions", "shelves"]) {
    const field = table === "shelves" ? "created_by" : "owner_user_id";
    const [rows] = await bq.query({ query: `SELECT * FROM \`cuckoocue.cuckoo_cue_web_verification.${table}\` WHERE ${field} IN (@author, @reader)`, params: { author: author.uid, reader: reader.uid }, location: "asia-northeast1" });
    evidence[table] = rows; assert.equal(rows.length, table === "shelves" ? 2 : 3);
    if (table !== "shelves") assert.ok(rows.every((row) => row.owner_user_id === author.uid));
  }
  const memberships = await firestore.doc(`users/${reader.uid}`).get(); evidence.membership = memberships.data();
  assert.deepEqual(evidence.membership.shelf_ids.sort(), [source.id, copied.id].sort());
  assert.equal((await firestore.collection(`users/${reader.uid}/runs`).get()).size, 0);
  evidence.passed = true; console.log("Shelf journey passed", source.id, copied.id);
} finally {
  if (!evidence.passed) for (const account of accounts) await shot(account.page, `failed-${account.label}`).catch(() => {});
  await Promise.all(recordings);
  await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  await browser.close(); await firestore.terminate(); await deleteApp(app);
}
