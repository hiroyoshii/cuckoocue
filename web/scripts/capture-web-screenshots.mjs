import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const chromePath =
  process.env.CHROME_PATH || "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe";
const baseUrl = process.env.CUE_SCREENSHOT_BASE_URL || "http://localhost:3000";
const outDir = process.env.CUE_SCREENSHOT_OUT_DIR || "../build/web-screenshots";
const port = Number(process.env.CUE_SCREENSHOT_CDP_PORT || 9222);

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

  await capture(cdp, "01-empty-desktop.png", { width: 1440, height: 1050 }, async () => {
    await cdp.send("Page.navigate", { url: baseUrl });
    await waitForReady(cdp);
  });

  await capture(
    cdp,
    "02-search-results-desktop.png",
    { width: 1440, height: 1150 },
    async () => {
      await cdp.send("Page.navigate", { url: baseUrl });
      await waitForReady(cdp);
      await cdp.eval(`
        const setValue = (el, value) => {
          const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
          setter.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setValue(
          document.querySelector('textarea[aria-label="Search query"]'),
          '東京から名古屋へ引っ越す。役所、ライフライン、郵便転送、住所変更を整理したい。'
        );
        setTimeout(() => document.querySelector('button[type="submit"]').click(), 100);
      `);
      await waitForText(cdp, "東京から名古屋への引っ越し手続き", 30000);
    },
  );

  await capture(
    cdp,
    "03-save-review-desktop.png",
    { width: 1440, height: 1220 },
    async () => {
      await cdp.send("Page.navigate", { url: baseUrl });
      await waitForReady(cdp);
      await cdp.eval(`
        const setValue = (selector, value) => {
          const el = document.querySelector(selector);
          const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
          setter.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setValue('#save-title', '東京から名古屋への引っ越し手続き');
        setValue('input[aria-label="Task 1"]', '現住所の退去日と新居の入居日を確定する');
        setValue('input[aria-label="Priority 1"]', '1');
        setValue('input[aria-label="Relative start day 1"]', '-35');
        setValue('input[aria-label="Relative end day 1"]', '-28');
        setValue('input[aria-label="Task 2"]', '東京側の転出届と名古屋側の転入届を確認する');
        setValue('input[aria-label="Priority 2"]', '1');
        setValue('input[aria-label="Relative start day 2"]', '-21');
        setValue('input[aria-label="Relative end day 2"]', '-10');
        setValue('input[aria-label="Task 3"]', '電気、ガス、水道、郵便転送、住所変更を申し込む');
        setValue('input[aria-label="Priority 3"]', '2');
        setValue('input[aria-label="Relative start day 3"]', '-14');
        setValue('input[aria-label="Relative end day 3"]', '-4');
        setTimeout(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('確認')).click(), 100);
      `);
      await waitForText(cdp, "確認できます", 30000);
    },
  );

  await capture(
    cdp,
    "04-search-results-mobile.png",
    { width: 390, height: 1180, mobile: true },
    async () => {
      await cdp.send("Page.navigate", { url: baseUrl });
      await waitForReady(cdp);
      await cdp.eval(`
        const setValue = (el, value) => {
          const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
          setter.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setValue(
          document.querySelector('textarea[aria-label="Search query"]'),
          '東京へ旅行する。宿泊、移動、観光、持ち物、予約、当日の交通を整理したい。'
        );
        setTimeout(() => document.querySelector('button[type="submit"]').click(), 100);
      `);
      await waitForText(cdp, "東京旅行の準備", 30000);
    },
  );
} finally {
  cdp?.close();
  chrome.kill();
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
  await waitFor(cdp, () => document.readyState === "complete", 10000);
}

async function waitForText(cdp, text, timeoutMs) {
  await waitFor(cdp, (needle) => document.body.innerText.includes(needle), timeoutMs, text);
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
