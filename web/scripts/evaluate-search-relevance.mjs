import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { BigQuery } from "@google-cloud/bigquery";
import { queries as regularQueries } from "./search-evaluation-cases.mjs";
import { queries as challengeQueries } from "./search-evaluation-challenges.mjs";

const includeChallenges = process.env.CUE_EVAL_INCLUDE_CHALLENGES === "true";
const currentOracle = process.env.CUE_EVAL_CURRENT_ORACLE === "true";
const oracleNotes = currentOracle ? [
  "Correct the original top-result oracle for region-unspecified school-lexical, held-school-cat-background and held-school-exclusion: Japanese wording does not establish Japan as the current locale. Any previously allowed school procedure can rank first; a London profile may favor UK. Required/allowed relevance labels are unchanged.",
  ...(includeChallenges ? ["Four additional predeclared documents now coexist with the original corpus. Broad moving search must include their moving entries. International school transfer remains an acceptable regional variant except in explicitly domestic-only searches."] : []),
] : [];
const queries = (process.env.CUE_EVAL_CHALLENGES === "true" ? challengeQueries : regularQueries).map(q => {
  let next = { ...q };
  if (includeChallenges && process.env.CUE_EVAL_CHALLENGES !== "true") {
    if (q.id === "moving-broad") next = { ...next, required: [...q.required, "c-address-moving", "c-dog", "c-international"], allowed: [...q.allowed, "c-address-moving", "c-dog", "c-international"], top: [...q.top, "c-address-moving", "c-dog", "c-international"] };
    else if (["school-context", "school-other-region", "school-generic", "school-lexical", "held-school", "held-school-cat-background", "held-school-exclusion"].includes(q.id)) next.allowed = [...q.allowed, "c-international"];
  }
  if ((includeChallenges || process.env.CUE_EVAL_CHALLENGES === "true") && q.id === "school-generic") next = { ...next, required: [...q.required, "c-international"], top: next.allowed };
  if (currentOracle && ["school-lexical", "held-school-cat-background", "held-school-exclusion"].includes(q.id)) next.top = next.allowed;
  return next;
});

const base = process.env.CUE_SCENARIO_BASE_URL || "http://127.0.0.1:3134";
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(process.env.CUE_BIGQUERY_DATASET || "", /^cuckoo_cue_search_evaluation(_v2)?$/);
const name = process.env.CUE_EVAL_NAME || "evaluation";
assert.match(name, /^[a-z0-9-]+$/);
const output = "../docs/review-screenshots/web/search-relevance";
const preparationName = process.env.CUE_EVAL_PREPARATION || "preparation";
assert.match(preparationName, /^[a-z0-9-]+$/);
const prepared = JSON.parse(await readFile(`${output}/${preparationName}.json`, "utf8"));
assert.equal(prepared.dataset, process.env.CUE_BIGQUERY_DATASET);
assert.equal(prepared.passed, true);
const users = JSON.parse(await readFile("../docs/review-screenshots/web/residual-fixes/data-evidence.json", "utf8"));
const lookup = new Map(prepared.documents.map(d => [d.revisionId, d.id]));
if (process.env.CUE_EVAL_CHALLENGES === "true" || includeChallenges) {
  const challengeData = JSON.parse(await readFile(`${output}/preparation-challenges.json`, "utf8"));
  assert.equal(challengeData.passed, true);
  for (const d of challengeData.documents) lookup.set(d.revisionId, d.id);
}
const selected = queries.filter(q => !process.env.CUE_EVAL_SPLIT || q.split === process.env.CUE_EVAL_SPLIT);
const evidence = { name, base, scope: "Real search API, Vertex routing/embedding, Memory Bank retrieval and isolated BQ corpus. Synthetic cases with predeclared relevance labels; dev UID authentication. No automatic judge or LLM-generated expected results.", corpusHash: prepared.corpusHash,
  queryHash: createHash("sha256").update(JSON.stringify(queries)).digest("hex"), oracleNotes, queries: selected, checks: [], passed: false };
const path = `${output}/${name}.json`;
const serverLog = process.env.CUE_EVAL_SERVER_LOG;
const logStart = serverLog ? (await readFile(serverLog, "utf8")).length : 0;
async function save() { await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`); }
for (const q of selected) {
  for (const user of ["neutral", "profiled"]) {
    const check = { id: q.id, split: q.split, message: q.message, user, operations: [] };
    evidence.checks.push(check);
    try {
      let input = { message: q.message, page_size: 3 };
      const all = [];
      const start = performance.now();
      do {
        const requestStart = performance.now();
        const response = await fetch(`${base}/api/search`, { method: "POST", headers: { "x-dev-user-id": users[user], "content-type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(120000) });
        const body = await response.json();
        check.operations.push({ input, status: response.status, elapsedMs: Math.round(performance.now() - requestStart), body });
        assert.equal(response.status, 200, JSON.stringify(body));
        if (input.message) { check.domain = body.searchDomain; check.profile = body.userProfileAttributes; }
        all.push(...body.results);
        input = body.nextCursor ? { cursor: body.nextCursor, page_size: 3 } : null;
      } while (input);
      check.elapsedMs = Math.round(performance.now() - start);
      check.ranking = all.map(r => ({ id: lookup.get(r.id) ?? r.id, score: r.context_score, title: r.title }));
      const ids = check.ranking.map(r => r.id);
      check.missing = q.required.filter(id => !ids.includes(id));
      check.unwanted = ids.filter(id => !q.allowed.includes(id));
      check.recall = q.required.length ? (q.required.length - check.missing.length) / q.required.length : null;
      check.precision = ids.length ? (ids.length - check.unwanted.length) / ids.length : null;
      check.topPass = q.top.length ? q.top.includes(ids[0]) : ids.every(id => q.allowed.includes(id));
      check.domainPass = q.domain === check.domain;
      check.noDuplicates = new Set(ids).size === ids.length;
      check.passed = !check.missing.length && !check.unwanted.length && check.topPass && check.domainPass && check.noDuplicates;
      console.log(JSON.stringify({ id: q.id, user, domain: check.domain, results: ids, missing: check.missing, unwanted: check.unwanted, topPass: check.topPass }));
    } catch (e) { check.error = e.stack; check.passed = false; console.error(q.id, user, e.message); }
    await save();
  }
}
const count = condition => evidence.checks.filter(condition).length;
evidence.profileSetChanges = selected.filter(q => {
  const pair = evidence.checks.filter(c => c.id === q.id);
  return JSON.stringify(pair[0].ranking?.map(r => r.id).sort()) !== JSON.stringify(pair[1].ranking?.map(r => r.id).sort());
}).map(q => q.id);
evidence.summary = { total: evidence.checks.length, passed: count(c => c.passed), errors: count(c => c.error), recallPass: count(c => c.missing?.length === 0), precisionPass: count(c => c.unwanted?.length === 0), topPass: count(c => c.topPass), domainPass: count(c => c.domainPass), profileSetChanges: evidence.profileSetChanges.length };
evidence.passed = evidence.summary.passed === evidence.summary.total && !evidence.profileSetChanges.length;
if (serverLog) {
  evidence.searchExecutions = (await readFile(serverLog, "utf8")).slice(logStart).split("\n").flatMap(line => {
    try { const event = JSON.parse(line); return event.event === "search.executed" ? [event] : []; }
    catch { return []; }
  });
  const bq = new BigQuery({ projectId: "cuckoocue" });
  for (const execution of evidence.searchExecutions) {
    const [metadata] = await bq.job(execution.job_id, { location: "asia-northeast1" }).getMetadata();
    execution.query = metadata.configuration.query;
    execution.labels = metadata.configuration.labels;
    execution.statistics = metadata.statistics;
  }
  const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  for (const check of evidence.checks) {
    const execution = evidence.searchExecutions.find(e => e.query_hash === digest(check.message) && e.labels?.cue_owner === digest(users[check.user]).slice(0, 63));
    if (!execution) continue;
    check.queryPlan = execution.plan;
    check.jobId = execution.job_id;
    check.rankingProfile = check.profile.filter(attribute => execution.context_attribute_hashes?.includes(digest(attribute)));
  }
}
await save();
console.log(JSON.stringify(evidence.summary));
if (!evidence.passed) process.exitCode = 1;
