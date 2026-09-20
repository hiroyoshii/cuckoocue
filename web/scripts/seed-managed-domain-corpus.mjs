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
assert.equal(catalog.length, 30);
assert.equal(managedDomainSeeds.length, 30);
assert.equal(managedDomainSeeds.flatMap(item => item.revisions).length, 90);
assert.equal(managedDomainBoundaryCases.length, 120);
assert.deepEqual([...managedDomainSeeds.map(item => item.label)].sort(), [...catalog].sort());
assert.equal(new Set(managedDomainBoundaryCases.map(item => item.id)).size, 120);

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
assert.equal(new Set(revisions.map(item => item.id)).size, 90);
assert.equal(new Set(revisions.map(item => item.title)).size, 90);
assert.equal(new Set(revisions.flatMap(item => item.tasks.map(task => task.text))).size, 270);

if (!apply) {
  console.log(JSON.stringify({ valid: true, mode: "dry-run", project, dataset, domains: 30, revisions: 90, boundaryCases: 120 }, null, 2));
  process.exit(0);
}
assert.equal(process.env.CUE_SEED_CONFIRM, `${project}.${dataset}`, "Set CUE_SEED_CONFIRM to the exact project.dataset before applying");

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
async function embed(item) {
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
  console.log(`Embedded ${embedded.length}/${revisions.length}`);
}

const client = new BigQuery({ projectId: project });
const revisionTable = `\`${project}.${dataset}.cuebook_revisions\``;
const shelfTable = `\`${project}.${dataset}.shelves\``;
for (const item of embedded) {
  await client.query({ location, query: `
    MERGE ${revisionTable} target USING (
      SELECT @id AS id, @owner AS owner_user_id, @source AS source_cuebook_id, @title AS title,
        ARRAY(SELECT AS STRUCT JSON_VALUE(t, '$.id') AS id, JSON_VALUE(t, '$.text') AS text,
          CAST(JSON_VALUE(t, '$.default_priority') AS INT64) AS default_priority,
          CAST(JSON_VALUE(t, '$.relative_start_day') AS INT64) AS relative_start_day,
          CAST(JSON_VALUE(t, '$.relative_end_day') AS INT64) AS relative_end_day
          FROM UNNEST(JSON_QUERY_ARRAY(@tasks)) t WITH OFFSET pos ORDER BY pos) AS tasks,
        @domain AS domain, @context AS context_text,
        ARRAY(SELECT AS STRUCT JSON_VALUE(g, '$.label') AS label,
          ARRAY(SELECT CAST(v AS INT64) FROM UNNEST(JSON_VALUE_ARRAY(g, '$.task_offsets')) v) AS task_offsets
          FROM UNNEST(JSON_QUERY_ARRAY(@groups)) g WITH OFFSET pos ORDER BY pos) AS task_groupings,
        @searchText AS search_text,
        ARRAY(SELECT CAST(v AS FLOAT64) FROM UNNEST(JSON_VALUE_ARRAY(@embedding)) v) AS context_embedding
    ) source ON target.id = source.id
    WHEN NOT MATCHED THEN INSERT (id, owner_user_id, source_cuebook_id, title, tasks, domain, context_text, task_groupings, search_text, context_embedding, created_at)
      VALUES (source.id, source.owner_user_id, source.source_cuebook_id, source.title, source.tasks, source.domain, source.context_text, source.task_groupings, source.search_text, source.context_embedding, CURRENT_TIMESTAMP())
    WHEN MATCHED AND target.owner_user_id = @owner THEN UPDATE SET title = source.title, tasks = source.tasks, domain = source.domain,
      context_text = source.context_text, task_groupings = source.task_groupings, search_text = source.search_text, context_embedding = source.context_embedding, withdrawn_at = NULL`,
    params: { id: item.id, owner, source: item.source, title: item.title, tasks: JSON.stringify(item.tasks), domain: item.domain,
      context: item.context, groups: JSON.stringify(item.task_groupings), searchText: item.search_text, embedding: JSON.stringify(item.embedding) },
    jobTimeoutMs: 60000,
  });
  console.log(`Upserted ${item.id}`);
}

for (const item of managedDomainSeeds) {
  const shelfId = `managed-shelf-${item.id}`;
  const revisionIds = item.revisions.map(source => `managed-${item.id}-${source.key}`);
  await client.query({ location, query: `
    MERGE ${shelfTable} target USING (
      SELECT @id AS id, @title AS title, @context AS context,
        ARRAY(SELECT AS STRUCT revision_id, position FROM UNNEST(@revisionIds) revision_id WITH OFFSET position) AS items
    ) source ON target.id = source.id
    WHEN NOT MATCHED THEN INSERT (id, title, context, created_by, created_at, updated_at, items)
      VALUES (source.id, source.title, source.context, @owner, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), source.items)
    WHEN MATCHED AND target.created_by = @owner THEN UPDATE SET title = source.title, context = source.context, updated_at = CURRENT_TIMESTAMP(), items = source.items`,
    params: { id: shelfId, title: `${item.label}の段取り`, context: `${item.label}に関するレビュー済みの初期公開リスト。`, revisionIds, owner },
    jobTimeoutMs: 60000,
  });
}

const [counts] = await client.query({ location, query: `SELECT COUNT(*) AS revisions, COUNT(DISTINCT domain) AS domains FROM ${revisionTable} WHERE owner_user_id = @owner`, params: { owner } });
assert.equal(Number(counts[0].revisions), 90);
assert.equal(Number(counts[0].domains), 30);
console.log(JSON.stringify({ applied: true, project, dataset, ...counts[0], shelves: 30 }, null, 2));
