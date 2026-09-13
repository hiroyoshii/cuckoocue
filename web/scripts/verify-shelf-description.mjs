import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const base = process.env.CUE_VERIFY_BASE || "http://127.0.0.1:3143";
const output = "../docs/review-screenshots/web/shelf-description";
const corpus = JSON.parse(await readFile("../docs/review-screenshots/web/search-relevance/preparation-v4.json", "utf8"));
const list = id => {
  const entry = corpus.documents.find(document => document.id === id);
  assert.ok(entry);
  return { title: entry.title, context: entry.saved.enrichment.context_text, tasks: entry.saved.tasks.map(task => task.text) };
};
const cases = [
  { name: "new-cat-moving", title: "", context: "", lists: [list("m-cat")] },
  { name: "mixed-cat-activities", title: "", context: "", lists: [list("m-cat"), list("t-sitter"), list("p-sitter")] },
  { name: "different-regions", title: "", context: "", lists: [list("m-school-tokyo"), list("m-school-uk")] },
  { name: "preserve-edited-scope", title: "猫との暮らし", context: "猫と暮らす人が、引っ越しや留守中の世話に備える", lists: [list("m-cat"), list("t-sitter")] },
];
const evidence = { scope: "Real Gemini API, existing test Cuebook contents. No BQ/Firestore writes. Fixed checks supplement manual review; not general accuracy proof.", cases: [], contracts: [], passed: false };
await mkdir(output, { recursive: true });
try {
  for (const { name, ...input } of cases) {
    const start = Date.now();
    const response = await fetch(`${base}/api/shelf-description`, { method: "POST", headers: { "content-type": "application/json", "x-dev-user-id": corpus.author }, body: JSON.stringify(input) });
    const body = await response.json();
    evidence.cases.push({ name, input, status: response.status, elapsedMs: Date.now() - start, body });
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body.description).sort(), ["context", "title"]);
    assert.ok(body.description.title.length <= 120 && body.description.context.length <= 1200);
    if (name === "different-regions") {
      assert.match(body.description.context, /日本/);
      assert.match(body.description.context, /英国|イギリス/);
    }
    console.log(name, body.description);
  }
  for (const [name, body, auth, expected] of [["missing-auth", cases[0], false, 401], ["empty-source", { title: "", context: "", lists: [] }, true, 400], ["invalid-json", "{", true, 400]]) {
    const response = await fetch(`${base}/api/shelf-description`, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { "x-dev-user-id": corpus.author } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });
    evidence.contracts.push({ name, status: response.status, body: await response.json() });
    assert.equal(response.status, expected);
  }
  evidence.passed = true;
} finally {
  await writeFile(`${output}/real-generations-reviewed.json`, JSON.stringify(evidence, null, 2));
}
