import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { BigQuery } from "@google-cloud/bigquery";
import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const base = "http://127.0.0.1:3113";
const adb = "/home/hiroyoshii/Android/Sdk/platform-tools/adb";
const output = "../docs/review-screenshots/web/run-journey";
const cloudFirestore = process.env.CUE_JOURNEY_CLOUD_FIRESTORE === "true";
if (process.env.CUE_BIGQUERY_DATASET !== "cuckoo_cue_web_verification" || (cloudFirestore ? Boolean(process.env.FIRESTORE_EMULATOR_HOST) : process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8086") || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Verification environment required");
await mkdir(output, { recursive: true });
const evidence = { passed: false, environment: { web: base, bigquery: "cuckoocue.cuckoo_cue_web_verification (real)", vertex: "real", firestore: cloudFirestore ? "cuckoocue (real), isolated verification user" : "emulator :8086", auth: "Firebase SDK / Auth emulator :9099, Google provider simulation", android: "installed debug APK, Room, WorkManager and UIAutomator" }, operations: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
const page = await context.newPage();
page.setDefaultTimeout(90_000);
let googleToken;
let user;
let idToken;
const recordings = [];
let originalTimeZone;
let androidBrowser;
context.on("request", (request) => {
  if (request.url().includes("accounts:signInWithIdp")) {
    const body = request.postDataJSON();
    googleToken = new URLSearchParams(body.postBody).get("id_token") ?? (body.requestUri ? new URL(body.requestUri).searchParams.get("id_token") : null);
  }
});
context.on("response", (response) => {
  const request = response.request();
  if (response.url().includes("accounts:signInWithIdp")) recordings.push(response.json().then((body) => { user = body.localId; idToken = body.idToken; }));
  if (!response.url().startsWith(`${base}/api/`)) return;
  recordings.push(response.json().then((body) => {
    evidence.operations.push({ path: response.url().slice(base.length), method: request.method(), input: request.postData() ? JSON.parse(request.postData()) : undefined, status: response.status(), body });
  }).catch(() => {}));
});
async function command(args) {
  return new Promise((resolve, reject) => {
    const shellArgs = args[0] === "shell" ? ["shell", args.slice(1).map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" ")] : args;
    const child = spawn(adb, shellArgs);
    let text = "";
    child.stdout.on("data", (data) => { text += data; });
    child.stderr.on("data", (data) => { text += data; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(text) : reject(new Error(text)));
  });
}
async function api(path, expected = 200, token = idToken) {
  const response = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json();
  evidence.operations.push({ path, method: "GET", status: response.status, body });
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
try {
  await page.goto(base);
  await page.getByRole("textbox", { name: "Search query" }).fill("猫2匹と東京から名古屋へ引っ越す");
  const searchResponse = page.waitForResponse((r) => r.url().endsWith("/api/search") && r.request().method() === "POST");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  const search = await (await searchResponse).json();
  assert.ok(search.results?.length, JSON.stringify(search));
  const selected = search.results.find((result) => result.tasks.length === 2 && result.tasks.some((task) => task.default_priority === 0));
  assert.ok(selected, "Existing two-task public moving fixture must be searchable");
  evidence.selected = selected;
  await page.screenshot({ path: `${output}/01-search-desktop.png`, fullPage: true });
  await page.locator(".search-result-item").nth(search.results.indexOf(selected)).getByRole("button", { name: `${selected.title}をAndroidに取り込む`, exact: true }).click();
  await page.getByLabel("最終日", { exact: true }).fill("2026-11-02");
  await page.getByLabel("1件目の期限", { exact: true }).fill("2026-10-27");
  await page.getByRole("button", { name: "この日程で保存", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Googleでログイン" })).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("dialog").getByRole("button", { name: "Googleでログイン" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  console.log("AUTH POPUP", await popup.locator("body").innerText());
  await popup.screenshot({ path: `${output}/auth-emulator.png` });
  // Firebase's emulator implements the provider chooser without external Google credentials.
  await popup.getByText("Add new account", { exact: false }).click();
  const email = `journey-${Date.now()}@example.test`;
  await popup.locator('#email-input').fill(email);
  await popup.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("dialog").getByLabel("1件目の期限", { exact: true })).toHaveValue("2026-10-27");
  await page.reload();
  await expect(page.getByRole("dialog").getByLabel("最終日", { exact: true })).toHaveValue("2026-11-02");
  await page.screenshot({ path: `${output}/02-schedule-desktop.png`, fullPage: true });
  const saveResponse = page.waitForResponse((r) => r.url().endsWith("/api/reuse") && r.status() === 200);
  await page.getByRole("button", { name: "この日程で保存", exact: true }).click();
  const { runId } = await (await saveResponse).json();
  await Promise.all(recordings);
  assert.ok(user && idToken && googleToken);
  evidence.owner = user; evidence.runId = runId;
  const before = (await api(`/api/runs/${runId}/snapshot`)).run;
  await api(`/api/runs/${runId}/snapshot`, 401, "invalid-token");
  evidence.before = before;
  assert.equal(before.tasks[0].due_at, Date.parse("2026-10-27T00:00:00+09:00"));
  assert.deepEqual((await api("/api/runs")).runs, []);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.goto(`${base}/import?run_id=${runId}`);
  await expect(page.getByRole("heading", { name: before.title, exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/03-saved-desktop.png`, fullPage: true });
  evidence.appLinks = await command(["shell", "pm", "get-app-links", "app.cuckoocue"]);
  assert.match(evidence.appLinks, /cuckoocue\.hiyozoo\.com: verified/);
  console.log("Running Android UI journey", runId);
  originalTimeZone = (await command(["shell", "getprop", "persist.sys.timezone"])).trim();
  await command(["shell", "cmd", "alarm", "set-timezone", "Asia/Tokyo"]);
  const result = await command(["shell", "am", "instrument", "--user", "0", "-w", "-r", "-e", "class", "app.cuckoocue.data.RunJourneyInstrumentedTest", "-e", "journeyRunId", runId, "-e", "journeyOwner", user, "-e", "journeyGoogleToken", googleToken, "app.cuckoocue.test/androidx.test.runner.AndroidJUnitRunner"]);
  await writeFile(`${output}/android-instrumentation.txt`, result);
  await command(["pull", "/sdcard/Android/data/app.cuckoocue/files/run-journey/.", output]);
  assert.match(result, /OK \(1 test\)/, result);
  const received = JSON.parse(await readFile(`${output}/received.json`, "utf8"));
  assert.deepEqual(received, before);
  const after = (await api(`/api/runs/${runId}/snapshot`)).run;
  assert.equal(after.id, before.id);
  assert.ok(after.tasks.every((task) => task.completed_at !== null));
  assert.deepEqual(after.tasks.map((task) => [task.id, task.source_task_id, task.due_at, task.available_from_at, task.user_priority]), before.tasks.map((task) => [task.id, task.source_task_id, task.due_at, task.available_from_at, task.user_priority]));
  assert.equal((await api("/api/runs")).runs[0].id, runId);
  evidence.after = after;
  await command(["forward", "tcp:9222", "localabstract:chrome_devtools_remote"]);
  androidBrowser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const androidPage = androidBrowser.contexts()[0].pages().find((candidate) => candidate.url() === `${base}/?run_id=${runId}`);
  assert.ok(androidPage, "Android completion button must open the same Run in Chrome");
  androidPage.setDefaultTimeout(60_000);
  const logout = androidPage.getByRole("button", { name: "ログアウト", exact: true }).last();
  if (await logout.isVisible()) await logout.click();
  await androidPage.getByRole("button", { name: "Googleでログイン", exact: true }).last().click();
  await androidPage.waitForURL(/9099\/emulator\/auth\/handler/);
  const nativeHistoryResponse = androidPage.waitForResponse((response) => response.url() === `${base}/api/runs/${runId}` && response.status() === 200);
  await androidPage.getByText(email, { exact: true }).click();
  const nativeHistory = await (await nativeHistoryResponse).json();
  assert.equal(nativeHistory.run.run_id, runId);
  await expect(androidPage.getByRole("heading", { name: before.title, exact: true })).toBeVisible();
  await androidPage.screenshot({ path: `${output}/06-android-chrome-history.png`, fullPage: true });
  evidence.androidBrowser = { incomingUrl: `${base}/?run_id=${runId}`, consumedUrl: androidPage.url(), sameOwnerGoogleRedirect: true, historyVisible: true, result: nativeHistory };
  await page.goto(`${base}/?view=history`);
  await page.getByRole("button", { name: new RegExp(before.title) }).click();
  await expect(page.getByRole("heading", { name: before.title, exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/04-completed-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/05-completed-mobile.png`, fullPage: true });
  const bq = new BigQuery({ projectId: "cuckoocue" });
  const [rows] = await bq.query({ query: "SELECT id, owner_user_id, origin_revision_id, title, tasks FROM `cuckoocue.cuckoo_cue_web_verification.cuebooks` WHERE id=@id AND owner_user_id=@owner", params: { id: before.source_cuebook_id, owner: user }, location: "asia-northeast1" });
  evidence.original = rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].origin_revision_id, selected.id);
  assert.deepEqual(rows[0].tasks.map((task) => task.relative_end_day), selected.tasks.map((task) => task.relative_end_day));
  if (cloudFirestore) {
    const firestore = getFirestore(initializeApp({ projectId: "cuckoocue" }));
    const document = await firestore.doc(`users/${user}/runs/${runId}`).get();
    assert.equal(document.data().id, runId);
    assert.ok(document.data().tasks.every((task) => task.completed_at !== null));
    evidence.cloudRun = document.data();
    // Only this execution's verified owner/Run, never a broad production collection reset.
    await document.ref.delete();
    evidence.cloudTestRunRemoved = true;
  }
  evidence.passed = true;
} finally {
  if (originalTimeZone) await command(["shell", "cmd", "alarm", "set-timezone", originalTimeZone]);
  if (cloudFirestore && user && evidence.runId && !evidence.cloudTestRunRemoved) {
    const firestore = getFirestore(initializeApp({ projectId: "cuckoocue" }, "journey-failed-cleanup"));
    const document = await firestore.doc(`users/${user}/runs/${evidence.runId}`).get();
    evidence.cloudRun = document.data();
    await document.ref.delete();
    evidence.cloudTestRunRemoved = true;
  }
  await Promise.all(recordings);
  await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
  await androidBrowser?.close();
  await Promise.all(getApps().map(async (app) => { await getFirestore(app).terminate(); await deleteApp(app); }));
}
