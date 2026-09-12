import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BigQuery } from "@google-cloud/bigquery";

if (process.env.CUE_BIGQUERY_DATASET !== "cuckoo_cue_web_verification" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8086") throw new Error("Verification dataset and Firestore emulator are required");
const base = process.env.CUE_BASE_URL ?? "http://127.0.0.1:3111";
const owner = `schedule-${randomUUID()}`;
const output = "../docs/review-screenshots/web/schedule";
await mkdir(output, { recursive: true });
const evidence = { environment: { bigquery: "cuckoocue.cuckoo_cue_web_verification", firestore: "127.0.0.1:8086 emulator", authentication: "dev UID" }, owner, passed: false, requests: [] };
async function call(path, method = "GET", input, expected = 200, user = owner, headers = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-dev-user-id": user, ...headers }, ...(input ? { body: JSON.stringify(input) } : {}) });
  const body = await response.json();
  evidence.requests.push({ path, method, user, input, status: response.status, body, etag: response.headers.get("etag") });
  console.log(`${response.status} ${method} ${path}`);
  assert.equal(response.status, expected, JSON.stringify(body));
  return { body, etag: response.headers.get("etag") };
}
try {
  const id = randomUUID();
  const content = { title: "日程確認: 猫2匹と東京から名古屋へ", enrichment: null, tasks: [
    { id: randomUUID(), text: "猫と移動する便を予約する", default_priority: 0, relative_start_day: -14, relative_end_day: -7 },
    { id: randomUUID(), text: "新居に水とトイレを用意する", default_priority: null, relative_start_day: 0, relative_end_day: null },
  ] };
  const saved = (await call(`/api/cuebooks/${id}`, "PUT", { operation_id: randomUUID(), expected_updated_at: null, content })).body.cuebook;
  const input = { operation_id: randomUUID(), source: { type: "cuebook", id, expected_updated_at: saved.updated_at }, target_anchor_day: "2026-11-02", time_zone: "America/New_York", task_dates: [
    { task_id: content.tasks[1].id, available_from_day: null, due_day: null },
    { task_id: content.tasks[0].id, available_from_day: "2026-10-20", due_day: "2026-10-27" },
  ] };
  await call("/api/reuse", "POST", { ...input, task_dates: input.task_dates.slice(0, 1) }, 400);
  await call("/api/reuse", "POST", { ...input, task_dates: [input.task_dates[0], input.task_dates[0]] }, 400);
  await call("/api/reuse", "POST", { ...input, task_dates: [{ ...input.task_dates[0], task_id: randomUUID() }, input.task_dates[1]] }, 400);
  await call("/api/reuse", "POST", { ...input, task_dates: [input.task_dates[0], { ...input.task_dates[1], due_day: "2026-10-01" }] }, 400);
  await call("/api/reuse", "POST", { ...input, target_anchor_day: "2026-02-30" }, 400);
  await call("/api/reuse", "POST", { ...input, time_zone: "Pacific/Apia", target_anchor_day: "2011-12-30" }, 400);
  await call("/api/reuse", "POST", input, 404, `other-${owner}`);
  const result = (await call("/api/reuse", "POST", input)).body;
  const snapshot = await call(`/api/runs/${result.runId}/snapshot`);
  const run = snapshot.body.run;
  assert.equal(new Date(run.target_anchor_day).toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(new Date(run.tasks[0].available_from_at).toISOString(), "2026-10-20T04:00:00.000Z");
  assert.equal(new Date(run.tasks[0].due_at).toISOString(), "2026-10-27T04:00:00.000Z");
  assert.equal(run.tasks[0].source_task_id, content.tasks[0].id);
  assert.equal(run.tasks[0].user_priority, 0);
  assert.equal(run.tasks[1].due_at, null); assert.equal(run.tasks[1].available_from_at, null); assert.equal(run.tasks[1].user_priority, null);
  assert.deepEqual((await call(`/api/cuebooks/${id}`)).body.cuebook, saved);
  assert.equal((await call("/api/reuse", "POST", input)).body.runId, result.runId);
  await call("/api/reuse", "POST", { ...input, target_anchor_day: "2026-11-03" }, 409);
  const now = Date.now();
  await call(`/api/runs/${result.runId}`, "PUT", { ...run, updated_at: now, completed_anchor_at: now, tasks: run.tasks.map((task) => ({ ...task, completed_at: now, updated_at: now })) }, 200, owner, { "if-match": snapshot.etag });
  assert.equal((await call("/api/reuse", "POST", input)).body.runId, result.runId);
  const completed = (await call(`/api/runs/${result.runId}`)).body.run;
  assert.equal(completed.source_anchor_day, "2026-11-02");
  assert.equal(completed.tasks[0].relative_start_day, -13);
  assert.equal(completed.tasks[0].relative_end_day, -6);
  assert.equal(completed.tasks[1].relative_start_day, null);

  const previous = JSON.parse(await readFile("../docs/review-screenshots/web/reuse-lifecycle/api-evidence.json", "utf8"));
  const publication = previous.requests.find((request) => request.path === "/api/cuebook-revisions" && request.status === 201).body;
  const revision = publication.revision;
  const shelfBefore = (await call(`/api/shelves/${publication.shelf.id}`)).body;
  const publicInput = { ...input, operation_id: randomUUID(), source: { type: "revision", id: revision.id }, task_dates: revision.tasks.map((task, index) => ({ task_id: task.id, available_from_day: index === 0 ? "2026-10-21" : null, due_day: index === 0 ? "2026-10-28" : null })) };
  const borrowedRunId = (await call("/api/reuse", "POST", publicInput)).body.runId;
  const borrowedRun = (await call(`/api/runs/${borrowedRunId}/snapshot`)).body.run;
  const borrowed = (await call(`/api/cuebooks/${borrowedRun.source_cuebook_id}`)).body.cuebook;
  assert.equal(borrowedRun.tasks[0].source_task_id, borrowed.tasks[0].id);
  assert.notEqual(borrowedRun.tasks[0].source_task_id, revision.tasks[0].id);
  assert.equal(new Date(borrowedRun.tasks[0].due_at).toISOString(), "2026-10-28T04:00:00.000Z");
  assert.equal(borrowed.tasks[0].relative_end_day, revision.tasks[0].relative_end_day);
  assert.deepEqual((await call(`/api/shelves/${publication.shelf.id}`)).body, shelfBefore);
  const [rows] = await new BigQuery({ projectId: "cuckoocue" }).query({ location: "asia-northeast1", query: "SELECT id, tasks FROM `cuckoocue.cuckoo_cue_web_verification.cuebooks` WHERE owner_user_id = @owner", params: { owner } });
  evidence.storedCuebooks = rows;
  assert.equal(rows.length, 2);
  evidence.passed = true;
  console.log(`Passed ${evidence.requests.length} API operations.`);
} finally { await writeFile(`${output}/api-evidence.json`, JSON.stringify(evidence, null, 2)); }
