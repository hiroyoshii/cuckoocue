import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { GoogleAuth } from "google-auth-library";
import * as searchPlan from "../src/lib/search-plan.ts";
import { documents, queries } from "./search-evaluation-cases.mjs";

function evaluate(source, dependencies) {
  const runtime = { exports: {}, process, setTimeout, clearTimeout, require: name => {
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
const output = { scope: "Real Vertex query interpretation, fixed existing domain catalogue, development queries only. Not a search/relevance pass.", model: process.env.CUE_SEARCH_LLM_MODEL || "gemini-2.5-flash", source, checks: [] };
for (const q of queries.filter(q => q.split === "development" && (!selectedIds || selectedIds.includes(q.id)))) {
  try {
    const plan = await api.interpretSearchQuery(q.message, [...new Set(documents.map(d => d.domain))].sort());
    output.checks.push({ id: q.id, message: q.message, plan });
    console.log(q.id, JSON.stringify(plan));
  } catch (e) { output.checks.push({ id: q.id, error: e.message }); console.error(q.id, e.message); }
  await writeFile(`../docs/review-screenshots/web/search-relevance/${name}.json`, `${JSON.stringify(output, null, 2)}\n`);
}
