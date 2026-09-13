import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const base = "https://cuckoocue.hiyozoo.com";
const output = process.env.CUE_CAPTURE_DIR || "../docs/review-screenshots/web/residual-fixes";
const started = Date.now();
const evidence = { base, started: new Date(started).toISOString(), authentication: "real anonymous Firebase; no Google consent/login tested", checks: [], pageErrors: [], passed: false };
const anonymousIds = new Set();
const browser = await chromium.launch();
await mkdir(output, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ja-JP", reducedMotion: "reduce" });
  const page = await context.newPage();
  const initialApiRequests = [];
  let searchStarted = false;
  page.on("request", request => { if (!searchStarted && new URL(request.url()).pathname.startsWith("/api/")) initialApiRequests.push(request.url()); });
  page.on("pageerror", error => evidence.pageErrors.push(error.message));
  page.on("response", async response => {
    if (response.url().includes("identitytoolkit.googleapis.com/v1/accounts:signUp") && response.ok()) {
      const body = await response.json();
      if (body.localId) anonymousIds.add(body.localId);
    }
  });
  const root = await page.goto(base, { timeout: 120000 });
  assert.equal(root.status(), 200);
  await expect(page.getByLabel("Search query")).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("button", { name: "アカウント", exact: true }).filter({ visible: true })).toBeEnabled({ timeout: 60000 });
  assert.equal(anonymousIds.size, 0, "Opening the guest search page must not create an anonymous user");
  assert.equal(initialApiRequests.length, 0);
  await expect(page.locator(".auth-shell, .spin")).toHaveCount(0);
  evidence.checks.push({ name: "initial guest search needs no anonymous signup or application API", anonymousSignups: 0, apiRequests: 0 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${output}/production-home-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "アカウント", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("menuitem", { name: "ログイン", exact: true })).toBeFocused();
  await page.screenshot({ path: `${output}/production-account-desktop.png`, fullPage: true });
  await page.keyboard.press("Escape");
  searchStarted = true;
  const searched = page.waitForResponse(response => new URL(response.url()).pathname === "/api/search", { timeout: 120000 });
  await page.getByLabel("Search query").fill("引っ越し");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  const response = await searched;
  const body = await response.json();
  evidence.checks.push({ name: "anonymous search", status: response.status(), body });
  assert.equal(response.status(), 200);
  await expect(page.getByRole("button", { name: "検索", exact: true })).toBeEnabled({ timeout: 30000 });
  await page.screenshot({ path: `${output}/production-search-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/production-search-mobile.png`, fullPage: true });
  await page.getByRole("button", { name: "アカウント", exact: true }).filter({ visible: true }).click();
  await page.screenshot({ path: `${output}/production-account-mobile.png`, fullPage: true });
  await page.keyboard.press("Escape");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const items = page.locator(".search-result-item");
  if (await items.count()) {
    await items.first().getByRole("button", { name: /^全\d+件を見る$/ }).click();
    await page.getByRole("link", { name: "この公開版を開く", exact: true }).click();
    await expect(page.locator(".workspace-heading h1")).toBeVisible({ timeout: 60000 });
    evidence.checks.push({ name: "public revision permalink", url: page.url() });
    await page.screenshot({ path: `${output}/production-revision-mobile.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "完了履歴", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\?view=history$/);
  await expect(page.locator(".sign-in-required")).toBeVisible();
  await page.reload();
  await expect(page.locator(".sign-in-required")).toBeVisible({ timeout: 60000 });
  await expect(page).toHaveURL(/\?view=history$/);
  evidence.checks.push({ name: "anonymous history location survives reload before Google login", url: page.url() });
  await page.screenshot({ path: `${output}/production-history-login-mobile.png`, fullPage: true });
  for (const path of ["/api/cuebooks", "/api/runs", "/api/cuebooks/acceptance-missing/revisions"]) {
    const response = await context.request.get(`${base}${path}`);
    evidence.checks.push({ name: "unauthenticated private read", path, status: response.status() });
    assert.equal(response.status(), 401);
  }
  for (const path of ["/api/cuebooks", "/api/runs"]) {
    const response = await context.request.get(`${base}${path}`, { headers: { "x-dev-user-id": "local-user" } });
    evidence.checks.push({ name: "development identity cannot bypass production auth", path, status: response.status() });
    assert.equal(response.status(), 401);
  }
  const generation = await context.request.post(`${base}/api/shelf-description`, { headers: { "x-dev-user-id": "local-user" }, data: { title: "", context: "", lists: [] } });
  evidence.checks.push({ name: "Shelf generation requires registered authentication", status: generation.status() });
  assert.equal(generation.status(), 401);
  assert.equal(evidence.pageErrors.length, 0);
  evidence.passed = true;
  await context.close();
} catch (error) {
  evidence.error = error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  const auth = getAuth(initializeApp({ credential: applicationDefault(), projectId: "cuckoocue" }));
  evidence.cleanedAnonymousAccounts = 0;
  for (const id of anonymousIds) {
    const user = await auth.getUser(id);
    assert.equal(user.providerData.length, 0);
    assert.ok(Date.parse(user.metadata.creationTime) >= started - 1000);
    await auth.deleteUser(id);
    evidence.cleanedAnonymousAccounts += 1;
  }
  await writeFile(`${output}/production-evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
