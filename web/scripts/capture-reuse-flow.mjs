import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = pathToFileURL(resolve(root, 'web/prototypes/concepts/app.html')).href;
const out = resolve(root, 'docs/review-screenshots/web/reuse-flow');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'ja-JP', reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [], accessibility = [], captures = [], scenarios = [];
page.on('pageerror', (error) => errors.push(error.message));
const inspect = () => page.evaluate(() => window.reuseMock.inspect());
const failNext = () => page.locator('#fail-next').evaluate((element) => { element.checked = true; });
async function capture(name) {
  await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); window.scrollTo(0,0); });
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
  expect(await page.locator('img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)), name).toBe(true);
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true });
  captures.push(name);
}
try {
  // Full-cycle actions, rather than preloading each success screen.
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1040 : 844 });
    const suffix = width === 1440 ? 'desktop' : `mobile-${width}`;
    await page.goto(`${base}?concept=a&screen=results`);
    const before = await inspect();
    await page.locator('.related-link').first().click();
    await expect(page.locator('#screen-select')).toHaveValue('group');
    await page.getByRole('button', { name: '参加', exact: true }).click();
    await page.getByRole('button', { name: 'Google で続ける' }).click();
    await expect(page.getByRole('button', { name: '参加を解除', exact: true })).toBeVisible();
    expect((await inspect()).joined).toContain('shelf-cats');
    await capture(`group-joined-${suffix}`);
    await page.locator('a[href="#schedule/revision-moving-3"]').first().click();
    await expect(page.locator('#flow-anchor')).toHaveValue('');
    await page.locator('#flow-anchor').fill('2026-11-15');
    expect((await inspect()).prep.tasks[0].date).toBe('2026-10-16');
    await page.locator('[data-flow="expand:1"]').click();
    await page.locator('[data-prep-title="1"]').fill('引っ越し業者とペットタクシーを予約する');
    await page.locator('[data-prep-date="1:date"]').fill('2026-10-27');
    await page.locator('[data-prep-priority="1"]').selectOption('0');
    await page.locator('[data-include="2"]').uncheck();
    await page.locator('#flow-run-title').fill('11月の引っ越し準備');
    await capture(`schedule-edited-${suffix}`);
    await page.locator('#flow-anchor').fill('2026-11-16');
    await expect(page.locator('#confirm')).toBeVisible();
    await page.locator('[data-flow="anchor-keep"]').click();
    expect((await inspect()).prep.tasks[1].date).toBe('2026-10-27');
    expect((await inspect()).prep.tasks[0].date).toBe('2026-10-17');
    await page.locator('[data-flow="prep-up:1"]').click();
    expect((await inspect()).prep.tasks[0].title).toBe('引っ越し業者とペットタクシーを予約する');
    await failNext();
    await page.getByRole('button', { name: 'この内容で保存', exact: true }).click();
    await expect(page.locator('#screen-select')).toHaveValue('sync-error');
    expect((await inspect()).runs).toHaveLength(0);
    expect((await inspect()).prep.tasks[0].date).toBe('2026-10-27');
    await capture(`save-failed-${suffix}`);
    await page.getByRole('button', { name: 'もう一度保存', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'リストを保存しました' })).toBeVisible();
    let snapshot = await inspect();
    expect(snapshot.runs).toHaveLength(1);
    const run = snapshot.runs[0];
    expect(run.tasks).toHaveLength(5);
    expect(run.tasks[0].date).toBe('2026-10-27');
    expect(run.tasks[0].priority).toBe(0);
    expect(run.tasks.every((task) => Boolean(task.sourceTaskId))).toBe(true);
    expect(snapshot.revisions).toEqual(before.revisions);
    const borrowed = snapshot.library.find((item) => item.id === run.sourceCuebookId);
    expect(borrowed.tasks).toHaveLength(6);
    expect(borrowed.title).toBe(before.revisions[0].title);
    await capture(`saved-not-received-${suffix}`);
    await failNext();
    await page.locator('[data-flow="open-android"]').click();
    await expect(page.locator('#app .error')).toContainText('保存したリストは残っています');
    expect((await inspect()).runs).toHaveLength(1);
    await capture(`handoff-failed-${suffix}`);
    await page.locator('[data-flow="open-android"]').click();
    expect((await inspect()).handoffId).toBe(run.id);
    expect((await inspect()).runs).toHaveLength(1);
    await page.locator('[data-flow="receive"]').click();
    expect((await inspect()).runs[0].received).toBe(true);
    await capture(`android-received-${suffix}`);
    await page.locator('[data-flow="complete"]').click();
    await expect(page.locator('#screen-select')).toHaveValue('history');
    await page.locator(`a[href="#history-detail/${run.id}"]`).first().click();
    await capture(`completed-history-${suffix}`);
    await page.locator('[data-flow="history-original"]').click();
    await expect(page.locator('#screen-select')).toHaveValue('editor');
    await page.locator('.flow-offset-details').first().locator('summary').click();
    // 10/27 is 20 days before the planned 11/16, not 23 days before the completion click.
    await expect(page.locator('[data-relative-number="0:day"]')).toHaveValue('20');
    await page.locator('[data-original-title]').fill('ペットタクシーを使う引っ越し準備');
    await page.locator('[data-original-task="0"]').fill('引っ越し業者とペットタクシーを手配する');
    await capture(`original-edited-${suffix}`);
    await failNext();
    await page.getByRole('button', { name: '自分用に保存', exact: true }).click();
    await expect(page.locator('#operation-status')).toContainText('保存できませんでした');
    await page.getByRole('button', { name: '自分用に保存', exact: true }).click();
    await expect(page.locator('.save-state')).toHaveText('保存済み');
    snapshot = await inspect();
    const edited = snapshot.library.at(-1);
    expect(edited.tasks[0].day).toBe(-20);
    expect(snapshot.histories[0].tasks[0].title).toBe(run.tasks[0].title);
    expect(snapshot.revisions).toEqual(before.revisions);
    await page.getByRole('link', { name: '公開内容を確認', exact: true }).click();
    await expect(page.locator('.flow-read-list')).toContainText('最終日の20日前');
    await expect(page.locator('.flow-read-list')).toContainText('優先度 強');
    await capture(`publication-confirm-${suffix}`);
    await failNext();
    await page.getByRole('button', { name: 'この内容を公開', exact: true }).click();
    await expect(page.locator('#screen-select')).toHaveValue('publish-error');
    expect((await inspect()).revisions).toHaveLength(before.revisions.length);
    await page.getByRole('button', { name: 'もう一度公開する', exact: true }).click();
    await expect(page.locator('#screen-select')).toHaveValue('published');
    await capture(`published-result-${suffix}`);
    snapshot = await inspect();
    expect(snapshot.revisions.at(-1).tasks).toEqual(edited.tasks);
    await page.getByRole('link', { name: '自分のリスト', exact: true }).last().click();
    await capture(`library-saved-${suffix}`);
    await page.locator(`a[href="#use-private/${edited.id}"]`).click();
    await page.locator('#flow-anchor').fill('2027-03-01');
    await page.getByRole('button', { name: 'この内容で保存', exact: true }).click();
    await expect(page.locator('#screen-select')).toHaveValue('synced');
    snapshot = await inspect();
    expect(snapshot.runs).toHaveLength(2);
    expect(snapshot.runs[1].sourceCuebookId).toBe(edited.id);
    expect(snapshot.runs[1].tasks[0].date).toBe('2027-02-09');
    expect(snapshot.library).toHaveLength(3);
    scenarios.push({ width, passed: true, data: snapshot });
    console.log(`PASS full reuse cycle ${width}`);
  }
  for (const width of [1440,390,320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1040 : 844 });
    await page.goto(`${base}?concept=a&screen=start`);
    const screens = await page.evaluate(() => window.conceptCatalog.screens);
    for (const [screen] of screens) {
      await page.goto(`${base}?concept=a&screen=${screen}`);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${screen}`).toBe(true);
      if (width !== 320) await capture(`${screen}-${width === 1440 ? 'desktop' : 'mobile'}`);
      if (width !== 320) {
        const report = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        accessibility.push({ width,screen,violations:report.violations.map(({ id,nodes }) => ({ id,targets:nodes.map((node) => node.target) })) });
      }
      console.log(`Checked ${width}/${screen}`);
    }
  }
  await page.setViewportSize({ width:1440,height:1040 });
  await page.goto(pathToFileURL(resolve(root,'web/prototypes/concepts/adopted.html')).href);
  await expect(page.locator('.screen-row')).toHaveCount(20);
  await page.locator('#gallery img').evaluateAll(async (images) => {
    for (const image of images) { image.loading = 'eager'; await image.decode(); }
  });
  expect(await page.locator('#gallery img').count()).toBe(28);
  expect(errors).toEqual([]);
  expect(accessibility.flatMap((row) => row.violations)).toEqual([]);
  await writeFile(resolve(out,'verification.json'),JSON.stringify({ scope:'In-memory mock only; no BQ, Firestore, authentication or real Android connection',captures,errors,accessibility,scenarios },null,2)+'\n');
  console.log(`PASS: ${captures.length} screenshots, 3 full-cycle scenarios, 20 screens at 3 widths.`);
} finally { await browser.close(); }
