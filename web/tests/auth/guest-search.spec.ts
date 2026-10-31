import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { editorialCuebooks, editorialShelves } from "../../data/editorial-shelves.mjs";
import type { TaskDraft } from "../../src/components/tasks/task-values";

// Real Firebase browser SDK and persistence; Auth/API HTTP responses are fixtures.
// This does not verify Google OAuth, backend authentication or search relevance.
const draft = "猫2匹と来月引っ越す。車がない";
const guestKey = "cuckoo-cue:guest-search:v1";
const uid = "guest-draft-test-user";
function token() {
  const now = Math.floor(Date.now() / 1000);
  return [Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: uid, user_id: uid, aud: "guest-draft-test", iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "anonymous" } })).toString("base64url"), "test"].join(".");
}
async function fixtures(page: Page) {
  let signups = 0;
  await page.route("https://identitytoolkit.googleapis.com/**", route => {
    if (route.request().url().includes("accounts:signUp")) {
      signups++;
      return route.fulfill({ json: { localId: uid, idToken: token(), refreshToken: "test-refresh", expiresIn: "3600" } });
    }
    return route.fulfill({ json: { users: [{ localId: uid, createdAt: String(Date.now()), lastLoginAt: String(Date.now()), providerUserInfo: [] }] } });
  });
  await page.route("**/api/memberships", route => route.fulfill({ json: { shelf_ids: [] } }));
  await page.route("**/api/shelves", route => route.fulfill({ json: { shelves: [] } }));
  const group = editorialShelves[0];
  const cues = editorialCuebooks.filter(c => group.cuebook_keys.includes(c.key));
  const revisions = cues.map(c => ({ id: c.revision_id, title: c.title, context_text: c.context_text, domain: c.domain, task_groupings: c.task_groupings,
    published_at: "2026-09-21", withdrawn_at: null, tasks: c.tasks.map((t: TaskDraft, i: number) => ({ ...t, id: `${c.key}-${i}`, title: t.text })), shelves: [] }));
  await page.route("**/api/shelves/editorial-shelf-two-cats-home", route => route.fulfill({ json: { shelf: { ...group,
    curation: { is_default: true }, items: revisions.map((revision, position) => ({ revision, revision_id: revision.id, position })) } } }));
  await page.route("**/api/cuebook-revisions/*", route => route.fulfill({ json: { revision: revisions.find(r => route.request().url().endsWith(r.id)) } }));
  await page.route("**/api/search", route => route.fulfill({ json: { results: [revisions[0]], nextCursor: null } }));
  return { signups: () => signups };
}

test("guest draft and selected example survive reload without anonymous sign-up; clearing stays cleared", async ({ page }, info) => {
  const auth = await fixtures(page);
  await page.goto("/");
  await page.getByLabel("Search query").fill(draft);
  await page.getByRole("button", { name: /^猫2匹と暮らしている/ }).click();
  await page.locator(".context-candidates").getByRole("button", { name: /^猫2匹を残して一泊する準備/ }).click();
  await expect(page.locator(".context-applicability")).toContainText("健康な成猫二匹");
  await page.reload();
  await expect(page.getByLabel("Search query")).toHaveValue(draft);
  await expect(page.locator(".context-candidate-detail")).toContainText("猫2匹を残して一泊する準備");
  if (process.env.CUE_CAPTURE_DIR) await page.screenshot({ path: path.resolve(process.env.CUE_CAPTURE_DIR, `guest-reload-${info.project.name}.png`), fullPage: true });
  await page.getByRole("button", { name: "例を閉じる", exact: true }).click();
  await expect(page.getByLabel("Search query")).toHaveValue(draft);
  await page.getByLabel("Search query").fill("");
  await page.reload();
  await expect(page.locator(".account-trigger:visible")).toBeEnabled();
  await expect(page.getByLabel("Search query")).toHaveValue("");
  expect(auth.signups()).toBe(0);
});

test("restored guest input is searched after anonymous authentication and retained in that account", async ({ page }) => {
  const auth = await fixtures(page);
  await page.goto("/");
  await page.getByLabel("Search query").fill(draft);
  await page.reload();
  await expect(page.getByLabel("Search query")).toHaveValue(draft);
  const request = page.waitForRequest(r => r.url().endsWith("/api/search"));
  await page.locator(".search-composer").getByRole("button", { name: "検索", exact: true }).click();
  expect((await request).postDataJSON().message).toBe(draft);
  expect(auth.signups()).toBe(1); // Proves this is not the dev-auth path.
  await expect(page.locator(".search-result-item")).toHaveCount(1);
  expect(await page.evaluate(key => sessionStorage.getItem(key), guestKey)).toBeNull();
  await page.reload();
  await expect(page.getByLabel("Search query")).toHaveValue(draft);
  await expect(page.locator(".search-result-item")).toHaveCount(1);
});

test("registered account restoration and logout never resurrect an old guest draft", async ({ page }) => {
  await fixtures(page);
  // Seed a Firebase session on a page that does not mount the workspace.
  await page.goto("/privacy");
  await page.evaluate(async ({ idToken, uid, guestKey }) => {
    sessionStorage.setItem(guestKey, "以前のゲストの入力");
    sessionStorage.setItem(`cuckoo-cue:web-workspace:v1:${uid}`, JSON.stringify({ version: 1, searchMessage: "本人の保存済み条件" }));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("firebaseLocalStorageDb", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("firebaseLocalStorage", "readwrite");
        tx.objectStore("firebaseLocalStorage").put({ fbase_key: "firebase:authUser:guest-draft-test-key:[DEFAULT]", value: {
          uid, email: "test@example.invalid", emailVerified: false, isAnonymous: false, providerData: [],
          stsTokenManager: { accessToken: idToken, refreshToken: "test-refresh", expirationTime: Date.now() + 3600000 },
          apiKey: "guest-draft-test-key", appName: "[DEFAULT]",
        } });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, { idToken: token(), uid, guestKey });
  await page.goto("/");
  await expect(page.getByLabel("Search query")).toHaveValue("本人の保存済み条件");
  expect(await page.evaluate(key => sessionStorage.getItem(key), guestKey)).toBeNull();
  await page.getByLabel("Search query").fill("本人の新しい条件");
  // Account actions must also work from the keyboard.
  await page.locator(".account-trigger:visible").press("Enter");
  await page.getByRole("menuitem", { name: "ログアウト", exact: true }).press("Enter");
  await expect(page.getByLabel("Search query")).toHaveValue("");
  await page.reload();
  await expect(page.locator(".account-trigger:visible")).toBeEnabled();
  await expect(page.getByLabel("Search query")).toHaveValue("");
});
