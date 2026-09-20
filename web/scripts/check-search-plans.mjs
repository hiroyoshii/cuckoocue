import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { GoogleAuth } from "google-auth-library";
import * as searchPlan from "../src/lib/search-plan.ts";
import { documents, queries } from "./search-evaluation-cases.mjs";
import { activeDomainLabels } from "../src/lib/domain-catalog.ts";
import { managedDomainBoundaryCases } from "../data/managed-domain-seeds.mjs";

const usageEvents = [];
function evaluate(source, dependencies) {
  const runtime = { exports: {}, process, setTimeout, clearTimeout, console: { info: value => {
    try {
      const event = JSON.parse(value);
      if (event.event === "search.model_usage") usageEvents.push(event);
    } catch {}
  } }, require: name => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, runtime);
  return runtime.exports;
}
const resilience = evaluate(await readFile("src/lib/resilience.ts", "utf8"), {});
const source = await readFile("src/lib/search-domain.ts", "utf8");
const api = evaluate(source, { zod: { z }, "google-auth-library": { GoogleAuth }, "./search-plan": searchPlan, "./resilience": resilience,
  "./env": { cueEnv: { projectId: () => "cuckoocue", googleCloudLocation: () => "asia-northeast1" } } });
const name = process.env.CUE_EVAL_NAME || "plans-v3";
assert.match(name, /^[a-z0-9-]+$/);
const selectedIds = process.env.CUE_PLAN_IDS?.split(",");
const managedBoundaryMode = process.env.CUE_MANAGED_DOMAIN_BOUNDARIES === "true";
const cases = managedBoundaryMode
  ? managedDomainBoundaryCases
  : selectedIds ? queries : queries.filter(query => query.split === "development");
const domains = managedBoundaryMode
  ? activeDomainLabels()
  : [...new Set(documents.map(document => document.domain))].sort();
const output = {
  scope: managedBoundaryMode
    ? "Real Vertex managed-domain boundary evaluation: 2 positive and 2 negative queries per active domain."
    : "Real Vertex query interpretation, fixed existing domain catalogue, development queries only. Not a search/relevance pass.",
  model: process.env.CUE_SEARCH_LLM_MODEL || "gemini-2.5-flash",
  thinkingBudget: Number(process.env.CUE_SEARCH_INTERPRET_THINKING_BUDGET ?? 128),
  source,
  checks: [],
};
for (const q of cases.filter(q => !selectedIds || selectedIds.includes(q.id))) {
  try {
    const startedAt = performance.now();
    const plan = await api.interpretSearchQuery(q.message, domains);
    const usage = usageEvents.at(-1)?.usage_metadata ?? null;
    const passed = q.kind === "positive" ? plan.domain === q.expected_domain : q.kind === "negative" ? plan.domain !== q.rejected_domain : true;
    output.checks.push({ id: q.id, message: q.message, expected_domain: q.expected_domain, rejected_domain: q.rejected_domain, plan, passed, elapsedMs: Math.round(performance.now() - startedAt), usage });
    console.log(q.id, JSON.stringify(plan));
  } catch (e) { output.checks.push({ id: q.id, error: e.message }); console.error(q.id, e.message); }
  await writeFile(`../docs/review-screenshots/web/search-relevance/${name}.json`, `${JSON.stringify(output, null, 2)}\n`);
}
output.passed = output.checks.length === cases.filter(q => !selectedIds || selectedIds.includes(q.id)).length && output.checks.every(check => check.passed !== false && !check.error);
await writeFile(`../docs/review-screenshots/web/search-relevance/${name}.json`, `${JSON.stringify(output, null, 2)}\n`);
if (!output.passed) process.exitCode = 1;
