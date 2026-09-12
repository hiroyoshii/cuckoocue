import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = pathToFileURL(resolve(root, 'web/prototypes/concepts/app.html')).href;
const out = resolve(root, 'docs/review-screenshots/web/three-concepts');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, locale: 'ja-JP', reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [], requests = [], checks = [], accessibility = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
const visit = (concept, screen) => page.goto(`${base}?concept=${concept}&screen=${screen}`);
try {
  await visit('a', 'start');
  const screens = await page.evaluate(() => window.conceptCatalog.screens);
  for (const concept of ['a', 'b', 'c']) {
    await mkdir(resolve(out, concept), { recursive: true });
    for (const viewport of ['desktop', 'mobile']) {
      await page.setViewportSize(viewport === 'desktop' ? { width: 1440, height: 1040 } : { width: 390, height: 844 });
      for (const [screen] of screens) {
        await visit(concept, screen);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('h1')).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${concept}/${screen}/${viewport} overflow`).toBe(true);
        expect(await page.locator('img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
        await page.screenshot({ path: resolve(out, concept, `${screen}-${viewport}.png`), fullPage: true });
        if (viewport === 'desktop' || ['results', 'schedule', 'editor'].includes(screen)) {
          const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
          accessibility.push({ concept, screen, viewport, violations: result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })) });
        }
      }
      console.log(`${concept}: captured all ${screens.length} ${viewport} screens`);
    }
    await page.setViewportSize({ width: 1440, height: 1040 });
    await visit(concept, 'start');
    await page.getByRole('textbox', { name: '目的や状況' }).fill('猫と引っ越す');
    await page.getByRole('button', { name: '検索', exact: true }).click();
    await expect(page.locator('#screen-select')).toHaveValue('results');
    await expect(page.locator('input[type=date]')).toHaveCount(0);
    if (concept === 'c') {
      await page.locator('.result-index').getByRole('link', { name: '引っ越しに伴う住所変更', exact: true }).click();
      await expect(page.locator('.selection-detail h2')).toContainText('住所変更');
      await page.locator('.result-index').getByRole('link', { name: '猫と暮らす家の引っ越し', exact: true }).click();
    }
    if (concept === 'a') {
      await expect(page.getByRole('button', { name: '参加', exact: true })).toHaveCount(0);
      await page.locator('.related-link').first().click();
      await expect(page.locator('.group-results>.result-item')).toHaveCount(2);
    }
    await page.getByRole('button', { name: '参加', exact: true }).first().click();
    await expect(page.locator('#screen-select')).toHaveValue('account');
    await page.getByRole('button', { name: 'Google で続ける' }).click();
    await expect(page.locator('#screen-select')).toHaveValue(concept === 'a' ? 'group' : 'results');
    await expect(page.getByRole('navigation', { name: '参加グループ', exact: true })).toBeVisible();
    if (concept === 'a') await page.locator('.crumb').click();
    checks.push(`${concept}: search, context-related Shelf membership, account return${concept === 'c' ? ', persistent selection switch' : ''}`);

    const useLink = concept === 'c' ? page.getByRole('link', { name: 'このリストを使う', exact: true }) : page.getByRole('link', { name: '使う', exact: true }).first();
    await useLink.click();
    await page.locator('#anchor').fill('2026-11-15');
    await expect(page.locator('[data-date="0"]')).toHaveValue('2026-10-16');
    await page.locator('[data-date="0"]').fill('2026-10-18');
    await page.locator('#fail-next').check();
    await page.getByRole('button', { name: '日程を確定して同期', exact: true }).click();
    await expect(page.locator('#screen-select')).toHaveValue('sync-error');
    await expect(page.locator('[data-date="0"]')).toHaveValue('2026-10-18');
    await page.getByRole('button', { name: 'もう一度同期する' }).click();
    await expect(page.locator('#screen-select')).toHaveValue('synced');
    await page.getByRole('link', { name: 'アプリで開く', exact: true }).click();
    await expect(page.locator('main')).toContainText('配布先・App Linkは未確認');
    checks.push(`${concept}: Web schedule, retained dates after mock sync failure, retry, non-fabricated handoff endpoint`);

    await page.getByRole('navigation', { name: 'メイン', exact: true }).getByRole('link', { name: '完了履歴', exact: true }).click();
    if (concept !== 'c') await page.getByRole('link', { name: '完了内容を見る' }).click();
    await page.getByRole('button', { name: concept === 'a' ? '再利用用リストを編集' : '再利用用に整える' }).click();
    await page.locator('#draft-title').fill('自分用の引っ越しリスト');
    await page.getByRole('link', { name: '公開内容を確認', exact: true }).click();
    await expect(page.locator('#screen-select')).toHaveValue('editor');
    await page.getByRole('button', { name: '自分用に保存', exact: true }).click();
    await expect(page.locator('.save-state')).toHaveText('保存済み');
    await page.getByRole('link', { name: '公開内容を確認', exact: true }).click();
    await page.getByLabel('グループ名', { exact: true }).fill('公開先のテスト');
    await page.locator('#fail-next').check();
    await page.getByRole('button', { name: 'この内容を公開', exact: true }).click();
    await expect(page.locator('#screen-select')).toHaveValue('publish-error');
    await expect(page.getByLabel('グループ名', { exact: true })).toHaveValue('公開先のテスト');
    await page.getByRole('button', { name: 'もう一度公開する' }).click();
    await expect(page.locator('#screen-select')).toHaveValue('published');
    checks.push(`${concept}: completed tasks to private draft/save, guarded publication, publish failure preserves input, retry`);

    await page.getByRole('navigation', { name: '参加グループ', exact: true }).getByRole('link', { name: '猫2匹と暮らす', exact: true }).click();
    await page.getByRole('link', { name: 'グループ全体をコピー', exact: true }).click();
    await expect(page.locator('.revision-list li')).toHaveCount(2);
    await page.getByRole('button', { name: 'コピーして作成' }).click();
    await expect(page.locator('#screen-select')).toHaveValue('group-edit');
    await page.getByRole('button', { name: '1件目を下へ', exact: true }).click();
    await expect(page.locator('.revision-list li').first()).toContainText('留守番');
    await page.getByRole('button', { name: '変更を保存', exact: true }).click();
    await expect(page.locator('#screen-select')).toHaveValue('group');
    await page.getByRole('button', { name: '参加を解除', exact: true }).click();
    await expect(page.locator('.group-results>.result-item')).toHaveCount(2);
    checks.push(`${concept}: whole-Shelf fixed revision copy, owner reordering, saved changes, leave retains Shelf`);

    for (const width of [320, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      for (const screen of ['results', 'schedule', 'group-edit', 'editor', 'publish']) {
        await visit(concept, screen);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${concept}/${screen}/${width} overflow`).toBe(true);
      }
    }
  }
  const report = { scope: '20 UI screens/states x 3 concepts x desktop/mobile; simulated data only', screenshotCount: screens.length * 6, checks, errors, externalRequests: requests, accessibility };
  await writeFile(resolve(out, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  expect(errors).toEqual([]); expect(requests).toEqual([]);
  expect(accessibility.flatMap((result) => result.violations)).toEqual([]);
  console.log(`PASS: ${report.screenshotCount} screenshots, ${checks.length} flow checks, ${accessibility.length} axe checks`);
} finally { await browser.close(); }
