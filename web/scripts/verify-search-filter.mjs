import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { BigQuery } from "@google-cloud/bigquery";
import * as searchText from "../src/lib/search-text.ts";
import * as searchPlan from "../src/lib/search-plan.ts";

const output = "../docs/review-screenshots/web/search-filter-probe";
// Preserve the before result, which used the broken tokenizer.
const before = JSON.parse(await readFile(`${output}/evidence.json`, "utf8"));
const candidates = before.candidates.map(c => ({
  ...c,
  tasks: c.id === "E" ? ["在学証明書と教科書給与証明書を受け取る", "新しい学校へ書類を提出する"] : c.tasks,
  task_groupings: c.id === "E" ? [{ label: "転校手続き", task_offsets: [0, 1] }] : c.id === "C" ? [{ label: "転校手続き", task_offsets: [99] }] : [],
  search_text: searchText.buildSearchText({ title: c.title, tasks: c.tasks.map(text => ({ text })) }, { ...c, task_groupings: [] }),
  // Deliberately favor the wrong candidate C when a profile is supplied.
  context_embedding: c.id === "C" ? [0, 1] : c.id === "B" ? [0.6, 0.8] : [1, 0],
}));
const source = await readFile("src/lib/bigquery.ts", "utf8");
function evaluate(source, dependencies) {
  const runtime = { exports: {}, Buffer, Response, console: { info: () => {} }, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, runtime);
  return runtime.exports;
}
const realBq = new BigQuery({ projectId: "cuckoocue" });
let current;
const evidence = {
  scope: "Production searchTaskListEntries and SQL on real BigQuery; nine inline candidates, no persistent writes. Fixed domains and synthetic embedding vectors isolate filtering, not LLM/Memory Bank accuracy.",
  source_sha256: createHash("sha256").update(source).digest("hex"),
  candidates, checks: [], passed: false,
};
const embeddings = evaluate(await readFile("src/lib/task-list-embeddings.ts", "utf8"), { "google-auth-library": {}, "./env": {}, "./resilience": {} });
const api = evaluate(source, {
  "@google-cloud/bigquery": { BigQuery: class {
    async createQueryJob(options) {
      // Replace only table sources; execute production WHERE/SEARCH/ranking.
      const query = options.query.replace("`probe.cuebook_revisions`", `(
        SELECT JSON_VALUE(c, '$.id') AS id, 'probe' AS owner_user_id,
          JSON_VALUE(c, '$.title') AS title, JSON_VALUE(c, '$.domain') AS domain,
          JSON_VALUE(c, '$.context_text') AS context_text,
          JSON_VALUE(c, '$.search_text') AS search_text,
          ARRAY(SELECT AS STRUCT JSON_VALUE(t) AS text FROM UNNEST(JSON_QUERY_ARRAY(c, '$.tasks')) t) AS tasks,
          ARRAY(SELECT AS STRUCT JSON_VALUE(g, '$.label') AS label,
            ARRAY(SELECT CAST(JSON_VALUE(o) AS INT64) FROM UNNEST(JSON_QUERY_ARRAY(g, '$.task_offsets')) o) AS task_offsets
            FROM UNNEST(JSON_QUERY_ARRAY(c, '$.task_groupings')) g) AS task_groupings,
          ARRAY(SELECT CAST(JSON_VALUE(v) AS FLOAT64) FROM UNNEST(JSON_QUERY_ARRAY(c, '$.context_embedding')) v) AS context_embedding,
          TIMESTAMP('2026-09-13') AS created_at, CAST(NULL AS TIMESTAMP) AS withdrawn_at
        FROM UNNEST(JSON_QUERY_ARRAY(@candidates)) c
      )`).replace("`probe.shelves`", "(SELECT 'unused' AS id, 'unused' AS title, ARRAY<STRUCT<revision_id STRING>>[] AS items FROM UNNEST(ARRAY<INT64>[]))");
      current.production_sql = options.query;
      current.executed_sql = query;
      current.params = options.params;
      const [job] = await realBq.createQueryJob({ ...options, query,
        maximumBytesBilled: "10000000", params: { ...options.params, candidates: JSON.stringify(candidates) } });
      current.job_id = job.id;
      return [job];
    }
    job(...args) { return realBq.job(...args); }
  } },
  "./env": { cueEnv: { projectId: () => "cuckoocue", googleCloudLocation: () => "asia-northeast1" } },
  "./bq-store": { bqTable: name => `\`probe.${name}\``, digest: value => createHash("sha256").update(value).digest("hex") },
  "./task-list-embeddings": { ...embeddings, embedText: async text => {
    current.embedding_input = text;
    return current.profile.length ? [0, 1] : [1, 0];
  } },
  "./task-list-enrichment": {}, "./search-text": searchText, "./search-plan": searchPlan,
  "./resilience": { withRetry: operation => operation() },
});
const cases = [
  { message: "子どもの転校を伴う東京から名古屋への引っ越し", required_tasks: [["転校", "転入学"]], expected: ["A", "B", "E"] },
  { message: "子どもの転校", required_tasks: [["転校", "転入学"]], expected: ["A", "B", "E"] },
  { message: "猫の引っ越し", required_tasks: [["猫"]], expected: ["B", "C"] },
  { message: "東京から名古屋への引っ越し", expected: ["A", "B", "C", "D", "E", "F"] },
  { message: "引っ越し", expected: ["A", "B", "C", "D", "E", "F"] },
  { message: "引っ越し ピアノ", required_tasks: [["ピアノ"]], expected: [] },
  { message: "転校と猫の移動を両方", required_tasks: [["転校"], ["猫"]], expected: ["B"] },
  { message: "猫のタスクを含まない転校", required_tasks: [["転校"]], excluded_tasks: [["猫"]], expected: ["A", "E"] },
  { message: "大阪の転校だけ", required_tasks: [["転校"]], required_context: [["大阪"]], expected: ["E"] },
  { message: "domainがORに混ざっても転校を必須にする", required_tasks: [["引っ越し", "転校"]], expected: ["A", "B", "E"] },
  { message: "子どもの転校", domain: null, expected: [] },
  { message: "!?", domain: null, expected: [] },
];
try {
  for (const item of cases) {
    for (const profile of [[], ["household_attributes: 猫2匹"]]) {
      const domain = "domain" in item ? item.domain : "引っ越し";
      const plan = { domain, required_tasks: item.required_tasks ?? [], required_context: item.required_context ?? [], excluded_tasks: item.excluded_tasks ?? [] };
      current = { message: item.message, domain, profile, expected: item.expected, plan, filter: searchPlan.compileSearchPlan(plan) };
      evidence.checks.push(current);
      const result = await api.searchTaskListEntries(item.message, profile, plan, 2, "filter-probe");
      const rows = [...result.results];
      let cursor = result.nextCursor;
      current.pages = [result];
      while (cursor) {
        const page = await api.getSearchTaskListEntriesPage(cursor, 2, "filter-probe");
        rows.push(...page.results);
        current.pages.push(page);
        cursor = page.nextCursor;
      }
      current.actual = rows.map(row => row.id);
      assert.deepEqual([...current.actual].sort(), item.expected);
      assert.equal(new Set(current.actual).size, rows.length);
      if (domain) {
        assert.ok(rows.every(row => row.domain === domain));
        assert.ok(rows.every(row => row.text_matched === current.filter.hasTextConditions));
        assert.ok(current.embedding_input.includes(item.message));
        if (profile.length) assert.ok(current.embedding_input.includes(profile[0]));
        assert.ok(!JSON.stringify(current.filter.params).includes("household_attributes"));
      } else {
        assert.equal(current.job_id, undefined);
        assert.equal(current.embedding_input, undefined);
      }
      console.log(JSON.stringify({ message: item.message, domain, profile: !!profile.length, plan, actual: current.actual }));
    }
  }
  assert.notDeepEqual(evidence.checks[0].actual, evidence.checks[1].actual, "Profile still reorders eligible results");
  evidence.passed = true;
} catch (error) {
  evidence.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(`${output}/plan-filter-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
}
