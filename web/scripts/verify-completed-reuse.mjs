import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8086" || !["demo-cuckoocue", "cuckoocue"].includes(process.env.GOOGLE_CLOUD_PROJECT)) {
  throw new Error("This check must use the isolated demo-cuckoocue Firestore emulator on 8086, with the test API on 3111.");
}
const owner = `reuse-check-${randomUUID()}`;
const records = [];
const etags = new Map();
async function api(method, endpoint, body, user = owner, expectedEtag) {
  const response = await fetch(`http://127.0.0.1:3111${endpoint}`, {
    method, headers: { "content-type": "application/json", ...(user ? { "x-dev-user-id": user } : {}), ...(method === "PUT" && (expectedEtag || etags.has(`${user}:${endpoint}`)) ? { "if-match": expectedEtag || etags.get(`${user}:${endpoint}`) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (response.headers.has("etag")) etags.set(`${user}:${endpoint.replace(/\/snapshot$/, "")}`, response.headers.get("etag"));
  records.push({ method, endpoint, user, request: body ?? null, status: response.status, response: result });
  return { status: response.status, body: result };
}
const anchor = Date.parse("2026-10-01T00:00:00+09:00");
const day = 86_400_000;
const source = {
  id: "completed", title: "東京から名古屋への引っ越し", time_zone: "Asia/Tokyo", sort_order: 7,
  created_at: anchor - 35 * day, updated_at: anchor + 2 * day,
  archived_at: anchor + 2 * day, target_anchor_day: anchor, completed_anchor_at: anchor + 2 * day,
  tasks: ["荷造りをする", "引っ越し業者を決める", "鍵を返す"].map((title, i) => ({
    id: `task-${i}`, title, sort_order: [1, 0, 2][i], user_priority: i,
    available_from_at: anchor - 7 * day, due_at: anchor - day,
    completed_at: anchor + i * day, created_at: anchor - 30 * day, updated_at: anchor + i * day,
  })),
};

assert.equal((await api("POST", "/api/runs/completed/reuse", {}, null)).status, 401);
assert.equal((await api("GET", "/api/runs/completed/snapshot", undefined, null)).status, 401);
assert.equal((await api("PUT", "/api/runs/completed", source)).status, 200);
const emulatorProof = await fetch(`http://127.0.0.1:8086/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT}/databases/(default)/documents/users/${owner}/runs/completed`);
assert.equal(emulatorProof.status, 200, "The source must exist in the emulator, not a production database");
const draft = await api("GET", "/api/runs/completed");
assert.equal(draft.body.run.source_anchor_day, "2026-10-01");
assert.deepEqual(draft.body.run.task_ids, ["task-1", "task-0", "task-2"]);
assert.equal(draft.body.run.tasks[0].relative_end_day, -1);
const request = { operation_id: randomUUID(), task_ids: ["task-0", "task-1"] };
assert.equal((await api("POST", "/api/runs/completed/reuse", request, `${owner}-other`)).status, 404);
assert.equal((await api("POST", "/api/runs/completed/reuse", { operation_id: randomUUID(), task_ids: ["missing"] })).status, 409);
assert.equal((await api("POST", "/api/runs/completed/reuse", { operation_id: randomUUID(), task_ids: ["task-0", "task-0"] })).status, 400);
// Concurrent identical submissions exercise Firestore transaction retries.
const firstPromise = api("POST", "/api/runs/completed/reuse", request);
const second = await api("POST", "/api/runs/completed/reuse", request);
const first = await firstPromise;
assert.equal(first.status, 200); assert.equal(second.status, 200);
assert.equal(first.body.runId, second.body.runId);
const id = first.body.runId;
const saved = await api("GET", `/api/runs/${id}/snapshot`);
assert.equal(saved.status, 200);
assert.deepEqual(saved.body.run.tasks.map((task) => task.title), ["引っ越し業者を決める", "荷造りをする"]);
assert.equal(saved.body.run.completed_anchor_at, null);
assert.equal(saved.body.run.target_anchor_day, null);
for (const task of saved.body.run.tasks) {
  assert.equal(task.user_priority, null); assert.equal(task.due_at, null);
  assert.equal(task.available_from_at, null); assert.equal(task.completed_at, null);
}
assert.equal((await api("GET", `/api/runs/${id}/snapshot`, undefined, `${owner}-other`)).status, 404);
assert.equal((await api("POST", "/api/runs/completed/reuse", { ...request, task_ids: ["task-2"] })).status, 409);
const changed = structuredClone(saved.body.run);
const staleTag = etags.get(`${owner}:/api/runs/${id}`);
changed.tasks[0].completed_at = anchor + 10 * day;
changed.tasks[0].user_priority = 0;
assert.equal((await api("PUT", `/api/runs/${id}`, changed)).status, 200);
assert.equal((await api("POST", "/api/runs/completed/reuse", request)).status, 200);
assert.equal((await api("PUT", `/api/runs/${id}`, { ...changed, title: "古い端末による上書き" }, owner, staleTag)).status, 409);
const afterDeletion = { ...changed, tasks: changed.tasks.slice(1) };
assert.equal((await api("PUT", `/api/runs/${id}`, afterDeletion)).status, 200);
assert.equal((await api("POST", "/api/runs/completed/reuse", request)).status, 200);
assert.deepEqual((await api("GET", `/api/runs/${id}/snapshot`)).body.run, afterDeletion);
assert.deepEqual((await api("GET", "/api/runs/completed/snapshot")).body.run, source);
const incomplete = { ...source, id: "incomplete", completed_anchor_at: null };
assert.equal((await api("PUT", "/api/runs/incomplete", incomplete)).status, 200);
assert.equal((await api("POST", "/api/runs/incomplete/reuse", { ...request, operation_id: randomUUID() })).status, 409);
const noAnchor = { ...source, id: "without-anchor", target_anchor_day: null };
assert.equal((await api("PUT", "/api/runs/without-anchor", noAnchor)).status, 200);
const missingDates = (await api("GET", "/api/runs/without-anchor")).body.run;
assert.equal(missingDates.source_anchor_day, null);
assert.equal(missingDates.tasks[0].relative_end_day, null);
const directory = path.resolve(process.env.CUE_CAPTURE_DIR ?? "../docs/review-screenshots/web/editor-inline");
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "firestore-api-verification.json"), JSON.stringify({ environment: "local Firestore emulator + Next production build; dev authentication", passed: true, records }, null, 2));
console.log(`Passed ${records.length} API requests. Full requests/responses: ${directory}/firestore-api-verification.json`);
