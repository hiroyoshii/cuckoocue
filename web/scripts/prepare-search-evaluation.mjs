import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { BigQuery } from "@google-cloud/bigquery";
import { documents as regularDocuments } from "./search-evaluation-cases.mjs";
import { documents as challengeDocuments } from "./search-evaluation-challenges.mjs";

const documents = process.env.CUE_EVAL_CHALLENGES === "true" ? challengeDocuments : regularDocuments;

const dataset = process.env.CUE_BIGQUERY_DATASET;
assert.match(dataset || "", /^cuckoo_cue_search_evaluation(_v2)?$/);
const base = process.env.CUE_SCENARIO_BASE_URL || "http://127.0.0.1:3134";
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const output = "../docs/review-screenshots/web/search-relevance";
await mkdir(output, { recursive: true });
const preparationName = process.env.CUE_EVAL_PREPARATION || "preparation";
assert.match(preparationName, /^[a-z0-9-]+$/);
const path = `${output}/${preparationName}.json`;
const hash = createHash("sha256").update(JSON.stringify(documents)).digest("hex");
const previous = await readFile(path, "utf8").then(JSON.parse).catch(e => { if (e.code !== "ENOENT") throw e; return null; });
const evidence = previous ?? { dataset, base, corpusHash: hash, author: `search-evaluation-${randomUUID()}`, shelfId: null, documents: documents.map(d => ({ ...d, cuebookId: randomUUID(), revisionId: randomUUID(), operationId: randomUUID() })), operations: [], passed: false };
assert.equal(evidence.corpusHash, hash, "Do not silently change evaluation corpus");
assert.equal(evidence.dataset, dataset);
async function save() { await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`); }
async function api(path, method, input, status = 200) {
  const start = performance.now();
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-dev-user-id": evidence.author }, body: JSON.stringify(input), signal: AbortSignal.timeout(180000) });
  const body = await response.json();
  evidence.operations.push({ path, method, input, status: response.status, elapsedMs: Math.round(performance.now() - start), body });
  await save();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}
try {
  if (!evidence.shelfId) {
    const { shelf } = await api("/api/shelves", "POST", { operation_id: randomUUID(), title: "検索評価用の合成事例", context: "実ユーザーの経験ではない。検索品質の検証専用。" }, 201);
    evidence.shelfId = shelf.id;
    await save();
  }
  for (const document of evidence.documents) {
    if (document.published) continue;
    document.draft ??= { title: document.title, tasks: document.tasks.map(text => ({ id: randomUUID(), text, default_priority: null, relative_start_day: -7, relative_end_day: 0 })) };
    if (!document.generated) document.generated = (await api("/api/task-list-enrichment", "POST", document.draft)).enrichment;
    // Simulate the specified save-time human review of the coarse domain only.
    // Keep the actual generated context/groupings and log the unedited output.
    document.reviewed = { ...document.generated, domain: document.domain };
    await save();
    if (!document.saved) document.saved = (await api(`/api/cuebooks/${document.cuebookId}`, "PUT", {
      operation_id: document.operationId, expected_updated_at: null, content: { ...document.draft, enrichment: document.reviewed },
    })).cuebook;
    await save();
    await api("/api/cuebook-revisions", "POST", { revision_id: document.revisionId, source_cuebook_id: document.cuebookId,
      expected_source_updated_at: document.saved.updated_at, shelf_id: evidence.shelfId, title: document.title,
      tasks: document.saved.tasks.map(t => ({ title: t.text, default_priority: t.default_priority, relative_start_day: t.relative_start_day, relative_end_day: t.relative_end_day })),
    }, 201);
    document.published = true;
    await save();
    console.log(`Published ${document.id}: ${document.reviewed.context_text}`);
  }
  const bq = new BigQuery({ projectId: "cuckoocue" });
  const [rows] = await bq.query({ location: "asia-northeast1", query: `SELECT * FROM \`cuckoocue.${dataset}.cuebook_revisions\` WHERE owner_user_id = @owner`, params: { owner: evidence.author } });
  assert.equal(rows.length, documents.length);
  evidence.savedRows = rows;
  evidence.passed = true;
  delete evidence.error;
} catch (e) { evidence.error = e.stack; process.exitCode = 1; console.error(e); }
finally { await save(); }
