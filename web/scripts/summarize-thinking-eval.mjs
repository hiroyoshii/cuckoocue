import { readFile } from "node:fs/promises";
import { queries } from "./search-evaluation-cases.mjs";

const directory = "../docs/review-screenshots/web/search-relevance";
const names = process.argv.slice(2).length ? process.argv.slice(2) : ["thinking-1024", "thinking-128", "thinking-0"];
const expectedDomains = new Map(queries.filter(query => query.split === "development").map(query => [query.id, query.domain]));
const runs = await Promise.all(names.map(async name => JSON.parse(await readFile(`${directory}/${name}.json`, "utf8"))));
const baselinePlans = new Map(runs[0].checks.map(check => [check.id, JSON.stringify(check.plan)]));

for (const run of runs) {
  const sum = field => run.checks.reduce((total, check) => total + Number(check.usage?.[field] ?? 0), 0);
  const latencies = run.checks.map(check => check.elapsedMs).sort((left, right) => left - right);
  const thoughtCounts = run.checks.map(check => Number(check.usage?.thoughtsTokenCount ?? 0));
  const exactMatches = run.checks.filter(check => baselinePlans.get(check.id) === JSON.stringify(check.plan)).length;
  const differentPlanIds = run.checks.filter(check => baselinePlans.get(check.id) !== JSON.stringify(check.plan)).map(check => check.id);
  console.log(JSON.stringify({
    thinkingBudget: run.thinkingBudget,
    cases: run.checks.length,
    errors: run.checks.filter(check => check.error).length,
    domainPass: run.checks.filter(check => check.plan?.domain === expectedDomains.get(check.id)).length,
    exactPlanMatchesToFirstRun: exactMatches,
    differentPlanIdsToFirstRun: differentPlanIds,
    promptTokens: sum("promptTokenCount"),
    candidateTokens: sum("candidatesTokenCount"),
    thoughtTokens: sum("thoughtsTokenCount"),
    maxThoughtTokensPerCall: Math.max(...thoughtCounts),
    totalTokens: sum("totalTokenCount"),
    medianElapsedMs: latencies[Math.floor(latencies.length / 2)],
  }));
}
