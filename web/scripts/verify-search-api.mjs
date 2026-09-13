import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { BigQuery } from "@google-cloud/bigquery";

const base = process.env.CUE_SCENARIO_BASE_URL || "http://127.0.0.1:3132";
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(process.env.CUE_BIGQUERY_DATASET, "cuckoo_cue_web_verification");
const before = JSON.parse(await readFile("../docs/review-screenshots/web/residual-fixes/data-evidence.json", "utf8"));
const bq = new BigQuery({ projectId: "cuckoocue" });
const [rows] = await bq.query({ location: "asia-northeast1", query: "SELECT id, title, domain, search_text, withdrawn_at FROM `cuckoocue.cuckoo_cue_web_verification.cuebook_revisions`" });
const evidence = { scope: "Local production build API, dev UID authentication, existing verification BQ rows, real Vertex domain mapping/embedding and existing Memory Bank Profiles. No new fixtures or events.", base, savedRows: rows, checks: [], passed: false };
const familyId = before.fixtures.find(f => f.key === "jp-family").revisionId;
const nearCatId = before.fixtures.find(f => f.key === "jp-near").revisionId;
try {
  for (const message of ["子どもの転校を伴う東京から名古屋への引っ越し", "猫の引っ越し", "引っ越し"]) {
    const sets = [];
    for (const user of ["neutral", "profiled"]) {
      const check = { message, user, operations: [] };
      evidence.checks.push(check);
      let payload = { message, page_size: 2 };
      const results = [];
      do {
        const start = performance.now();
        const response = await fetch(`${base}/api/search`, { method: "POST", headers: { "content-type": "application/json", "x-dev-user-id": before[user] }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120000) });
        const body = await response.json();
        check.operations.push({ input: payload, status: response.status, elapsedMs: Math.round(performance.now() - start), body });
        assert.equal(response.status, 200, JSON.stringify(body));
        if (payload.message) {
          assert.equal(body.searchDomain, "引っ越し");
          check.profile = body.userProfileAttributes;
        }
        results.push(...body.results);
        payload = body.nextCursor ? { cursor: body.nextCursor, page_size: 2 } : null;
      } while (payload);
      check.results = results;
      assert.equal(new Set(results.map(r => r.id)).size, results.length);
      assert.ok(results.every(r => r.domain === "引っ越し"));
      assert.ok(results.every(r => !rows.find(stored => stored.id === r.id).withdrawn_at));
      if (message.startsWith("子ども")) {
        assert.ok(results.some(r => r.id === familyId), "Known family fixture must remain");
        assert.ok(!results.some(r => r.id === nearCatId), "Unrelated cat fixture must be excluded");
      }
      if (message.startsWith("猫")) assert.ok(results.some(r => r.id === nearCatId), "One-character subject must remain searchable");
      sets.push(results.map(r => r.id).sort());
      console.log(JSON.stringify({ message, user, returned: results.length, titles: results.map(r => r.title) }));
    }
    assert.deepEqual(sets[0], sets[1], "Profile must not change candidate membership");
  }
  evidence.passed = true;
} catch (error) {
  evidence.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile("../docs/review-screenshots/web/search-filter-probe/api-evidence.json", `${JSON.stringify(evidence, null, 2)}\n`);
}
