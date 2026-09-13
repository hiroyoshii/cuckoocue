import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BigQuery } from "@google-cloud/bigquery";

if (process.env.CUE_BIGQUERY_DATASET !== "cuckoo_cue_web_verification") throw Error("Verification dataset required");
const base = process.env.CUE_SCENARIO_BASE_URL || "http://127.0.0.1:3115";
if (!base.startsWith("http://127.0.0.1:")) throw Error("Local verification server required");
const stamp = Date.now();
const output = "../docs/review-screenshots/web/residual-fixes";
const prior = process.env.CUE_RESUME_EVIDENCE === "true" ? JSON.parse(await readFile(`${output}/data-evidence.json`, "utf8")) : null;
const author = prior?.author ?? `residual-author-${stamp}`;
const neutral = prior?.neutral ?? `residual-neutral-${stamp}`;
const profiled = prior?.profiled ?? `residual-profiled-${stamp}`;
const bq = new BigQuery({ projectId: "cuckoocue" });
const fixtures = prior?.fixtures ?? [
  { key: "jp-cat", title: "猫2匹と東京から名古屋への引っ越し", terms: ["猫", "名古屋"], tasks: ["猫2匹の移動用ケージと新幹線の乗車条件を確認する", "東京で転出届をオンライン申請する", "名古屋で転入届を提出する"] },
  { key: "jp-near", title: "猫2匹と東京の同じ区内で引っ越す", terms: ["猫", "区内"], tasks: ["猫2匹を近距離のタクシーで運ぶ", "同じ区内の転居届を提出する", "近所の動物病院を引き続き利用する"] },
  { key: "uk", title: "ロンドンからブライトンへの引っ越し", terms: ["Council Tax", "Royal Mail"], tasks: ["Council TaxのLondon解約とBrighton登録をする", "Royal Mail redirectionを申し込む", "BrightonのGP registrationをする"] },
  { key: "trip", title: "東京旅行の準備", terms: ["旅行", "ホテル"], tasks: ["東京のホテルと新幹線を予約する", "浅草と上野の観光日程を決める", "旅行中の猫2匹の世話をシッターに依頼する"] },
  { key: "address", title: "住所変更の手続き", terms: ["住所"], tasks: ["銀行の住所変更をオンラインで申請する", "勤務先に新住所を届け出る", "携帯電話の請求先住所を変更する"] },
  { key: "jp-family", title: "子どもと東京から名古屋への引っ越し", terms: ["子ども", "転校"], tasks: ["子どもの転校書類を東京の学校で受け取る", "名古屋の小学校に転入を申し込む", "名古屋で子どもの医療費助成を申請する"] },
];
const queries = [
  { text: "猫2匹と東京から名古屋へ新幹線で引っ越す", expected: "jp-cat" },
  { text: "同じ区内で猫と近距離の引っ越し", expected: "jp-near" },
  { text: "ロンドンからブライトンへ引っ越し Council Tax Royal Mail", expected: "uk" },
  { text: "東京旅行 ホテル 観光 猫はシッターに預ける", expected: "trip" },
  { text: "銀行と携帯電話の住所変更だけしたい", expected: "address" },
  { text: "子どもの転校を伴う東京から名古屋への引っ越し", expected: "jp-family" },
];
const evidence = { environment: { base, dataset: process.env.CUE_BIGQUERY_DATASET, authentication: "local dev UID; not real Google login", bigquery: "real", llm: "real Vertex", memoryBank: "real Profiles" }, author, neutral, profiled, fixtures, queries, operations: [], generations: [], searches: [], passed: false };
if (prior) {
  evidence.operations = prior.operations;
  evidence.generations = prior.generations;
  evidence.previousErrors = [...(prior.previousErrors ?? []), ...(prior.error ? [prior.error] : [])];
}
await mkdir(output, { recursive: true });
async function api(uid, path, method = "GET", input, expected = 200) {
  const start = performance.now();
  const response = await fetch(`${base}${path}`, { method, headers: { "x-dev-user-id": uid, "content-type": "application/json" }, ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(180000) });
  const body = await response.json();
  evidence.operations.push({ uid, path, method, input, status: response.status, elapsedMs: Math.round(performance.now() - start), body });
  console.log(response.status, method, path);
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
try {
  const group = prior?.shelfId ? await api(author, `/api/shelves/${prior.shelfId}`) : await api(author, "/api/shelves", "POST", { operation_id: randomUUID(), title: "Web受入評価の公開リスト", context: "引っ越し・旅行・住所変更の比較用" }, 201);
  evidence.shelfId = group.shelf.id;
  for (const fixture of fixtures) {
    if (fixture.revisionId) continue;
    const tasks = fixture.tasks.map((text, index) => ({ id: randomUUID(), text, default_priority: index === 0 ? 0 : null, relative_start_day: -14, relative_end_day: index === 2 ? 0 : -7 }));
    const draft = { title: fixture.title, tasks };
    const { enrichment } = await api(author, "/api/task-list-enrichment", "POST", draft);
    const offsets = enrichment.task_groupings.flatMap(group => group.task_offsets);
    assert.deepEqual([...offsets].sort(), tasks.map((_, i) => i));
    evidence.generations.push({ key: fixture.key, enrichment, retainedTerms: fixture.terms.map(term => ({ term, retained: `${enrichment.context_text} ${enrichment.domain}`.toLowerCase().includes(term.toLowerCase()) })) });
    const id = randomUUID();
    const { cuebook } = await api(author, `/api/cuebooks/${id}`, "PUT", { operation_id: randomUUID(), expected_updated_at: null, content: { ...draft, enrichment } });
    const publication = { revision_id: randomUUID(), source_cuebook_id: id, expected_source_updated_at: cuebook.updated_at, shelf_id: group.shelf.id,
      title: cuebook.title, tasks: cuebook.tasks.map(t => ({ title: t.text, default_priority: t.default_priority, relative_start_day: t.relative_start_day, relative_end_day: t.relative_end_day })) };
    fixture.revisionId = publication.revision_id; fixture.cuebookId = id;
    await api(author, "/api/cuebook-revisions", "POST", publication, 201);
    await api(author, "/api/cuebook-revisions", "POST", publication, 201);
    await api(neutral, `/api/cuebooks/${id}/revisions`, "GET", undefined, 404);
    assert.equal((await api(author, `/api/cuebooks/${id}/revisions`)).revisions[0].id, fixture.revisionId);
  }
  if (!prior) for (const [i, text] of [
    "タスクを追加: 猫2匹の新幹線移動用ケージのサイズを確認する。",
    "タスク本文を変更: 電話で申請する、からオンラインで申請する、へ変更した。",
    "タスクを追加: ロンドン在住時に使ったRoyal Mail転送の終了を確認する。",
  ].entries()) await api(profiled, "/api/memory-events", "POST", { event_id: `residual-${stamp}-${i}`, kind: i === 1 ? "android_task_edited" : "android_task_added", text, occurred_at: new Date().toISOString() });
  // Profiles are generated asynchronously. Observe the real service, do not
  // inject a profile or turn an empty response into assumed attributes.
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    const probe = await api(profiled, "/api/search", "POST", { message: queries[0].text, page_size: 20 });
    evidence.profileAttributes = probe.userProfileAttributes;
    if (probe.userProfileAttributes?.length) break;
  }
  for (const query of queries) for (const uid of [neutral, profiled]) {
    let response = await api(uid, "/api/search", "POST", { message: query.text, page_size: 20 });
    const all = [...response.results];
    while (response.nextCursor) { response = await api(uid, "/api/search", "POST", { cursor: response.nextCursor, page_size: 20 }); all.push(...response.results); }
    const ranked = all.flatMap(row => { const fixture = fixtures.find(f => f.revisionId === row.id); return fixture ? [{ key: fixture.key, id: row.id, score: row.context_score }] : []; });
    evidence.searches.push({ query: query.text, expected: query.expected, user: uid === neutral ? "neutral" : "profiled", fixtureRanking: ranked, expectedRank: ranked.findIndex(item => item.key === query.expected) + 1, totalReturned: all.length });
  }
  const stopped = fixtures[0];
  const reuseInput = { operation_id: randomUUID(), source: { type: "revision", id: stopped.revisionId }, target_anchor_day: "2026-12-01", time_zone: "Asia/Tokyo" };
  const reuse = await api(neutral, "/api/reuse", "POST", reuseInput);
  assert.equal((await api(neutral, "/api/reuse", "POST", reuseInput)).runId, reuse.runId);
  evidence.reusedRunId = reuse.runId;
  const { run: snapshot } = await api(neutral, `/api/runs/${reuse.runId}/snapshot`);
  assert.equal(snapshot.id, reuse.runId);
  assert.equal(snapshot.target_anchor_day, Date.parse("2026-12-01T00:00:00+09:00"));
  assert.equal(snapshot.tasks[0].available_from_at, Date.parse("2026-11-17T00:00:00+09:00"));
  assert.equal(snapshot.tasks[0].due_at, Date.parse("2026-11-24T00:00:00+09:00"));
  await api(author, `/api/runs/${reuse.runId}/snapshot`, "GET", undefined, 404);
  await bq.query({ location: "asia-northeast1", query: "UPDATE `cuckoocue.cuckoo_cue_web_verification.cuebook_revisions` SET withdrawn_at = CURRENT_TIMESTAMP() WHERE id = @id AND owner_user_id = @owner", params: { id: stopped.revisionId, owner: author } });
  assert.equal((await api(neutral, "/api/reuse", "POST", reuseInput)).runId, reuse.runId);
  const { shelf: currentShelf } = await api(author, `/api/shelves/${group.shelf.id}`);
  const reordered = { operation_id: randomUUID(), expected_updated_at: currentShelf.updated_at, items: [...currentShelf.items].reverse().map((item, position) => ({ revision_id: item.revision_id, position })) };
  const { shelf: updatedShelf } = await api(author, `/api/shelves/${group.shelf.id}`, "PATCH", reordered);
  assert.equal(updatedShelf.items.at(-1).revision_id, stopped.revisionId);
  assert.ok(updatedShelf.items.at(-1).revision.withdrawn_at);
  await api(neutral, `/api/cuebook-revisions/${stopped.revisionId}`, "GET", undefined, 410);
  await api(neutral, "/api/reuse", "POST", { operation_id: randomUUID(), source: { type: "revision", id: stopped.revisionId }, target_anchor_day: "2026-12-01", time_zone: "Asia/Tokyo" }, 410);
  let search = await api(neutral, "/api/search", "POST", { message: stopped.title, page_size: 20 });
  while (true) {
    assert.ok(search.results.every(row => row.id !== stopped.revisionId));
    if (!search.nextCursor) break;
    search = await api(neutral, "/api/search", "POST", { cursor: search.nextCursor, page_size: 20 });
  }
  const [rows] = await bq.query({ location: "asia-northeast1", query: "SELECT * FROM `cuckoocue.cuckoo_cue_web_verification.cuebook_revisions` WHERE owner_user_id = @owner", params: { owner: author } });
  evidence.savedRows = rows;
  assert.equal(rows.length, fixtures.length);
  evidence.quality = { top1WithinFixtures: evidence.searches.filter(s => s.expectedRank === 1).length, comparisons: evidence.searches.length,
    retainedTerms: evidence.generations.flatMap(g => g.retainedTerms).filter(t => t.retained).length,
    checkedTerms: evidence.generations.flatMap(g => g.retainedTerms).length,
    profileObserved: Boolean(evidence.profileAttributes?.length), scope: "6 fixtures, not an exhaustive quality guarantee; no manual edits to generated context" };
  evidence.passed = true;
} catch (error) {
  evidence.error = error.message;
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/data-evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: evidence.passed, error: evidence.error, quality: evidence.quality }));
}
