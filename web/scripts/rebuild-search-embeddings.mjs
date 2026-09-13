import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { BigQuery } from "@google-cloud/bigquery";
import { GoogleAuth } from "google-auth-library";

const dataset = process.env.CUE_BIGQUERY_DATASET;
const project = process.env.GOOGLE_CLOUD_PROJECT || "cuckoocue";
const location = process.env.GOOGLE_CLOUD_LOCATION || "asia-northeast1";
assert.match(dataset || "", /^[a-zA-Z_][a-zA-Z0-9_]*$/);
assert.match(project, /^[a-z][a-z0-9-]+$/);
const apply = process.argv.includes("--apply");
function evaluate(source, dependencies) {
  const runtime = { exports: {}, process, setTimeout, clearTimeout, require: name => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, runtime);
  return runtime.exports;
}
const resilience = evaluate(await readFile("src/lib/resilience.ts", "utf8"), {});
const embedding = evaluate(await readFile("src/lib/task-list-embeddings.ts", "utf8"), {
  "google-auth-library": { GoogleAuth }, "./resilience": resilience,
  "./env": { cueEnv: { projectId: () => project, googleCloudLocation: () => location } },
});
const bq = new BigQuery({ projectId: project });
const table = `\`${project}.${dataset}.cuebook_revisions\``;
const [rows] = await bq.query({ location, query: `SELECT id, title, tasks, domain, context_text, task_groupings, context_embedding FROM ${table}` });
const changes = [];
const evidence = { dataset, project, apply, model: process.env.CUE_EMBEDDING_MODEL || "text-multilingual-embedding-002", taskType: "RETRIEVAL_DOCUMENT", rows: rows.length, changes, jobs: [] };
for (const row of rows) {
  const text = embedding.buildTaskListContextEmbeddingText(row, row);
  const change = { id: row.id, input: text, before: row.context_embedding };
  changes.push(change);
  if (apply) change.after = await embedding.embedText(text, "RETRIEVAL_DOCUMENT");
}
if (apply && changes.length) {
  const [job] = await bq.createQueryJob({ location, jobTimeoutMs: 30000, query: `
    UPDATE ${table} AS target SET context_embedding = ARRAY(SELECT CAST(JSON_VALUE(v) AS FLOAT64) FROM UNNEST(JSON_QUERY_ARRAY(change, '$.after')) v)
    FROM UNNEST(JSON_QUERY_ARRAY(@changes)) change
    WHERE target.id = JSON_VALUE(change, '$.id')
      AND TO_JSON_STRING(target.context_embedding) = TO_JSON_STRING(ARRAY(SELECT CAST(JSON_VALUE(v) AS FLOAT64) FROM UNNEST(JSON_QUERY_ARRAY(change, '$.before')) v));
    SELECT @@row_count AS updated;
  `, params: { changes: JSON.stringify(changes) } });
  const [result] = await job.getQueryResults();
  evidence.jobs.push(job.id);
  evidence.updated = result[0].updated;
  assert.equal(evidence.updated, changes.length, "Concurrent embedding update; inspect and rerun");
}
if (process.env.CUE_REINDEX_EVIDENCE) await writeFile(process.env.CUE_REINDEX_EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ dataset, project, apply, rows: rows.length, updated: evidence.updated, jobs: evidence.jobs }));
