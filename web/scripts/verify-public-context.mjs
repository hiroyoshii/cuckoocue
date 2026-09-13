import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BigQuery } from "@google-cloud/bigquery";
import { chromium } from "@playwright/test";

const dataset = process.env.CUE_BIGQUERY_DATASET;
if (dataset !== "cuckoo_cue_web_verification") throw new Error("Verification dataset required");
const base = process.env.CUE_SCENARIO_BASE_URL || "http://127.0.0.1:3130";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Local server required");
const previous = JSON.parse(await readFile("../docs/review-screenshots/web/residual-fixes/data-evidence.json", "utf8"));
const output = "../docs/review-screenshots/web/public-context";
await mkdir(output, { recursive: true });
const evidence = { base, dataset, mode: "Existing fixture data, read-only API and BQ queries; no domain data writes", checks: [], passed: false };
const bq = new BigQuery({ projectId: "cuckoocue" });
let browser;
try {
  let visibleId;
  for (const fixture of previous.fixtures) {
    const [rows] = await bq.query({ location: "asia-northeast1", query: `
      SELECT id, title, domain, context_text, task_groupings, withdrawn_at,
        ARRAY(SELECT AS STRUCT t.id, t.text AS title, t.default_priority, t.relative_start_day, t.relative_end_day
          FROM UNNEST(tasks) t WITH OFFSET pos ORDER BY pos) AS tasks,
        ARRAY(SELECT AS STRUCT s.id, s.title FROM \`cuckoocue.${dataset}.shelves\` s
          WHERE EXISTS(SELECT 1 FROM UNNEST(s.items) item WHERE item.revision_id = @id)
          ORDER BY s.title, s.id) AS shelves
      FROM \`cuckoocue.${dataset}.cuebook_revisions\` WHERE id = @id`, params: { id: fixture.revisionId } });
    assert.equal(rows.length, 1);
    const expected = rows[0];
    const path = `/api/cuebook-revisions/${fixture.revisionId}`;
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(60000) });
    const body = await response.json();
    evidence.checks.push({ path, status: response.status, expected, body });
    assert.equal(response.status, expected.withdrawn_at ? 410 : 200, JSON.stringify(body));
    if (expected.withdrawn_at) { assert.equal(body.revision, undefined); continue; }
    for (const field of ["id", "title", "domain", "context_text", "task_groupings", "tasks", "shelves"]) assert.deepEqual(body.revision[field], expected[field], field);
    for (const field of ["owner_user_id", "search_text", "context_embedding"]) assert.equal(field in body.revision, false, field);
    visibleId ??= fixture.revisionId;
  }
  const privatePath = `/api/cuebook-revisions/${previous.fixtures[0].cuebookId}`;
  const privateResponse = await fetch(`${base}${privatePath}`, { signal: AbortSignal.timeout(60000) });
  evidence.checks.push({ path: privatePath, status: privateResponse.status, body: await privateResponse.json() });
  assert.equal(privateResponse.status, 404);
  assert.ok(visibleId);
  browser = await chromium.launch({ headless: true });
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, locale: "ja-JP" });
    await page.goto(`${base}/?revision_id=${visibleId}`);
    await page.locator(".public-revision-workspace .detail-context").waitFor({ timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/real-revision-${name}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.close();
  }
  evidence.passed = true;
  console.log(`PASS: ${evidence.checks.length} real read-only checks and two screenshots`);
} catch (error) {
  evidence.error = error.stack || String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  await browser?.close();
  await writeFile(`${output}/read-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
}
