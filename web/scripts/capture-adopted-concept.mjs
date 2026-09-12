import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = pathToFileURL(resolve(root, 'web/prototypes/concepts/app.html')).href;
const out = resolve(root, 'docs/review-screenshots/web/three-concepts/a');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, locale: 'ja-JP', reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [], captured = [], accessibility = [];
page.on('pageerror', (error) => errors.push(error.message));
const capture = async (id) => {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: resolve(out, `${id}-desktop.png`), fullPage: true });
  captured.push(id);
};
try {
  await page.goto(base);
  const screens = await page.evaluate(() => window.conceptCatalog.screens);
  for (const [id] of screens) {
    await page.goto(`${base}?concept=a&screen=${id === 'group' ? 'results' : id}`);
    if (id === 'group') await page.locator('.related-link').first().click();
    await expect(page.locator('h1')).toHaveCount(1);
    await capture(id);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    accessibility.push({ screen: id, violations: result.violations.map(({ id }) => id) });
    if (id === 'group') {
      await page.getByRole('button', { name: '参加', exact: true }).click();
      await page.getByRole('button', { name: 'Google で続ける', exact: true }).click();
      await expect(page.getByRole('button', { name: '参加を解除', exact: true })).toBeVisible();
      await capture('group-joined');
    }
    console.log(`Captured ${id}`);
  }
  await page.goto(pathToFileURL(resolve(root, 'web/prototypes/concepts/adopted.html')).href);
  await expect(page.locator('.screen-row')).toHaveCount(20);
  await page.locator('#gallery img').evaluateAll(async (images) => {
    for (const image of images) { image.loading = 'eager'; await image.decode(); }
  });
  expect(await page.locator('#gallery img').count()).toBe(21);
  expect(errors).toEqual([]);
  expect(accessibility.flatMap(({ violations }) => violations)).toEqual([]);
  const report = { scope: 'Adopted A, desktop UI screenshots only; no real API/auth/sync', viewport: { width: 1440, height: 1040 }, captured, errors, accessibility, galleryImagesLoaded: 21 };
  await writeFile(resolve(out, 'adopted-desktop-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: 20 screens + joined state, all gallery images loaded.');
} finally { await browser.close(); }
