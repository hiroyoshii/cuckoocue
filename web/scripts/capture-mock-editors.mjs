import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const url = pathToFileURL(resolve(root, 'web/prototypes/concepts/app.html')).href;
const out = resolve(root, 'docs/review-screenshots/web/three-concepts/a');
const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'ja-JP', reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [], accessibility = [];
page.on('pageerror', (error) => errors.push(error.message));
const capture = async (name) => {
  await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); document.querySelector('#toast').textContent = ''; });
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true });
};
try {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1040 : 844 });
    const viewport = width === 1440 ? 'desktop' : 'mobile';
    await page.goto(`${url}?concept=a&screen=schedule`);
    const publishedBefore = await page.evaluate(() => JSON.stringify(revisions[0]));
    await page.locator('#anchor').fill('2026-11-15');
    await expect(page.locator('[data-date="0"]')).toHaveValue('2026-10-16');
    await page.locator('[data-date="1"]').fill('2026-10-27');
    await expect(page.locator('.is-changed')).toHaveCount(1);
    await expect(page.locator('.schedule-summary')).toContainText('個別変更 1件');
    await page.getByRole('button', { name: 'タスク2を元の日程に戻す' }).click();
    await expect(page.locator('[data-date="1"]')).toHaveValue('2026-10-25');
    await page.getByRole('button', { name: '直前の日程変更を取り消す' }).click();
    await expect(page.locator('[data-date="1"]')).toHaveValue('2026-10-27');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#anchor').fill('2026-11-16');
    await expect(page.locator('#anchor')).toHaveValue('2026-11-15');
    await expect(page.locator('[data-date="1"]')).toHaveValue('2026-10-27');
    if (width !== 320) await capture(`schedule-edited-${viewport}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.locator('#fail-next').evaluate((element) => { element.checked = true; });
    await page.getByRole('button', { name: '日程を確定して同期' }).click();
    await expect(page.locator('#screen-select')).toHaveValue('sync-error');
    await expect(page.locator('[data-date="1"]')).toHaveValue('2026-10-27');
    expect(await page.evaluate(() => JSON.stringify(revisions[0]))).toBe(publishedBefore);

    await page.goto(`${url}?concept=a&screen=editor`);
    await expect(page.locator('#app')).not.toContainText('Cuebook');
    await expect(page.locator('[data-days="5"]')).toBeDisabled();
    await page.getByRole('button', { name: 'タスク1を下へ', exact: true }).click();
    await expect(page.locator('[data-task="0"]')).toHaveValue('引っ越し業者と猫の移動手段を決める');
    await expect(page.locator('[data-days="0"]')).toHaveValue('21');
    await expect(page.locator('.save-state')).toHaveText('未保存');
    await page.getByRole('button', { name: 'タスク1を削除', exact: true }).click();
    await expect(page.locator('.draft-edit-row')).toHaveCount(5);
    await page.getByRole('button', { name: '直前の編集を取り消す' }).click();
    await expect(page.locator('.draft-edit-row')).toHaveCount(6);
    await expect(page.locator('[data-task="0"]')).toHaveValue('引っ越し業者と猫の移動手段を決める');
    await page.locator('[data-days="0"]').fill('18');
    await page.locator('[data-task="0"]').fill('引っ越し業者を予約し、猫の移動手段を決める');
    if (width !== 320) {
      await capture(`editor-edited-${viewport}`);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      accessibility.push({ width, violations: result.violations.map(({ id }) => id) });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: '公開内容を確認' }).click();
    await expect(page.locator('#screen-select')).toHaveValue('editor');
    await page.locator('#fail-next').evaluate((element) => { element.checked = true; });
    await page.getByRole('button', { name: '自分用に保存' }).click();
    await expect(page.locator('#operation-status')).toContainText('保存できませんでした');
    await expect(page.locator('.save-state')).toHaveText('未保存');
    await expect(page.locator('[data-days="5"]')).toBeDisabled();
    await page.getByRole('button', { name: '自分用に保存' }).click();
    await expect(page.locator('.save-state')).toHaveText('保存済み');
    await expect(page.getByRole('button', { name: '直前の編集を取り消す' })).toBeDisabled();
    expect(await page.evaluate(() => JSON.stringify(revisions[0]))).toBe(publishedBefore);
  }
  expect(errors).toEqual([]);
  expect(accessibility.flatMap(({ violations }) => violations)).toEqual([]);
  const report = { scope: 'Mock editing interactions only', widths: [1440, 390, 320], checks: ['Anchor calculation', 'Changed date indicator, reset and undo', 'Confirm before overwriting manual dates', 'Sync failure retains date edits', 'Reorder preserves task/date pairing', 'Delete and undo', 'Unsigned day input plus before/same/after mapping', 'Edit failure retains content', 'Save clears undo and dirty state', 'Published Revision unchanged'], errors, accessibility };
  await writeFile(resolve(out, 'editor-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
