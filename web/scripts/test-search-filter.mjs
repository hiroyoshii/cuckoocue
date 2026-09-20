import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { buildSearchText, tokenize } from "../src/lib/search-text.ts";
import * as plans from "../src/lib/search-plan.ts";
import { activeDomainLabels, managedDomains, resolveDomainLabel } from "../src/lib/domain-catalog.ts";

const plan = (overrides = {}) => ({ domain: "引っ越し", required_tasks: [], required_context: [], excluded_tasks: [], ...overrides });
test("managed domain catalog has 30 unique canonical values and aliases never become stored values", () => {
  assert.equal(managedDomains.length, 30);
  assert.equal(new Set(managedDomains.map(domain => domain.id)).size, 30);
  assert.equal(new Set(managedDomains.map(domain => domain.label_ja)).size, 30);
  assert.equal(activeDomainLabels().length, 30);
  assert.equal(resolveDomainLabel("引越し"), "引っ越し");
  assert.equal(resolveDomainLabel("未知の分類"), null);
});
test("purpose alternatives are OR; separate purposes are AND", () => {
  const filter = plans.compileSearchPlan(plan({ required_tasks: [["転校", "転入学"], ["猫"]] }));
  assert.equal(filter.params.searchConcept0, '"転校" OR "転入学"');
  assert.equal(filter.params.searchConcept1, '"猫"');
  assert.match(filter.predicate, / AND /);
  assert.match(filter.predicate, /SEARCH\(task_text/);
});
test("context is mandatory only when the plan explicitly says so", () => {
  const filter = plans.compileSearchPlan(plan({ required_tasks: [["転校"]] }));
  assert.ok(!JSON.stringify(filter).includes("東京"));
  const limited = plans.compileSearchPlan(plan({ required_context: [["日本", "日本国内"]] }));
  assert.match(limited.predicate, /SEARCH\(context_search_text/);
});
test("domain-only queries have no artificial text hit", () => {
  const filter = plans.compileSearchPlan(plan());
  assert.equal(filter.predicate, "TRUE");
  assert.equal(filter.hasTextConditions, false);
});
test("a repeated domain purpose cannot turn domain-only search into an empty result", () => {
  const filter = plans.compileSearchPlan(plan({ required_tasks: [["引っ越し"]] }));
  assert.equal(filter.predicate, "TRUE");
});
test("a domain term in an OR group cannot bypass the requested task purpose", () => {
  const filter = plans.compileSearchPlan(plan({ required_tasks: [["引っ越し", "転校"]] }));
  assert.equal(filter.params.searchConcept0, '"転校"');
  assert.notEqual(filter.predicate, "TRUE");
});
test("no domain cannot mean all domains", () => {
  assert.equal(plans.compileSearchPlan(plan({ domain: null })).domain, "");
});
test("explicit task exclusion is NOT a context exclusion", () => {
  const filter = plans.compileSearchPlan(plan({ excluded_tasks: [["猫"]] }));
  assert.match(filter.predicate, /^NOT /);
  assert.match(filter.predicate, /SEARCH\(task_text/);
});
test("SQL and SEARCH syntax in generated terms remains data", () => {
  const filter = plans.compileSearchPlan(plan({ required_tasks: [['OR', 'x") OR TRUE --', 'c++']] }));
  assert.ok(!filter.predicate.includes("OR TRUE"));
  assert.match(filter.params.searchConcept0, /^"or" OR /);
  assert.ok(JSON.parse(filter.params.searchAnalyzer0).patterns[0].includes("c\\+\\+"));
});
test("Latin dictionary terms use word boundaries; Japanese can occur in sentences", () => {
  const filter = plans.compileSearchPlan(plan({ required_tasks: [["LINE"], ["猫"]] }));
  assert.equal(JSON.parse(filter.params.searchAnalyzer0).patterns[0], "\\bline\\b");
  assert.equal(JSON.parse(filter.params.searchAnalyzer1).patterns[0], "猫");
});
test("empty and oversized groups are errors, not broad-search fallbacks", () => {
  assert.equal(plans.searchPlanSchema.safeParse(plan({ required_tasks: [[]] })).success, false);
  assert.equal(plans.searchPlanSchema.safeParse(plan({ required_tasks: [Array(9).fill("猫")] })).success, false);
});
test("one-character subjects and all document tasks are retained in the derived index", () => {
  assert.ok(tokenize("猫2匹と犬").includes("猫"));
  const text = buildSearchText({ title: "搬送", tasks: Array.from({ length: 100 }, (_, i) => ({ text: `item${i}` })).concat({ text: "猫" }) }, {
    domain: "引っ越し", context_text: "", task_groupings: [],
  });
  assert.ok(text.split(" ").includes("item99"));
  assert.ok(text.split(" ").includes("猫"));
});
async function interpreter(payload) {
  const source = await readFile(new URL("../src/lib/search-domain.ts", import.meta.url), "utf8");
  const requests = [];
  const logs = [];
  const dependencies = {
    zod: { z },
    "google-auth-library": { GoogleAuth: class { async request(options) { requests.push(options); return { data: payload }; } } },
    "./search-plan": plans,
    "./env": { cueEnv: { googleCloudLocation: () => "asia-northeast1", projectId: () => "test" } },
    "./resilience": { withRetry: operation => operation() },
  };
  const runtime = { exports: {}, process, console: { info: value => logs.push(value) }, require: name => dependencies[name] };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, runtime);
  runtime.exports.__requests = requests;
  runtime.exports.__logs = logs;
  return runtime.exports;
}
async function interpret(payload) { return (await interpreter(payload)).interpretSearchQuery("子どもの転校を伴う引っ越し", ["引っ越し", "旅行"]); }
const response = value => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
test("valid plans and genuine no-match results remain distinct", async () => {
  assert.equal((await interpret(response(plan()))).domain, "引っ越し");
  assert.equal((await interpret(response(plan({ domain: null })))).domain, null);
});
test("failed and malformed plans cannot become no-match or broad queries", async () => {
  for (const payload of [{}, response(plan({ domain: "" })), response(plan({ domain: "猫" })), response({ domain: "引っ越し" })]) {
    await assert.rejects(interpret(payload));
  }
});
test("profile selection can only retain original attributes, never invent or duplicate them", async () => {
  const api = await interpreter(response([1, 0]));
  assert.deepEqual(Array.from(await api.selectSearchProfileAttributes("検索", ["first", "second"], plan())), ["first", "second"]);
  const repeated = await interpreter(response([1, 1]));
  assert.deepEqual(Array.from(await repeated.selectSearchProfileAttributes("検索", ["first", "second"], plan())), ["second"]);
  for (const value of [[-1], [2], [0.5], ["0"], { attributes: [] }]) {
    const invalid = await interpreter(response(value));
    await assert.rejects(invalid.selectSearchProfileAttributes("検索", ["first", "second"], plan()));
  }
});
test("no profile and no domain skip profile LLM; failure is not a silent fallback", async () => {
  const api = await interpreter({});
  assert.equal((await api.selectSearchProfileAttributes("検索", [], plan())).length, 0);
  assert.equal((await api.selectSearchProfileAttributes("検索", ["first"], plan({ domain: null }))).length, 0);
  await assert.rejects(api.selectSearchProfileAttributes("検索", ["first"], plan()));
});
test("search LLM calls use the 128-token budgets and log native usage metadata", async () => {
  const usageMetadata = { promptTokenCount: 12, candidatesTokenCount: 8, thoughtsTokenCount: 4 };
  const interpretation = await interpreter({ ...response(plan()), usageMetadata });
  await interpretation.interpretSearchQuery("検索", ["引っ越し"]);
  assert.equal(interpretation.__requests[0].data.generationConfig.thinkingConfig.thinkingBudget, 128);
  assert.deepEqual(JSON.parse(interpretation.__logs[0]), {
    event: "search.model_usage",
    stage: "interpret",
    model: "gemini-2.5-flash",
    usage_metadata: usageMetadata,
  });

  const profile = await interpreter({ ...response([0]), usageMetadata });
  await profile.selectSearchProfileAttributes("検索", ["属性"], plan());
  assert.equal(profile.__requests[0].data.generationConfig.thinkingConfig.thinkingBudget, 128);
  assert.equal(JSON.parse(profile.__logs[0]).stage, "profile_selection");
});

test("search BigQuery jobs are capped at one GiB", async () => {
  const source = await readFile(new URL("../src/lib/bigquery.ts", import.meta.url), "utf8");
  const createdJobs = [];
  const directQueries = [];
  const job = { id: "job", getQueryResults: async () => [[], {}] };
  class BigQuery {
    async createQueryJob(options) { createdJobs.push(options); return [job]; }
    async query(options) { directQueries.push(options); return [[]]; }
  }
  const dependencies = {
    "@google-cloud/bigquery": { BigQuery },
    "./env": { cueEnv: { projectId: () => "test", dataset: () => "dataset", table: () => "table", googleCloudLocation: () => "asia-northeast1" } },
    "./bq-store": { bqTable: name => `\`test.dataset.${name}\``, digest: () => "owner" },
    "./task-list-embeddings": { buildSearchContextEmbeddingText: () => "query", buildTaskListContextEmbeddingText: () => "document", embedText: async () => [1] },
    "./task-list-enrichment": { enrichTaskList: async () => ({}) },
    "./resilience": { withRetry: operation => operation() },
    "./search-text": { buildSearchText: () => "" },
    "./search-plan": plans,
    "./domain-catalog": { activeDomainLabels: () => ["引っ越し"] },
  };
  const runtime = { exports: {}, Buffer, Date, Response, console: { info: () => {} }, require: name => dependencies[name] };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, runtime);

  await runtime.exports.searchTaskListEntries("検索", [], plan(), 20);
  await runtime.exports.listTaskListDomains();
  assert.equal(createdJobs[0].maximumBytesBilled, "1073741824");
  assert.equal(directQueries[0].maximumBytesBilled, "1073741824");
});

test("paid-input schemas reject oversized payloads and unmanaged domains before service calls", async () => {
  const schemaSource = await readFile(new URL("../src/lib/schema.ts", import.meta.url), "utf8");
  const schemaRuntime = {
    exports: {},
    require: name => ({
      zod: { z },
      "./domain-catalog": { isActiveDomainLabel: value => activeDomainLabels().includes(value) },
    })[name],
  };
  vm.runInNewContext(ts.transpileModule(schemaSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, schemaRuntime);
  const schemas = schemaRuntime.exports;
  const task = { text: "確認する" };

  assert.equal(schemas.searchTaskListsSchema.safeParse({ message: "あ".repeat(500) }).success, true);
  assert.equal(schemas.searchTaskListsSchema.safeParse({ message: "あ".repeat(501) }).success, false);
  assert.equal(schemas.searchTaskListsSchema.safeParse({ cursor: "a".repeat(4097) }).success, false);
  assert.equal(schemas.taskListDraftSchema.safeParse({ title: "上限", tasks: Array.from({ length: 201 }, () => task) }).success, false);
  assert.equal(schemas.memoryEventInputSchema.safeParse({ event_id: "event", kind: "android_task_added", text: "あ".repeat(1201), occurred_at: "2026-09-20T00:00:00Z" }).success, false);
  assert.equal(schemas.memoryEventInputSchema.safeParse({ event_id: "event", kind: "android_task_added", text: "確認", occurred_at: "not-a-date" }).success, false);
  assert.equal(schemas.saveTaskListSchema.safeParse({ title: "管理外", tasks: [task], operation_id: "00000000-0000-4000-8000-000000000000", domain: "自由分類" }).success, false);
});
