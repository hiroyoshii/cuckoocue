import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.CUE_VERIFY_URL ?? "http://127.0.0.1:3150";
const expect = baseExpect.configure({ timeout: 15_000 });
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error("Local Auth emulator build required");
const output = resolve(process.env.CUE_CAPTURE_DIR ?? "../docs/review-screenshots/web/initial-display-account");
await mkdir(output, { recursive: true });
const evidence = { passed: false, environment: "Firebase SDK + Auth emulator; application API responses intercepted, no cloud writes", checks: [], screenshots: [], authResponses: [], pageErrors: [] };
const browser = await chromium.launch();
const contexts = [];
async function setup(options = {}) {
  const context = await browser.newContext({ locale: "ja-JP", viewport: { width: 1440, height: 1000 }, ...options });
  contexts.push(context);
  const requests = [], errors = [];
  const page = await context.newPage();
  page.on("pageerror", error => { errors.push(error.message); evidence.pageErrors.push(error.message); });
  page.on("response", response => { const url = new URL(response.url()); if (url.port === "9099") evidence.authResponses.push({ path: url.pathname, status: response.status() }); });
  await context.route(`${base}/api/**`, async route => {
    const request = route.request();
    requests.push({ path: new URL(request.url()).pathname, method: request.method(), authenticated: !!request.headers().authorization });
    const path = new URL(request.url()).pathname;
    const body = path === "/api/search" ? { results: [], searchDomain: "引っ越し", nextCursor: null }
      : path === "/api/memberships" ? { shelf_ids: [] } : path === "/api/shelves" ? { shelves: [] } : { runs: [] };
    await route.fulfill({ json: body });
  });
  return { context, page, requests, errors };
}
async function capture(page, name) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  evidence.screenshots.push(`${name}.png`);
}
try {
  const html = await (await fetch(base)).text();
  assert.ok(html.includes('aria-label="Search query"'), "Search input must exist in server HTML");
  assert.ok(!html.includes('class="auth-shell"'));
  evidence.checks.push({ searchInServerHtml: true });
  for (const mobile of [false, true]) {
    const { context, page, requests, errors } = await setup(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
    let signups = 0, releaseSignup;
    const signupGate = new Promise(resolve => { releaseSignup = resolve; });
    await context.route("**/accounts:signUp?*", async route => { signups++; await signupGate; await route.continue(); });
    const start = Date.now();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const query = page.getByRole("textbox", { name: "Search query" });
    await expect(query).toBeVisible();
    const visibleMs = Date.now() - start;
    await query.fill("引っ越しの手続き");
    await page.waitForTimeout(600);
    assert.equal(signups, 0, "Opening search must not create an anonymous user");
    assert.equal(requests.length, 0, "Opening guest search must not request application data");
    await expect(page.locator(".auth-shell, .spin")).toHaveCount(0);
    const trigger = page.getByRole("button", { name: "アカウント", exact: true }).filter({ visible: true });
    await trigger.click();
    await expect(query).toHaveValue("引っ越しの手続き");
    await expect(page.getByRole("menuitem", { name: "ログイン", exact: true })).toBeFocused();
    await capture(page, `${mobile ? "mobile" : "desktop"}-guest-menu`);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await page.getByRole("button", { name: "検索", exact: true }).click();
    await expect.poll(() => signups).toBe(1);
    assert.equal(requests.length, 0, "API must wait for authenticated identity");
    await query.fill("引っ越しの手続きと転校");
    releaseSignup();
    await expect.poll(() => requests.filter(r => r.path === "/api/search").length).toBe(1);
    await expect(query).toHaveValue("引っ越しの手続きと転校");
    await expect(query).toBeFocused();
    await page.waitForTimeout(300);
    assert.equal(requests.length, 1, "Anonymous search must not fetch private shelves or memberships");
    assert.equal(requests[0].authenticated, true);
    assert.deepEqual(errors, []);
    // The SDK's emulator-only warning is outside the application's landmarks.
    assert.deepEqual((await new AxeBuilder({ page }).exclude(".firebase-emulator-warning").analyze()).violations, []);
    evidence.checks.push({ viewport: mobile ? "mobile" : "desktop", visibleMs, initialSignups: 0, initialApiRequests: 0, delayedAuthSearchCount: 1, inputAndFocusPreserved: true, axeViolations: 0 });
    await context.close();
  }

  const { context, page, requests, errors } = await setup();
  await page.goto(`${base}/?view=history`);
  await expect(page.locator(".sign-in-required")).toBeVisible();
  await expect(page.getByRole("heading", { name: "完了履歴", exact: true })).toBeVisible();
  assert.equal(requests.length, 0);
  await page.getByRole("button", { name: "アカウント", exact: true }).filter({ visible: true }).click();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("menuitem", { name: "ログイン", exact: true }).click();
  const popup = await popupPromise;
  await popup.getByText("Add new account", { exact: false }).click();
  await popup.locator("#email-input").fill(`account-check-${Date.now()}@example.test`);
  await popup.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /^ログイン中:/ }).filter({ visible: true })).toBeVisible();
  await expect(page.locator(".sign-in-required")).toHaveCount(0);
  await expect(page).toHaveURL(/view=history/);
  await expect.poll(() => requests.some(r => r.path === "/api/runs")).toBe(true);
  const loggedInTrigger = page.getByRole("button", { name: /^ログイン中:/ }).filter({ visible: true });
  if (!(await page.getByRole("menu").isVisible())) await loggedInTrigger.click();
  await expect(page.getByRole("menuitem", { name: "ログアウト", exact: true })).toBeEnabled();
  await capture(page, "desktop-signed-in-menu");
  await page.keyboard.press("Escape");
  const storageState = await context.storageState({ indexedDB: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^ログイン中:/ }).filter({ visible: true }).click();
  await capture(page, "mobile-signed-in-menu");
  await page.getByRole("menuitem", { name: "ログアウト", exact: true }).click();
  await expect(page.locator(".sign-in-required")).toBeVisible();
  await expect(page).toHaveURL(/view=history/);
  assert.deepEqual(errors, []);
  evidence.checks.push({ googleProvider: "Auth emulator popup", historyReturn: true, logoutPrivateDataHidden: true });
  await context.close();

  const restored = await setup({ storageState });
  let releaseLookup, lookups = 0;
  const lookupGate = new Promise(resolve => { releaseLookup = resolve; });
  await restored.context.route("**/accounts:lookup?*", async route => { lookups++; await lookupGate; await route.continue(); });
  await restored.page.goto(base, { waitUntil: "domcontentloaded" });
  const query = restored.page.getByRole("textbox", { name: "Search query" });
  await expect(query).toBeVisible();
  await expect.poll(() => lookups).toBeGreaterThan(0);
  await query.fill("認証待ちでも入力できる");
  await expect(query).toBeFocused();
  assert.equal(restored.requests.length, 0);
  await expect(restored.page.locator(".auth-shell, .spin")).toHaveCount(0);
  releaseLookup();
  await expect(restored.page.getByRole("button", { name: /^ログイン中:/ }).filter({ visible: true })).toBeVisible();
  await expect(query).toHaveValue("認証待ちでも入力できる");
  await expect(query).toBeFocused();
  assert.deepEqual(restored.errors, []);
  evidence.checks.push({ delayedRegisteredRestore: true, queryInputAndFocusPreserved: true, privateRequestsBeforeAuth: 0 });
  await restored.context.close();

  const failed = await setup();
  let signupAttempts = 0;
  await failed.context.route("**/accounts:signUp?*", async route => {
    signupAttempts++;
    if (signupAttempts === 1) await route.fulfill({ status: 400, json: { error: { message: "OPERATION_NOT_ALLOWED" } } });
    else await route.continue();
  });
  await failed.page.goto(base);
  await expect(failed.page.getByRole("button", { name: "アカウント", exact: true }).filter({ visible: true })).toBeEnabled();
  await failed.page.getByLabel("Search query").fill("接続失敗でも入力を残す");
  await failed.page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(failed.page.locator(".error-banner")).toContainText("接続できませんでした");
  assert.equal(failed.requests.length, 0);
  await failed.page.getByRole("button", { name: "再検索", exact: true }).click();
  await expect.poll(() => failed.requests.filter(r => r.path === "/api/search").length).toBe(1);
  await expect(failed.page.getByLabel("Search query")).toHaveValue("接続失敗でも入力を残す");
  await expect(failed.page.locator(".error-banner")).toHaveCount(0);
  evidence.checks.push({ connectionFailurePreservesInput: true, explicitRetry: true, noUnauthenticatedApiFallback: true });
  await failed.context.close();
  const privateLinks = await setup();
  for (const query of ["view=history", "cuebook_id=private-original", "completed_run_id=private-completed", "run_id=android-completed"]) {
    await privateLinks.page.goto(`${base}/?${query}`);
    await expect(privateLinks.page.locator(".sign-in-required")).toBeVisible();
    assert.equal(privateLinks.requests.length, 0);
  }
  evidence.checks.push({ guestPrivateLinksShowLogin: 4, privateApiRequests: 0 });
  evidence.passed = true;
} catch (error) {
  evidence.error = error.stack;
  for (let i = 0; i < contexts.length; i++) for (const page of contexts[i].pages()) if (!page.isClosed()) await capture(page, `failure-${i}`).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${output}/auth-ui-evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
