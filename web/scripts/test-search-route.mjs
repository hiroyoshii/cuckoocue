import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { searchTaskListsSchema } from "../src/lib/schema.ts";

const source = await readFile("src/app/api/search/route.ts", "utf8");
function route(options = {}) {
  const calls = [];
  const plan = { domain: "引っ越し", required_tasks: [["転校"]], required_context: [], excluded_tasks: [] };
  const dependencies = {
    "next/server": { NextResponse: Response },
    "@/lib/auth": { requireRequestUser: async () => ({ id: "user", isAnonymous: false }) },
    "@/lib/schema": { searchTaskListsSchema },
    "@/lib/memory-bank": { retrieveUserProfileAttributes: async () => ["猫2匹", "オンライン申請"] },
    "@/lib/search-domain": {
      interpretSearchQuery: async (...args) => { calls.push({ kind: "interpret", args }); if (options.planError) throw options.planError; return plan; },
      selectSearchProfileAttributes: async () => { if (options.profileError) throw options.profileError; return ["オンライン申請"]; },
    },
    "@/lib/bigquery": {
      listTaskListDomains: async () => ["引っ越し"],
      searchTaskListEntries: async (...args) => { calls.push({ kind: "search", args }); return { results: [], nextCursor: null }; },
    },
  };
  const runtime = { exports: {}, Response, console: { error: () => {} }, require: name => dependencies[name] };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, runtime);
  return { calls, post: body => runtime.exports.POST(new Request("http://localhost/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })) };
}
test("invalid user input is 400 before any query interpretation", async () => {
  const r = route();
  assert.equal((await r.post({ page_size: 0 })).status, 400);
  assert.equal(r.calls.length, 0);
});
test("invalid model output and failed profile selection are 503, not empty success or user error", async () => {
  const badOutput = z.object({ domain: z.string() }).safeParse({}).error;
  for (const options of [{ planError: badOutput }, { profileError: new Error("upstream timeout") }]) {
    const r = route(options);
    const response = await r.post({ message: "転校を伴う引っ越し" });
    assert.equal(response.status, 503);
    assert.equal(r.calls.some(c => c.kind === "search"), false);
    assert.equal((await response.json()).results, undefined);
  }
});
test("profile cannot enter query interpretation; only selected original attributes reach ranking", async () => {
  const r = route();
  const response = await r.post({ message: "転校を伴う引っ越し" });
  assert.equal(response.status, 200);
  assert.deepEqual(r.calls.find(c => c.kind === "interpret").args, ["転校を伴う引っ越し", ["引っ越し"]]);
  const [message, attributes, plan] = r.calls.find(c => c.kind === "search").args;
  assert.equal(message, "転校を伴う引っ越し");
  assert.deepEqual(attributes, ["オンライン申請"]);
  assert.deepEqual(plan.required_tasks, [["転校"]]);
});
