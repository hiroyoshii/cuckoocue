import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { BigQuery } from "@google-cloud/bigquery";
import { buildSearchText } from "../src/lib/search-text.ts";

// Explicit dataset and --apply are required; the default is a read-only plan.
const dataset = process.env.CUE_BIGQUERY_DATASET;
const project = process.env.GOOGLE_CLOUD_PROJECT || "cuckoocue";
const location = process.env.GOOGLE_CLOUD_LOCATION || "asia-northeast1";
assert.match(dataset || "", /^[a-zA-Z_][a-zA-Z0-9_]*$/);
assert.match(project, /^[a-z][a-z0-9-]+$/);
const apply = process.argv.includes("--apply");
const bq = new BigQuery({ projectId: project });
const table = `\`${project}.${dataset}.cuebook_revisions\``;
const [rows] = await bq.query({ location, query: `SELECT id, title, tasks, domain, context_text, task_groupings, search_text FROM ${table}` });
const changes = rows.flatMap(row => {
  const next = buildSearchText(row, { domain: row.domain ?? "", context_text: row.context_text ?? "", task_groupings: row.task_groupings ?? [] });
  return next === row.search_text ? [] : [{ id: row.id, before: row.search_text ?? "", after: next }];
});
const evidence = { project, dataset, apply, scanned: rows.length, changes, jobs: [], updated: 0 };
for (let offset = 0; apply && offset < changes.length; offset += 100) {
  const batch = changes.slice(offset, offset + 100);
  const [job] = await bq.createQueryJob({ location, jobTimeoutMs: 30000, query: `
    UPDATE ${table} AS target SET search_text = JSON_VALUE(change, '$.after')
    FROM UNNEST(JSON_QUERY_ARRAY(@changes)) AS change
    WHERE target.id = JSON_VALUE(change, '$.id') AND IFNULL(target.search_text, '') = JSON_VALUE(change, '$.before');
    SELECT @@row_count AS updated;
  `, params: { changes: JSON.stringify(batch) } });
  const [result] = await job.getQueryResults();
  evidence.jobs.push(job.id);
  evidence.updated += result[0].updated;
  assert.equal(result[0].updated, batch.length, "Concurrent change detected; rerun the read-only plan");
}
if (process.env.CUE_REINDEX_EVIDENCE) await writeFile(process.env.CUE_REINDEX_EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ project, dataset, apply, scanned: rows.length, changed: changes.length, updated: evidence.updated, jobs: evidence.jobs }));
