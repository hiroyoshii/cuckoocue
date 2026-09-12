import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const url = pathToFileURL(resolve(root, 'web/prototypes/concepts/app.html')).href;
const out = resolve(root, 'docs/review-screenshots/web/three-concepts/a');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'ja-JP', reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [], accessibility = [];
page.on('pageerror', (error) => errors.push(error.message));
const capture = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true });
};
try {
  for (const width of [1440, 390, 320]) {
    const viewport = width === 1440 ? 'desktop' : 'mobile';
    await page.setViewportSize({ width, height: width === 1440 ? 1040 : 844 });
    await page.goto(`${url}?concept=a&screen=results`);
    await expect(page.locator('[data-action^="join:"]')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '参加グループ', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await capture(`results-${viewport}`);

    await page.locator('.related-link').first().click();
    await expect(page.locator('#screen-select')).toHaveValue('group');
    await expect(page.locator('.group-results>.result-item')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '参加', exact: true })).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: '参加グループ', exact: true })).toHaveCount(0);
    await expect(page.locator('.group-results .related-link')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) {
      await capture(`group-${viewport}`);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      accessibility.push({ viewport, violations: result.violations.map(({ id }) => id) });
    }

    await page.getByRole('button', { name: '参加', exact: true }).click();
    await expect(page.locator('#screen-select')).toHaveValue('account');
    await page.getByRole('button', { name: 'Google で続ける' }).click();
    await expect(page.locator('#screen-select')).toHaveValue('group');
    await expect(page.getByRole('button', { name: '参加を解除', exact: true })).toBeVisible();
    if (width < 700) await page.getByRole('button', { name: 'メニューを開く', exact: true }).click();
    await expect(page.getByRole('navigation', { name: '参加グループ', exact: true }).getByRole('link')).toHaveCount(1);
    if (width !== 320) await capture(`group-joined-${viewport}`);
    if (width < 700) await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '参加を解除', exact: true }).click();
    await expect(page.getByRole('navigation', { name: '参加グループ', exact: true })).toHaveCount(0);
    await expect(page.locator('.group-results>.result-item')).toHaveCount(2);

    await page.goto(`${url}?concept=a&screen=detail`);
    await expect(page.locator('[data-action^="join:"]')).toHaveCount(0);
    await expect(page.locator('.related-link')).toHaveCount(1);
    if (width !== 320) await capture(`detail-${viewport}`);
  }
  expect(errors).toEqual([]);
  expect(accessibility.flatMap(({ violations }) => violations)).toEqual([]);
  const result = { scope: 'Concept A UI mock, not real API/authentication', widths: [1440, 390, 320], checks: ['No inline join on results/detail', 'Group link opens all associated Cuebooks without joining', 'Exactly one join button on group page', 'Account connection returns to group and resumes join', 'Leave removes membership, retains Cuebooks'], errors, accessibility };
  await writeFile(resolve(out, 'membership-verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
