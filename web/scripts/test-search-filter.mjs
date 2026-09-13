import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { buildSearchText, tokenize } from "../src/lib/search-text.ts";
import * as plans from "../src/lib/search-plan.ts";

const plan = (overrides = {}) => ({ domain: "引っ越し", required_tasks: [], required_context: [], excluded_tasks: [], ...overrides });
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
  const dependencies = {
    zod: { z },
    "google-auth-library": { GoogleAuth: class { async request() { return { data: payload }; } } },
    "./search-plan": plans,
    "./env": { cueEnv: { googleCloudLocation: () => "asia-northeast1", projectId: () => "test" } },
    "./resilience": { withRetry: operation => operation() },
  };
  const runtime = { exports: {}, process, require: name => dependencies[name] };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, runtime);
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
