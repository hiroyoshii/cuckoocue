import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { BigQuery } from "@google-cloud/bigquery";
import { cleanEvaluationShelf } from "./search-evaluation-maintenance.mjs";

// Fixture maintenance only. Re-enrich ALL examples, publish new immutable
// revisions through the API, then withdraw the old test snapshots directly.
const dataset = process.env.CUE_BIGQUERY_DATASET;
assert.equal(dataset, "cuckoo_cue_search_evaluation_v2");
const base = process.env.CUE_SCENARIO_BASE_URL || "http://127.0.0.1:3135";
const output = "../docs/review-screenshots/web/search-relevance";
const sourceName = process.env.CUE_REFRESH_PREPARATION || "preparation-v2";
const name = process.env.CUE_REFRESH_NAME || "preparation-v3";
assert.match(sourceName, /^[a-z0-9-]+$/);
assert.match(name, /^[a-z0-9-]+$/);
assert.notEqual(sourceName, name);
const original = JSON.parse(await readFile(`${output}/${sourceName}.json`, "utf8"));
assert.equal(original.passed, true);
const selected = process.env.CUE_REFRESH_IDS?.split(",");
const path = `${output}/${name}.json`;
const previous = await readFile(path, "utf8").then(JSON.parse).catch(e => { if (e.code !== "ENOENT") throw e; return null; });
const evidence = previous ?? { ...original, passed: false, operations: [], savedRows: [],
  scope: "All 25 fixtures re-enriched with current code, original tasks/title/labels unchanged. Private save and new publication via API; old synthetic snapshots withdrawn by test-only BQ maintenance.",
  sourceName, selectedIds: selected ?? original.documents.map(d => d.id),
  documents: original.documents.map(d => selected && !selected.includes(d.id) ? { ...d, withdrawnPrevious: true } : ({ ...d, previousRevisionId: d.revisionId, revisionId: randomUUID(), operationId: randomUUID(), previousSaved: d.saved, generated: null, reviewed: null, saved: null, published: false, withdrawnPrevious: false })),
};
const bq = new BigQuery({ projectId: "cuckoocue" });
async function save() { await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`); }
async function api(path, method, input, status = 200) {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-dev-user-id": evidence.author }, body: JSON.stringify(input), signal: AbortSignal.timeout(180000) });
  const body = await response.json();
  evidence.operations.push({ path, method, input, status: response.status, body });
  await save();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}
try {
  for (const d of evidence.documents) {
    if (d.withdrawnPrevious) continue;
    if (!d.generated) d.generated = (await api("/api/task-list-enrichment", "POST", d.draft)).enrichment;
    d.reviewed = { ...d.generated, domain: d.domain };
    if (!d.saved) d.saved = (await api(`/api/cuebooks/${d.cuebookId}`, "PUT", { operation_id: d.operationId, expected_updated_at: d.previousSaved.updated_at, content: { ...d.draft, enrichment: d.reviewed } })).cuebook;
    if (!d.published) {
      await api("/api/cuebook-revisions", "POST", { revision_id: d.revisionId, source_cuebook_id: d.cuebookId, expected_source_updated_at: d.saved.updated_at, shelf_id: evidence.shelfId, title: d.title, tasks: d.saved.tasks.map(t => ({ title: t.text, default_priority: t.default_priority, relative_start_day: t.relative_start_day, relative_end_day: t.relative_end_day })) }, 201);
      d.published = true;
      await save();
    }
    const query = `UPDATE \`cuckoocue.${dataset}.cuebook_revisions\` SET withdrawn_at = CURRENT_TIMESTAMP() WHERE id = @id AND owner_user_id = @owner AND withdrawn_at IS NULL`;
    const params = { id: d.previousRevisionId, owner: evidence.author };
    await bq.query({ location: "asia-northeast1", query, params });
    evidence.operations.push({ maintenance: "Withdraw old synthetic snapshot", query, params });
    d.withdrawnPrevious = true;
    evidence.operations.push({ maintenance: "Remove only withdrawn fixture placements", ...await cleanEvaluationShelf({ dataset, shelfId: evidence.shelfId, owner: evidence.author, apply: true }) });
    await save();
    console.log(JSON.stringify({ id: d.id, context: d.reviewed.context_text, groups: d.reviewed.task_groupings }));
  }
  const [rows] = await bq.query({ location: "asia-northeast1", query: `SELECT * FROM \`cuckoocue.${dataset}.cuebook_revisions\` WHERE owner_user_id = @owner AND withdrawn_at IS NULL`, params: { owner: evidence.author } });
  assert.equal(rows.length, evidence.documents.length);
  evidence.savedRows = rows;
  evidence.passed = true;
  delete evidence.error;
} catch (e) { evidence.error = e.stack; process.exitCode = 1; console.error(e); }
finally { await save(); }
