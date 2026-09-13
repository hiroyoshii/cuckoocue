import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile("src/lib/bq-store.ts", "utf8");
const runtime = { exports: {}, Response, setTimeout: fn => setTimeout(fn, 0), console,
  require: name => ({ "node:crypto": { createHash }, "@google-cloud/bigquery": { BigQuery: class {} },
    "./env": { cueEnv: { projectId: () => "test", googleCloudLocation: () => "asia-northeast1" } },
    "./resilience": { withRetry: fn => fn() } })[name] };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, runtime);

function transport(failure, committed = false) {
  const jobs = new Map();
  const submitted = [];
  return { submitted,
    async createQueryJob(input) { jobs.set(input.jobId, input); submitted.push(input.jobId); },
    job(id) { return {
      async getMetadata() { return [{ configuration: jobs.get(id), status: { state: "DONE", errorResult: id.includes("_retry_") ? undefined : failure } }]; },
      async getQueryResults() { if (!id.includes("_retry_")) throw new Error(failure.message); return [[{ id: "saved" }]]; },
    }; },
    async getJobs() { return [committed ? [{ metadata: { statistics: { query: { statementType: "COMMIT_TRANSACTION" } }, status: { state: "DONE" } } }] : []]; },
  };
}
const aborted = { reason: "invalidQuery", message: "Transaction is aborted due to concurrent update against table example.shelves" };
test("a rolled-back concurrent transaction retries under a stable next job ID", async () => {
  const t = transport(aborted);
  const result = await runtime.exports.bqWrite("owner", "publish:id", {}, "query", {}, undefined, t);
  assert.equal(result[0].id, "saved");
  assert.equal(t.submitted[1], `${t.submitted[0]}_retry_1`);
});
test("an optimistic content conflict is not replayed", async () => {
  const t = transport({ reason: "invalidQuery", message: "CUE_CONFLICT" });
  await assert.rejects(runtime.exports.bqWrite("owner", "publish:id", {}, "query", {}, undefined, t), /CUE_CONFLICT/);
  assert.equal(t.submitted.length, 1);
});
test("a committed child is recovered, never repeated after a parent error", async () => {
  const t = transport(aborted, true);
  const result = await runtime.exports.bqWrite("owner", "publish:id", {}, "query", {}, async () => [{ id: "recovered" }], t);
  assert.equal(result[0].id, "recovered");
  assert.equal(t.submitted.length, 1);
});
