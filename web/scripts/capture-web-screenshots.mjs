import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const chromePath =
  process.env.CHROME_PATH || "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe";
const baseUrl = process.env.CUE_SCREENSHOT_BASE_URL || "http://localhost:3000";
const loginBaseUrl = process.env.CUE_SCREENSHOT_LOGIN_URL || "https://cuckoocue--cuckoocue.asia-east1.hosted.app";
const outDir = process.env.CUE_SCREENSHOT_OUT_DIR || "../docs/review-screenshots/web/e2e";
const port = Number(process.env.CUE_SCREENSHOT_CDP_PORT || 9222);
const screenshotRunId = "screenshot-completed-run";

await seedCompletedRun();

await mkdir(outDir, { recursive: true });

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=0.0.0.0",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=/tmp/cuckoocue-web-screenshot-chrome",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let cdp;
try {
  const wsUrl = await waitForPageWebSocketUrl();
  cdp = await connect(wsUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  await capture(cdp, "00-google-login-production.png", { width: 1440, height: 900 }, async () => {
    await cdp.send("Page.navigate", { url: loginBaseUrl });
    await waitForText(cdp, "Googleでログイン", 15000);
  });

  await capture(cdp, "01-empty-desktop.png", { width: 1440, height: 1050 }, async () => {
    await cdp.send("Page.navigate", { url: baseUrl });
    await waitForReady(cdp);
    await cdp.eval(`
      const el = document.querySelector('textarea[aria-label="Search query"]');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
        setter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `);
  });

  await capture(
    cdp,
    "02-search-results-desktop.png",
    { width: 1440, height: 1150 },
    async () => {
      await cdp.send("Page.navigate", { url: baseUrl });
      await waitForReady(cdp);
      await submitSearch(cdp, "東京から名古屋へ引っ越す。役所、ライフライン、郵便転送、住所変更を整理したい。");
      await waitForText(cdp, "東京から名古屋への引っ越し手続き", 30000);
      await cdp.eval(`document.querySelector('.context-details summary')?.click()`);
    },
  );

  await capture(
    cdp,
    "03-import-ready-desktop.png",
    { width: 1440, height: 1150 },
    async () => {
      await cdp.send("Page.navigate", { url: baseUrl });
      await waitForReady(cdp);
      await submitSearch(cdp, "東京から名古屋へ引っ越す。役所、ライフライン、郵便転送、住所変更を整理したい。");
      await waitForText(cdp, "東京から名古屋への引っ越し手続き", 30000);
      await cdp.eval(`document.querySelector('.import-action')?.click()`);
      await waitForText(cdp, "いつ完了する予定ですか？", 10000);
      await cdp.eval(`
        const input = document.querySelector('#target-anchor-day');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set;
          setter.call(input, '2026-10-01');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        document.querySelector('.import-date-dialog .primary-action')?.click();
      `);
      await waitFor(cdp, () => Boolean(document.querySelector('.handoff-panel')), 10000);
    },
  );

  await capture(
    cdp,
    "04-save-review-desktop.png",
    { width: 1440, height: 1220 },
    async () => {
      await cdp.send("Page.navigate", { url: `${baseUrl}/?run_id=${screenshotRunId}` });
      await waitForReady(cdp);
      await waitFor(cdp, () => Boolean(document.querySelector('#save-title')), 5000);
      await cdp.eval(`
        setTimeout(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('検索情報を作る')).click(), 100);
      `);
      await waitForText(cdp, "検索情報を確認", 30000);
    },
  );

  await capture(
    cdp,
    "05-search-results-mobile.png",
    { width: 390, height: 1180, mobile: true },
    async () => {
      await cdp.send("Page.navigate", { url: baseUrl });
      await waitForReady(cdp);
      await submitSearch(cdp, "東京へ旅行する。宿泊、移動、観光、持ち物、予約、当日の交通を整理したい。");
      await waitForText(cdp, "東京旅行の準備", 30000);
    },
  );

  await capture(
    cdp,
    "06-android-save-handoff-mobile.png",
    { width: 390, height: 1180, mobile: true },
    async () => {
      await cdp.send("Page.navigate", { url: `${baseUrl}/?run_id=${screenshotRunId}` });
      await waitForReady(cdp);
      await new Promise((resolve) => setTimeout(resolve, 900));
    },
  );

  await capture(
    cdp,
    "07-save-published-desktop.png",
    { width: 1440, height: 1050 },
    async () => {
      await cdp.send("Page.navigate", { url: `${baseUrl}/?run_id=${screenshotRunId}` });
      await waitForReady(cdp);
      await cdp.eval(`
        setTimeout(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('検索情報を作る'))?.click(), 100);
      `);
      await waitForText(cdp, "検索情報を確認", 30000);
      await cdp.eval(`
        const checkbox = document.querySelector('.publish-confirm input');
        checkbox?.click();
        setTimeout(() => document.querySelector('.publish-action')?.click(), 100);
      `);
      await waitForText(cdp, "残しました", 30000);
    },
  );
} finally {
  cdp?.close();
  chrome.kill();
}

async function seedCompletedRun() {
  const completion = Date.parse("2026-10-01T12:00:00+09:00");
  const tasks = [
    ["現住所の退去日と新居の入居日を確定する", 0, -35, -28],
    ["転出届と転入届の提出先を確認する", 1, -21, -10],
    ["電気、ガス、水道、郵便転送を申し込む", 1, -14, -4],
  ].map(([title, priority, start, end], index) => ({
    id: `screenshot-task-${index}`,
    title,
    user_priority: priority,
    available_from_at: completion + Number(start) * 86_400_000,
    due_at: completion + Number(end) * 86_400_000,
    sort_order: index,
    completed_at: completion,
    created_at: completion - 40 * 86_400_000,
    updated_at: completion,
  }));
  const response = await fetch(`${baseUrl}/api/runs/${screenshotRunId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-dev-user-id": "local-user" },
    body: JSON.stringify({
      id: screenshotRunId,
      title: "東京から名古屋への引っ越し手続き",
      sort_order: 0,
      archived_at: null,
      completed_anchor_at: completion,
      time_zone: "Asia/Tokyo",
      created_at: completion - 40 * 86_400_000,
      updated_at: completion,
      tasks,
    }),
  });
  if (!response.ok) throw new Error(`Run seed failed: ${response.status} ${await response.text()}`);
}

async function capture(cdp, name, viewport, setup) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.mobile ? 2 : 1,
    mobile: Boolean(viewport.mobile),
  });
  await setup();
  await new Promise((resolve) => setTimeout(resolve, 350));
  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(`${outDir}/${name}`, Buffer.from(screenshot.data, "base64"));
  console.log(`${outDir}/${name}`);
}

async function waitForPageWebSocketUrl() {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(endpoint);
      const targets = await response.json();
      const page = targets.find(
        (target) => target.type === "page" && target.webSocketDebuggerUrl,
      );
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("Chrome DevTools did not become ready");
}

function connect(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result ?? {});
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const messageId = ++id;
          socket.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((taskResolve, taskReject) => {
            pending.set(messageId, { resolve: taskResolve, reject: taskReject });
          });
        },
        eval(expression) {
          return this.send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("error", reject);
  });
}

async function waitForReady(cdp) {
  // Page.navigate can return before the previous complete document is replaced.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(cdp, () => document.readyState === "complete", 10000);
}

async function waitForText(cdp, text, timeoutMs) {
  await waitFor(cdp, (needle) => document.body.innerText.includes(needle), timeoutMs, text);
}

async function submitSearch(cdp, message) {
  await cdp.eval(`document.querySelector('textarea[aria-label="Search query"]')?.focus()`);
  await cdp.send("Input.insertText", { text: message });
  await waitFor(cdp, () => !document.querySelector('.search-composer button[type="submit"]')?.disabled, 3000);
  await cdp.eval(`document.querySelector('.search-composer button[type="submit"]')?.click()`);
}

async function waitFor(cdp, predicate, timeoutMs, argument = null) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await cdp.eval(`(${predicate.toString()})(${JSON.stringify(argument)})`);
    if (result.result?.value) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("Timed out waiting for browser state");
}
