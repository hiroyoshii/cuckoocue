import { readFile, mkdir, writeFile } from "node:fs/promises";
import { cleanEvaluationShelf } from "./search-evaluation-maintenance.mjs";

const preparation = JSON.parse(await readFile("../docs/review-screenshots/web/search-relevance/preparation-v4.json", "utf8"));
const evidence = await cleanEvaluationShelf({ dataset: process.env.CUE_BIGQUERY_DATASET, shelfId: preparation.shelfId, owner: preparation.author, apply: process.argv.includes("--apply") });
const output = "../docs/review-screenshots/web/final-web-quality";
await mkdir(output, { recursive: true });
await writeFile(`${output}/fixture-cleanup-${evidence.apply ? "applied" : "plan"}.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ apply: evidence.apply, before: evidence.before.items.length, removed: evidence.removed.length, after: evidence.after.items.length, updated: evidence.updated }));
