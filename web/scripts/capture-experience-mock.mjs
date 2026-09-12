import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const url = pathToFileURL(resolve(root, 'web/prototypes/experience/index.html')).href;
const out = resolve(root, 'docs/review-screenshots/web/experience-mock');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ja-JP', reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
const requests = [];
const checks = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
const capture = async (name) => { await page.evaluate(async () => { await document.fonts.ready; document.querySelector('#notice').textContent = ''; document.activeElement?.blur(); }); await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true }); };
try {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: '探す', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '参加グループ', exact: true })).toHaveCount(0);
  await expect(page.locator('input[type=date]')).toHaveCount(0);
  await capture('01-search-desktop');
  await page.getByRole('button', { name: '参加', exact: true }).first().click();
  await expect(page.getByRole('navigation', { name: '参加グループ', exact: true })).toBeVisible();
  checks.push('Search has no date input; joining adds only the referenced Shelf to sidebar.');

  await page.getByRole('link', { name: '使う', exact: true }).first().click();
  await page.getByLabel('引っ越し日', { exact: true }).fill('2026-11-15');
  await expect(page.locator('[data-date="0"]')).toHaveValue('2026-10-16');
  await page.locator('[data-date="0"]').fill('2026-10-18');
  await capture('02-schedule-desktop');
  await page.locator('#simulate-error').check();
  await page.getByRole('button', { name: '日程を確定して同期' }).click();
  await expect(page.locator('#schedule-status')).toContainText('同期できませんでした');
  await expect(page.locator('[data-date="0"]')).toHaveValue('2026-10-18');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await capture('04-sync-error-desktop');
  await page.getByRole('button', { name: '日程を確定して同期' }).click();
  await expect(page.getByRole('heading', { name: 'アプリで使う準備ができました' })).toBeVisible();
  await capture('05-sync-success-desktop');
  await page.getByRole('button', { name: 'アプリで開く', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('実機遷移はしません');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  checks.push('Anchor-relative dates, individual edits, mock sync failure retention, retry, mock handoff.');

  await page.getByRole('link', { name: '完了履歴', exact: true }).first().click();
  await page.getByRole('button', { name: '再利用用に整える' }).click();
  await page.getByLabel('リスト名', { exact: true }).fill('猫と暮らす家の引っ越し');
  await expect(page.locator('#save-state')).toHaveText('未保存');
  await page.getByRole('button', { name: '公開内容を確認' }).click();
  await expect(page.locator('#library-status')).toContainText('先に自分用の内容を保存');
  await page.getByRole('button', { name: '自分用に保存' }).click();
  await expect(page.locator('#save-state')).toHaveText('保存済み');
  await capture('03-library-desktop');
  await page.getByRole('button', { name: '公開内容を確認' }).click();
  await capture('06-publish-review-desktop');
  await page.locator('#simulate-error').evaluate((input) => { input.checked = true; });
  await page.getByRole('button', { name: 'この内容を公開' }).click();
  await expect(page.locator('#publish-status')).toContainText('自分用の保存内容は残っています');
  await page.getByRole('button', { name: 'この内容を公開' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('navigation', { name: '参加グループ', exact: true }).getByRole('link')).toHaveCount(2);
  await expect(page.locator('#save-state')).toHaveText('保存済み');
  checks.push('Completed tasks become an editable private draft; private save precedes publication; failed publication keeps original; public Shelf autojoined.');

  await page.getByRole('navigation', { name: '参加グループ', exact: true }).getByRole('link', { name: '猫2匹と暮らす' }).click();
  await page.getByRole('button', { name: 'グループ全体をコピー' }).click();
  await expect(page.getByRole('dialog')).toContainText('全2件');
  await page.getByRole('button', { name: 'コピーして作成' }).click();
  await expect(page.getByRole('dialog').locator('.shelf-item')).toHaveCount(2);
  await expect(page.getByRole('dialog')).toContainText('第3版');
  await expect(page.getByRole('dialog')).toContainText('第2版');
  await page.getByRole('button', { name: '参加を解除' }).click();
  await expect(page.getByRole('dialog').locator('.shelf-item')).toHaveCount(2);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  checks.push('Fork carries all fixed Revision references; leaving removes membership without deleting Shelf contents.');

  const accessibility = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    for (const [index, screen] of ['search', 'schedule', 'library'].entries()) {
      await page.goto(`${url}?screen=${screen}`);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('img').evaluateAll((images) => images.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
      if (width === 390) await capture(`0${index + 1}-${screen}-mobile`);
      if (width === 390 || width === 1440) {
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        accessibility.push({ width, screen, violations: result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })) });
      }
    }
  }
  checks.push('All 3 screens: 320/390/768/1024/1440px overflow and image checks.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await page.getByRole('button', { name: 'メニューを開く' }).click();
  await expect(page.getByRole('navigation', { name: 'メイン', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).not.toBeVisible();
  await page.getByLabel('目的や状況').fill('見つからないサンプル');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByText('一致するリストがありません')).toBeVisible();
  await page.locator('#simulate-error').evaluate((input) => { input.checked = true; });
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('検索できませんでした');
  checks.push('Mobile menu opens/closes with Escape; search empty and failure states are distinct.');
  const report = { type: 'UI mock only; no real API/auth/database/mobile sync validation', checks, errors, externalRequests: requests, accessibility };
  await writeFile(resolve(out, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  expect(accessibility.flatMap((result) => result.violations)).toEqual([]);
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
