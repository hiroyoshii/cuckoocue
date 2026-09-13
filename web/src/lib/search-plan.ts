import { z } from "zod";

const concepts = z.array(z.array(z.string().trim().min(1).max(80)).min(1).max(8)).max(5);
export const searchPlanSchema = z.object({
  domain: z.string().min(1).nullable(),
  required_tasks: concepts,
  required_context: concepts,
  excluded_tasks: concepts,
}).strict();
export type SearchPlan = z.infer<typeof searchPlanSchema>;

export function compileSearchPlan(plan: SearchPlan) {
  const predicates: string[] = [];
  const params: Record<string, string> = {};
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase().trim();
  const domain = normalize(plan.domain ?? "");
  for (const [field, scope, negate] of [
    ["required_tasks", "task_text", false],
    ["required_context", "context_search_text", false],
    ["excluded_tasks", "task_text", true],
  ] as const) {
    for (const alternatives of plan[field]) {
      const terms = [...new Set(alternatives.map(normalize))]
        .filter(term => field !== "required_tasks" || term !== domain);
      // A repeated domain must not bypass another purpose in the same OR group.
      if (!terms.length) continue;
      const index = predicates.length;
      const quote = (term: string) => `"${term.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      // A query-local dictionary lets SEARCH recognize Japanese terms inside
      // task sentences without requiring a stored tokenizer-version migration.
      const patterns = [...terms].sort((a, b) => b.length - a.length).map(term => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return /^[a-z0-9 ]+$/.test(term) ? `\\b${escaped}\\b` : escaped;
      });
      params[`searchConcept${index}`] = terms.map(quote).join(" OR ");
      params[`searchAnalyzer${index}`] = JSON.stringify({ patterns: [patterns.join("|")] });
      const expression = `IFNULL(SEARCH(${scope}, @searchConcept${index}, analyzer => 'PATTERN_ANALYZER', analyzer_options => @searchAnalyzer${index}), FALSE)`;
      predicates.push(negate ? `NOT ${expression}` : expression);
    }
  }
  return {
    domain,
    predicate: predicates.length ? predicates.join(" AND ") : "TRUE",
    hasTextConditions: predicates.length > 0,
    params,
  };
}
