import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { BigQuery } from "@google-cloud/bigquery";

const root = "../docs/review-screenshots/web/search-relevance";
const p = JSON.parse(await readFile(`${root}/preparation-challenges.json`, "utf8"));
assert.equal(p.dataset, "cuckoo_cue_search_evaluation_v2");
const d = p.documents.find(d => d.id === "c-international");
const id = `cue_write_${createHash("sha256").update(JSON.stringify([p.author, `publish:${d.revisionId}`])).digest("hex")}`;
const bq = new BigQuery({ projectId: "cuckoocue" });
const first = (await bq.job(id, { location: "asia-northeast1" }).getMetadata())[0];
const retry = (await bq.job(`${id}_retry_1`, { location: "asia-northeast1" }).getMetadata())[0];
assert.match(first.status.errorResult.message, /Transaction is aborted due to concurrent update/);
assert.equal(retry.status.state, "DONE");
assert.equal(retry.status.errorResult, undefined);
const [counts] = await bq.query({ location: "asia-northeast1", query: `SELECT
  (SELECT COUNT(*) FROM \`cuckoocue.${p.dataset}.cuebook_revisions\` WHERE id = @revision) AS revisions,
  (SELECT COUNT(*) FROM \`cuckoocue.${p.dataset}.shelves\` s, UNNEST(s.items) i WHERE s.id = @shelf AND i.revision_id = @revision) AS placements`, params: { revision: d.revisionId, shelf: p.shelfId } });
assert.deepEqual(counts[0], { revisions: 1, placements: 1 });
await writeFile(`${root}/publication-retry.json`, `${JSON.stringify({ scope: "Real failed BQ transaction and same API operation resumed after retry fix, not a fault mock.", first, retry, counts, passed: true }, null, 2)}\n`);
console.log(JSON.stringify(counts));

const evaluated = JSON.parse(await readFile(`${root}/acceptance-full.json`, "utf8"));
const cold = { scope: "Replay three actual search SQL/parameters with BQ query cache disabled; no LLM rerun or synthetic vectors.", checks: [], passed: false };
for (const id of ["school-context", "moving-broad", "held-country-limit"]) {
  const check = evaluated.checks.find(c => c.id === id && c.user === "profiled");
  const execution = evaluated.searchExecutions.find(e => e.job_id === check.jobId);
  const [job] = await bq.createQueryJob({ query: execution.query.query, queryParameters: execution.query.queryParameters, parameterMode: "NAMED", useLegacySql: false, useQueryCache: false, maximumBytesBilled: "30000000", location: "asia-northeast1" });
  const [rows] = await job.getQueryResults();
  const [metadata] = await job.getMetadata();
  assert.equal(metadata.statistics.query.cacheHit, false);
  assert.deepEqual(rows.map(r => r.id), check.operations.flatMap(o => o.body.results).map(r => r.id));
  cold.checks.push({ id, jobId: job.id, statistics: metadata.statistics, rows });
}
cold.passed = true;
await writeFile(`${root}/uncached-search.json`, `${JSON.stringify(cold, null, 2)}\n`);
