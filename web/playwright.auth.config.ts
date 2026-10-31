import { defineConfig, devices } from "@playwright/test";

// Exercise the production Firebase client branch with isolated fake credentials.
// Tests replace Auth/API HTTP responses; no real accounts or data are touched.
const port = 3115;
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/auth",
  timeout: 120_000,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  reporter: "line",
  use: { baseURL, locale: "ja-JP", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `"${process.execPath}" node_modules/next/dist/bin/next build && "${process.execPath}" node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      CUE_ALLOW_DEV_AUTH: "false",
      NEXT_PUBLIC_FIREBASE_API_KEY: "guest-draft-test-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "guest-draft-test.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "guest-draft-test",
      NEXT_PUBLIC_FIREBASE_APP_ID: "guest-draft-test-app",
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "",
    },
  },
});
