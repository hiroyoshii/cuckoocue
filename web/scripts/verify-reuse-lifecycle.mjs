import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { BigQuery } from "@google-cloud/bigquery";

if (process.env.CUE_BIGQUERY_DATASET !== "cuckoo_cue_web_verification" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8086") throw new Error("Verification dataset and Firestore emulator are required");
const base = "http://127.0.0.1:3111";
const owner = `lifecycle-${randomUUID()}`;
const other = `other-${randomUUID()}`;
const evidence = { environment: { bigquery: "cuckoocue.cuckoo_cue_web_verification", vertex: "real asia-northeast1", firestore: "127.0.0.1:8086 emulator", authentication: "dev UID" }, owner, other, passed: false, requests: [] };
const etags = new Map();
const output = "../docs/review-screenshots/web/reuse-lifecycle";
await mkdir(output, { recursive: true });
async function call(path, method = "GET", input, user = owner, expected = 200) {
  const key = `${user}:${path.replace(/\/snapshot$/, "")}`;
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(user ? { "x-dev-user-id": user } : {}), ...(method === "PUT" && path.startsWith("/api/runs/") && etags.has(key) ? { "if-match": etags.get(key) } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
  if (response.headers.has("etag")) etags.set(key, response.headers.get("etag"));
  const body = await response.json();
  evidence.requests.push({ user, path, method, input, status: response.status, body });
  console.log(`${response.status} ${method} ${path}`);
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
try {
  const id = randomUUID();
  const content = { title: "猫2匹と東京から名古屋へ引っ越す", tasks: [
    { id: randomUUID(), text: "猫を連れて移動する便を予約する", default_priority: 0, relative_start_day: -14, relative_end_day: -7 },
    { id: randomUUID(), text: "新居で猫の水とトイレを用意する", default_priority: null, relative_start_day: 0, relative_end_day: null },
  ], enrichment: null };
  const save = { operation_id: randomUUID(), expected_updated_at: null, content };
  const firstRequest = call(`/api/cuebooks/${id}`, "PUT", save);
  const repeated = await call(`/api/cuebooks/${id}`, "PUT", save);
  const first = await firstRequest;
  assert.equal(repeated.cuebook.updated_at, first.cuebook.updated_at);
  await call(`/api/cuebooks/${id}`, "GET", undefined, other, 404);
  assert.equal((await call("/api/cuebooks", "GET", undefined, other)).cuebooks.length, 0);
  await call(`/api/cuebooks/${id}`, "PUT", { ...save, content: { ...content, title: "異なる再送" } }, owner, 409);
  const enrichment = await call("/api/task-list-enrichment", "POST", { title: content.title, tasks: content.tasks });
  content.enrichment = enrichment.enrichment;
  const update = { operation_id: randomUUID(), expected_updated_at: first.cuebook.updated_at, content };
  const second = await call(`/api/cuebooks/${id}`, "PUT", update);
  assert.equal(second.cuebook.tasks[1].relative_end_day, null);
  await call(`/api/cuebooks/${id}`, "PUT", { ...update, operation_id: randomUUID(), content: { ...content, title: "古い版による変更" } }, owner, 409);
  const shelfInput = { operation_id: randomUUID(), title: "猫と暮らす引っ越し", context: "猫2匹と国内で引っ越す" };
  const shelf = (await call("/api/shelves", "POST", shelfInput, owner, 201)).shelf;
  assert.equal((await call("/api/shelves", "POST", shelfInput, owner, 201)).shelf.id, shelf.id);
  assert.ok((await call("/api/memberships")).shelf_ids.includes(shelf.id));
  const revisionId = randomUUID();
  const publication = { revision_id: revisionId, source_cuebook_id: id, expected_source_updated_at: second.cuebook.updated_at, shelf_id: shelf.id, title: content.title,
    tasks: content.tasks.map(({ text, ...task }) => ({ ...task, title: text })) };
  const published = await call("/api/cuebook-revisions", "POST", publication, owner, 201);
  await call("/api/cuebook-revisions", "POST", publication, owner, 201);
  await call("/api/cuebook-revisions", "POST", publication, other, 404);
  assert.equal((await call(`/api/shelves/${shelf.id}`)).shelf.items.length, 1);
  const reuse = { operation_id: randomUUID(), source: { type: "revision", id: revisionId }, target_anchor_day: "2026-11-02", time_zone: "America/New_York" };
  const { runId } = await call("/api/reuse", "POST", reuse, other);
  assert.equal((await call("/api/reuse", "POST", reuse, other)).runId, runId);
  const run = (await call(`/api/runs/${runId}/snapshot`, "GET", undefined, other)).run;
  assert.equal(run.source_cuebook_id, reuse.operation_id);
  assert.equal(run.tasks[1].due_at, null);
  assert.equal(run.tasks[1].user_priority, null);
  assert.equal(new Date(run.target_anchor_day).toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(new Date(run.tasks[0].due_at).toISOString(), "2026-10-26T04:00:00.000Z");
  await call(`/api/runs/${runId}/snapshot`, "GET", undefined, owner, 404);
  await call("/api/reuse", "POST", { ...reuse, target_anchor_day: "2026-11-03" }, other, 409);
  const now = Date.now();
  const complete = { ...run, updated_at: now, completed_anchor_at: now, tasks: run.tasks.map((task) => ({ ...task, completed_at: now, updated_at: now })) };
  await call(`/api/runs/${runId}`, "PUT", complete, other);
  assert.equal((await call("/api/reuse", "POST", reuse, other)).runId, runId);
  const draft = (await call(`/api/runs/${runId}`, "GET", undefined, other)).run;
  assert.equal(draft.source_anchor_day, "2026-11-02");
  assert.equal(draft.tasks[0].relative_end_day, -7);
  assert.equal((await call("/api/runs", "GET", undefined, other)).runs[0].id, runId);
  assert.equal((await call("/api/runs")).runs.length, 0);
  const fork = { operation_id: randomUUID(), expected_updated_at: published.shelf.updated_at };
  const forked = (await call(`/api/shelves/${shelf.id}/fork`, "POST", fork, other, 201)).shelf;
  assert.equal(forked.items[0].revision_id, revisionId);
  assert.equal((await call(`/api/shelves/${shelf.id}/fork`, "POST", fork, other, 201)).shelf.id, forked.id);
  await call(`/api/memberships/${shelf.id}`, "PUT", { joined: true }, other);
  await call(`/api/memberships/${shelf.id}`, "PUT", { joined: false }, other);
  assert.ok(!(await call("/api/memberships", "GET", undefined, other)).shelf_ids.includes(shelf.id));
  await call(`/api/shelves/${shelf.id}`, "PATCH", { operation_id: randomUUID(), expected_updated_at: published.shelf.updated_at, title: "不正な更新" }, other, 404);
  await call(`/api/cuebooks/${id}`, "PUT", { operation_id: randomUUID(), expected_updated_at: second.cuebook.updated_at, content: { ...content, title: "自分だけの次回の引っ越し" } });
  assert.equal((await call(`/api/shelves/${shelf.id}`)).shelf.items[0].revision.title, content.title);
  await call("/api/cuebook-revisions", "POST", publication, owner, 201);
  const search = await call("/api/search", "POST", { message: "猫2匹と東京から名古屋へ引っ越す", page_size: 1 });
  const allResults = [...search.results];
  let cursor = search.nextCursor;
  if (cursor) await call("/api/search", "POST", { cursor, page_size: 20 }, other, 400);
  while (cursor) {
    const page = await call("/api/search", "POST", { cursor, page_size: 20 });
    allResults.push(...page.results); cursor = page.nextCursor;
  }
  const found = allResults.find((result) => result.id === revisionId);
  assert.ok(found);
  assert.ok(found.shelves.some((item) => item.id === shelf.id));
  assert.ok(!("context_embedding" in search.results[0]));
  const client = new BigQuery({ projectId: "cuckoocue" });
  const [rows] = await client.query({ location: "asia-northeast1", query: "SELECT id, title, tasks, origin_revision_id FROM `cuckoocue.cuckoo_cue_web_verification.cuebooks` WHERE owner_user_id IN (@owner, @other)", params: { owner, other } });
  evidence.storedCuebooks = rows;
  assert.equal(rows.length, 2);
  evidence.passed = true;
  console.log("Lifecycle verified using real BigQuery / Vertex AI and Firestore emulator.");
} finally {
  await writeFile(`${output}/api-evidence.json`, JSON.stringify(evidence, null, 2));
}
