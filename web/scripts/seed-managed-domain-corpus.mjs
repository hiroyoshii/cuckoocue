import assert from "node:assert/strict";
import { BigQuery } from "@google-cloud/bigquery";
import { GoogleAuth } from "google-auth-library";
import { activeDomainLabels } from "../src/lib/domain-catalog.ts";
import { buildSearchText } from "../src/lib/search-text.ts";
import { managedDomainBoundaryCases, managedDomainSeeds } from "../data/managed-domain-seeds.mjs";

const project = process.env.GOOGLE_CLOUD_PROJECT || "cuckoocue";
const dataset = process.env.CUE_BIGQUERY_DATASET || "cuckoo_cue";
const location = process.env.GOOGLE_CLOUD_LOCATION || "asia-northeast1";
const apply = process.argv.includes("--apply");
const owner = "managed-domain-bootstrap-v1";
assert.match(project, /^[\w-]+$/);
assert.match(dataset, /^\w+$/);

const catalog = activeDomainLabels();
assert.equal(catalog.length, 33);
assert.equal(managedDomainSeeds.length, 33);
assert.equal(managedDomainSeeds.flatMap(item => item.revisions).length, 99);
assert.equal(managedDomainBoundaryCases.length, 132);
assert.deepEqual([...managedDomainSeeds.map(item => item.label)].sort(), [...catalog].sort());
assert.equal(new Set(managedDomainBoundaryCases.map(item => item.id)).size, 132);

const revisions = managedDomainSeeds.flatMap(item => item.revisions.map((source, index) => {
  assert.equal(source.tasks.length, 3);
  assert.equal(new Set(source.tasks).size, 3);
  const id = `managed-${item.id}-${source.key}`;
  const tasks = source.tasks.map((text, taskIndex) => ({
    id: `${id}-task-${taskIndex + 1}`,
    text,
    default_priority: null,
    relative_start_day: taskIndex === 2 ? 0 : -7 + taskIndex * 3,
    relative_end_day: taskIndex === 2 ? 0 : -4 + taskIndex * 3,
  }));
  const task_groupings = [
    { label: "準備と確認", task_offsets: [0, 1] },
    { label: "完了確認", task_offsets: [2] },
  ];
  const search_text = buildSearchText({ title: source.title, tasks }, {
    domain: item.label, context_text: source.context, task_groupings,
  });
  return { id, owner, source: `managed-source-${item.id}-${index + 1}`, title: source.title,
    tasks, domain: item.label, context: source.context, task_groupings, search_text };
}));
assert.equal(new Set(revisions.map(item => item.id)).size, 99);
assert.equal(new Set(revisions.map(item => item.title)).size, 99);
assert.equal(new Set(revisions.flatMap(item => item.tasks.map(task => task.text))).size, 297);

if (!apply) {
  console.log(JSON.stringify({ valid: true, mode: "dry-run", project, dataset, domains: 33, revisions: 99, boundaryCases: 132 }, null, 2));
  process.exit(0);
}
assert.equal(process.env.CUE_SEED_CONFIRM, `${project}.${dataset}`, "Set CUE_SEED_CONFIRM to the exact project.dataset before applying");

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const client = new BigQuery({ projectId: project });
const cuebookTable = `\`${project}.${dataset}.cuebooks\``;
const revisionTable = `\`${project}.${dataset}.cuebook_revisions\``;
const shelfTable = `\`${project}.${dataset}.shelves\``;
const [existingRows] = await client.query({ location, query: `SELECT id FROM ${revisionTable} WHERE id IN UNNEST(@ids)`, params: { ids: revisions.map(item => item.id) }, maximumBytesBilled: "1073741824" });
const existing = new Set(existingRows.map(row => row.id));
async function embed(item) {
  if (existing.has(item.id)) return { ...item, embedding: [] };
  const text = [`title: ${item.title}`, `domain: ${item.domain}`, `context: ${item.context}`, ...item.tasks.map(task => `- ${task.text}`)].join("\n");
  const response = await auth.request({
    url: `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-multilingual-embedding-002:predict`,
    method: "POST", timeout: 15000,
    data: { instances: [{ content: text, task_type: "RETRIEVAL_DOCUMENT" }] },
  });
  const values = response.data.predictions?.[0]?.embeddings?.values;
  assert.ok(values?.length, `No embedding for ${item.id}`);
  return { ...item, embedding: values };
}
const embedded = [];
for (let offset = 0; offset < revisions.length; offset += 5) {
  embedded.push(...await Promise.all(revisions.slice(offset, offset + 5).map(embed)));
  console.log(`Prepared ${embedded.length}/${revisions.length} revisions (${existing.size} existing embeddings left unchanged)`);
}

const seedRows = embedded.map((item) => ({
  id: item.id, cuebook_id: item.source, title: item.title, tasks: item.tasks,
  domain: item.domain, context_text: item.context, task_groupings: item.task_groupings,
  search_text: item.search_text, context_embedding: item.embedding,
}));
const seedRowsJson = JSON.stringify(seedRows);
await client.query({ location, query: `
  MERGE ${cuebookTable} target USING (
    SELECT JSON_VALUE(seed, '$.cuebook_id') AS id, @owner AS owner_user_id,
      JSON_VALUE(seed, '$.title') AS title,
      ARRAY(SELECT AS STRUCT JSON_VALUE(t, '$.id') AS id, JSON_VALUE(t, '$.text') AS text,
        CAST(JSON_VALUE(t, '$.default_priority') AS INT64) AS default_priority,
        CAST(JSON_VALUE(t, '$.relative_start_day') AS INT64) AS relative_start_day,
        CAST(JSON_VALUE(t, '$.relative_end_day') AS INT64) AS relative_end_day
        FROM UNNEST(JSON_QUERY_ARRAY(seed, '$.tasks')) t WITH OFFSET pos ORDER BY pos) AS tasks,
      JSON_VALUE(seed, '$.domain') AS domain, JSON_VALUE(seed, '$.context_text') AS context_text,
      ARRAY(SELECT AS STRUCT JSON_VALUE(g, '$.label') AS label,
        ARRAY(SELECT CAST(v AS INT64) FROM UNNEST(JSON_VALUE_ARRAY(g, '$.task_offsets')) v) AS task_offsets
        FROM UNNEST(JSON_QUERY_ARRAY(seed, '$.task_groupings')) g WITH OFFSET pos ORDER BY pos) AS task_groupings
    FROM UNNEST(JSON_QUERY_ARRAY(@seedRows)) seed
  ) source ON target.id = source.id
  WHEN NOT MATCHED THEN INSERT (id, owner_user_id, origin_revision_id, title, tasks, domain, context_text, task_groupings, updated_at)
    VALUES (source.id, source.owner_user_id, NULL, source.title, source.tasks, source.domain, source.context_text, source.task_groupings, CURRENT_TIMESTAMP())
  WHEN MATCHED AND target.owner_user_id = @owner AND (
    target.title != source.title OR target.domain != source.domain OR target.context_text != source.context_text OR
    TO_JSON_STRING(target.tasks) != TO_JSON_STRING(source.tasks) OR TO_JSON_STRING(target.task_groupings) != TO_JSON_STRING(source.task_groupings)
  ) THEN UPDATE SET title = source.title, tasks = source.tasks, domain = source.domain,
    context_text = source.context_text, task_groupings = source.task_groupings, updated_at = CURRENT_TIMESTAMP()`,
  params: { owner, seedRows: seedRowsJson }, jobTimeoutMs: 60000,
});
await client.query({ location, query: `
  BEGIN TRANSACTION;
  CREATE TEMP TABLE prepared AS
    SELECT JSON_VALUE(seed, '$.id') AS id, @owner AS owner_user_id,
      JSON_VALUE(seed, '$.cuebook_id') AS source_cuebook_id, JSON_VALUE(seed, '$.title') AS title,
      ARRAY(SELECT AS STRUCT JSON_VALUE(t, '$.id') AS id, JSON_VALUE(t, '$.text') AS text,
        CAST(JSON_VALUE(t, '$.default_priority') AS INT64) AS default_priority,
        CAST(JSON_VALUE(t, '$.relative_start_day') AS INT64) AS relative_start_day,
        CAST(JSON_VALUE(t, '$.relative_end_day') AS INT64) AS relative_end_day
        FROM UNNEST(JSON_QUERY_ARRAY(seed, '$.tasks')) t WITH OFFSET pos ORDER BY pos) AS tasks,
      JSON_VALUE(seed, '$.domain') AS domain, JSON_VALUE(seed, '$.context_text') AS context_text,
      ARRAY(SELECT AS STRUCT JSON_VALUE(g, '$.label') AS label,
        ARRAY(SELECT CAST(v AS INT64) FROM UNNEST(JSON_VALUE_ARRAY(g, '$.task_offsets')) v) AS task_offsets
        FROM UNNEST(JSON_QUERY_ARRAY(seed, '$.task_groupings')) g WITH OFFSET pos ORDER BY pos) AS task_groupings,
      JSON_VALUE(seed, '$.search_text') AS search_text,
      ARRAY(SELECT CAST(v AS FLOAT64) FROM UNNEST(JSON_VALUE_ARRAY(seed, '$.context_embedding')) v) AS context_embedding
    FROM UNNEST(JSON_QUERY_ARRAY(@seedRows)) seed;
  ASSERT NOT EXISTS(
    SELECT 1 FROM ${revisionTable} existing_revision JOIN prepared prepared_revision USING (id)
    WHERE existing_revision.owner_user_id != prepared_revision.owner_user_id OR
      existing_revision.source_cuebook_id != prepared_revision.source_cuebook_id OR
      existing_revision.title != prepared_revision.title OR existing_revision.domain != prepared_revision.domain OR
      existing_revision.context_text != prepared_revision.context_text OR
      TO_JSON_STRING(existing_revision.tasks) != TO_JSON_STRING(prepared_revision.tasks) OR
      TO_JSON_STRING(existing_revision.task_groupings) != TO_JSON_STRING(prepared_revision.task_groupings)
  ) AS 'IMMUTABLE_MANAGED_REVISION_MISMATCH';
  INSERT INTO ${revisionTable} (id, owner_user_id, source_cuebook_id, title, tasks, domain, context_text, task_groupings, search_text, context_embedding, created_at)
  SELECT id, owner_user_id, source_cuebook_id, title, tasks, domain, context_text, task_groupings, search_text, context_embedding, CURRENT_TIMESTAMP()
  FROM prepared WHERE NOT EXISTS(
    SELECT 1 FROM ${revisionTable} existing_revision WHERE existing_revision.id = prepared.id
  );
  COMMIT TRANSACTION;`,
  params: { owner, seedRows: seedRowsJson }, jobTimeoutMs: 60000,
});
console.log(`Verified ${existing.size} and inserted ${seedRows.length - existing.size} managed revisions in one batch`);

const shelvesJson = JSON.stringify(managedDomainSeeds.map((item) => ({
  id: `managed-shelf-${item.id}`, title: `${item.label}の段取り`,
  context: `${item.label}に関するレビュー済みの初期公開リスト。`,
  revision_ids: item.revisions.map((source) => `managed-${item.id}-${source.key}`),
})));
await client.query({ location, query: `
  MERGE ${shelfTable} target USING (
    SELECT JSON_VALUE(shelf, '$.id') AS id, JSON_VALUE(shelf, '$.title') AS title,
      JSON_VALUE(shelf, '$.context') AS context,
      ARRAY(SELECT AS STRUCT revision_id, position
        FROM UNNEST(JSON_VALUE_ARRAY(shelf, '$.revision_ids')) revision_id WITH OFFSET position) AS items
    FROM UNNEST(JSON_QUERY_ARRAY(@shelves)) shelf
  ) source ON target.id = source.id
  WHEN NOT MATCHED THEN INSERT (id, title, context, created_by, created_at, updated_at, items)
    VALUES (source.id, source.title, source.context, @owner, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), source.items)
  WHEN MATCHED AND target.created_by = @owner AND (
    target.title != source.title OR target.context != source.context OR TO_JSON_STRING(target.items) != TO_JSON_STRING(source.items)
  ) THEN UPDATE SET title = source.title, context = source.context, updated_at = CURRENT_TIMESTAMP(), items = source.items`,
  params: { shelves: shelvesJson, owner }, jobTimeoutMs: 60000,
});

const [counts] = await client.query({ location, query: `SELECT COUNT(*) AS revisions, COUNT(DISTINCT domain) AS domains FROM ${revisionTable} WHERE owner_user_id = @owner`, params: { owner } });
assert.equal(Number(counts[0].revisions), 99);
assert.equal(Number(counts[0].domains), 33);
console.log(JSON.stringify({ applied: true, project, dataset, ...counts[0], shelves: 33 }, null, 2));
