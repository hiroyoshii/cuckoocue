import assert from "node:assert/strict";
import { BigQuery } from "@google-cloud/bigquery";
import { GoogleAuth } from "google-auth-library";
import { buildSearchText } from "../src/lib/search-text.ts";
import { editorialCuebooks, editorialOwner, editorialShelves, editorialSources } from "../data/editorial-shelves.mjs";
import { validateEditorialCorpus } from "./validate-editorial-shelves.mjs";

const project = process.env.GOOGLE_CLOUD_PROJECT || "cuckoocue";
const dataset = process.env.CUE_BIGQUERY_DATASET || "cuckoo_cue";
const location = process.env.GOOGLE_CLOUD_LOCATION || "asia-northeast1";
const apply = process.argv.includes("--apply");
assert.match(project, /^[\w-]+$/);
assert.match(dataset, /^\w+$/);

const summary = validateEditorialCorpus();
const sourceById = new Map(editorialSources.map((source) => [source.id, source]));
const cuebookByKey = new Map(editorialCuebooks.map((cuebook) => [cuebook.key, cuebook]));
const prepared = editorialCuebooks.map((cuebook) => {
  const tasks = cuebook.tasks.map((item, index) => ({ id: `${cuebook.cuebook_id}-task-${index + 1}`, ...item }));
  const sources = cuebook.source_ids.map((id) => {
    const source = sourceById.get(id);
    assert.ok(source);
    return { url: source.url, title: source.title, publisher: source.publisher, source_type: source.source_type, rights: source.rights };
  });
  const search_text = buildSearchText({ title: cuebook.title, tasks }, {
    domain: cuebook.domain, context_text: cuebook.context_text, task_groupings: cuebook.task_groupings,
  });
  return { ...cuebook, tasks, sources, search_text };
});

if (!apply) {
  console.log(JSON.stringify({ valid: true, mode: "dry-run", project, dataset, owner: editorialOwner, ...summary }, null, 2));
  process.exit(0);
}
assert.equal(process.env.CUE_SEED_CONFIRM, `${project}.${dataset}`, "Set CUE_SEED_CONFIRM to the exact project.dataset before applying");

const client = new BigQuery({ projectId: project });
const cuebookTable = `\`${project}.${dataset}.cuebooks\``;
const revisionTable = `\`${project}.${dataset}.cuebook_revisions\``;
const shelfTable = `\`${project}.${dataset}.shelves\``;
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

await client.query({ location, query: `ALTER TABLE ${revisionTable} ADD COLUMN IF NOT EXISTS provenance
  STRUCT<origin_type STRING, curator_label STRING, context_mode STRING, reviewed_at TIMESTAMP,
    sources ARRAY<STRUCT<url STRING, title STRING, publisher STRING, source_type STRING, rights STRING>>>` });
await client.query({ location, query: `ALTER TABLE ${shelfTable} ADD COLUMN IF NOT EXISTS curation
  STRUCT<is_default BOOL, curator_label STRING, reviewed_at TIMESTAMP>` });

const [existingRows] = await client.query({
  location,
  query: `SELECT id FROM ${revisionTable} WHERE id IN UNNEST(@ids)`,
  params: { ids: prepared.map((item) => item.revision_id) },
  maximumBytesBilled: "1073741824",
});
const existing = new Set(existingRows.map((row) => row.id));

async function embed(item) {
  if (existing.has(item.revision_id)) return { ...item, embedding: [] };
  const text = [`title: ${item.title}`, `domain: ${item.domain}`, `context: ${item.context_text}`, ...item.tasks.map((task) => `- ${task.text}`)].join("\n");
  const response = await auth.request({
    url: `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-multilingual-embedding-002:predict`,
    method: "POST", timeout: 15000,
    data: { instances: [{ content: text, task_type: "RETRIEVAL_DOCUMENT" }] },
  });
  const values = response.data.predictions?.[0]?.embeddings?.values;
  assert.ok(values?.length, `No embedding for ${item.revision_id}`);
  return { ...item, embedding: values };
}

const embedded = [];
for (let offset = 0; offset < prepared.length; offset += 5) {
  embedded.push(...await Promise.all(prepared.slice(offset, offset + 5).map(embed)));
  console.log(`Prepared ${embedded.length}/${prepared.length} editorial revisions`);
}

for (const item of embedded) {
  const params = {
    owner: editorialOwner,
    cuebookId: item.cuebook_id,
    revisionId: item.revision_id,
    title: item.title,
    tasks: JSON.stringify(item.tasks),
    domain: item.domain,
    context: item.context_text,
    groups: JSON.stringify(item.task_groupings),
    searchText: item.search_text,
    embedding: JSON.stringify(item.embedding),
    originType: item.provenance.origin_type,
    curatorLabel: item.provenance.curator_label,
    contextMode: item.provenance.context_mode,
    reviewedAt: item.provenance.reviewed_at,
    sources: JSON.stringify(item.sources),
  };
  await client.query({ location, query: `
    MERGE ${cuebookTable} target USING (
      SELECT @cuebookId AS id, @owner AS owner_user_id, @title AS title,
        ARRAY(SELECT AS STRUCT JSON_VALUE(t, '$.id') AS id, JSON_VALUE(t, '$.text') AS text,
          CAST(JSON_VALUE(t, '$.default_priority') AS INT64) AS default_priority,
          CAST(JSON_VALUE(t, '$.relative_start_day') AS INT64) AS relative_start_day,
          CAST(JSON_VALUE(t, '$.relative_end_day') AS INT64) AS relative_end_day
          FROM UNNEST(JSON_QUERY_ARRAY(@tasks)) t WITH OFFSET pos ORDER BY pos) AS tasks,
        @domain AS domain, @context AS context_text,
        ARRAY(SELECT AS STRUCT JSON_VALUE(g, '$.label') AS label,
          ARRAY(SELECT CAST(v AS INT64) FROM UNNEST(JSON_VALUE_ARRAY(g, '$.task_offsets')) v) AS task_offsets
          FROM UNNEST(JSON_QUERY_ARRAY(@groups)) g WITH OFFSET pos ORDER BY pos) AS task_groupings
    ) source ON target.id = source.id
    WHEN NOT MATCHED THEN INSERT (id, owner_user_id, origin_revision_id, title, tasks, domain, context_text, task_groupings, updated_at)
      VALUES (source.id, source.owner_user_id, NULL, source.title, source.tasks, source.domain, source.context_text, source.task_groupings, CURRENT_TIMESTAMP())
    WHEN MATCHED AND target.owner_user_id = @owner AND (
      target.title != source.title OR target.domain != source.domain OR target.context_text != source.context_text OR
      TO_JSON_STRING(target.tasks) != TO_JSON_STRING(source.tasks) OR TO_JSON_STRING(target.task_groupings) != TO_JSON_STRING(source.task_groupings)
    ) THEN UPDATE SET title = source.title, tasks = source.tasks, domain = source.domain,
      context_text = source.context_text, task_groupings = source.task_groupings, updated_at = CURRENT_TIMESTAMP()`,
    params,
    jobTimeoutMs: 60000,
  });
  await client.query({ location, query: `
    BEGIN TRANSACTION;
    CREATE TEMP TABLE prepared AS SELECT @revisionId AS id, @owner AS owner_user_id, @cuebookId AS source_cuebook_id, @title AS title,
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
      ARRAY(SELECT CAST(v AS FLOAT64) FROM UNNEST(JSON_VALUE_ARRAY(@embedding)) v) AS context_embedding,
      STRUCT(@originType AS origin_type, @curatorLabel AS curator_label, @contextMode AS context_mode, TIMESTAMP(@reviewedAt) AS reviewed_at,
        ARRAY(SELECT AS STRUCT JSON_VALUE(s, '$.url') AS url, JSON_VALUE(s, '$.title') AS title,
          JSON_VALUE(s, '$.publisher') AS publisher, JSON_VALUE(s, '$.source_type') AS source_type, JSON_VALUE(s, '$.rights') AS rights
          FROM UNNEST(JSON_QUERY_ARRAY(@sources)) s WITH OFFSET pos ORDER BY pos) AS sources) AS provenance;
    ASSERT NOT EXISTS(
      SELECT 1 FROM ${revisionTable} existing_revision CROSS JOIN prepared prepared_revision
      WHERE existing_revision.id = prepared_revision.id AND (
        existing_revision.owner_user_id != prepared_revision.owner_user_id OR
        existing_revision.source_cuebook_id != prepared_revision.source_cuebook_id OR
        existing_revision.title != prepared_revision.title OR existing_revision.domain != prepared_revision.domain OR
        existing_revision.context_text != prepared_revision.context_text OR
        TO_JSON_STRING(existing_revision.tasks) != TO_JSON_STRING(prepared_revision.tasks) OR
        TO_JSON_STRING(existing_revision.task_groupings) != TO_JSON_STRING(prepared_revision.task_groupings) OR
        TO_JSON_STRING(existing_revision.provenance) != TO_JSON_STRING(prepared_revision.provenance)
      )
    ) AS 'IMMUTABLE_EDITORIAL_REVISION_MISMATCH';
    INSERT INTO ${revisionTable} (id, owner_user_id, source_cuebook_id, title, tasks, domain, context_text, task_groupings, search_text, context_embedding, provenance, created_at)
    SELECT id, owner_user_id, source_cuebook_id, title, tasks, domain, context_text, task_groupings, search_text, context_embedding, provenance, CURRENT_TIMESTAMP()
    FROM prepared WHERE NOT EXISTS(
      SELECT 1 FROM ${revisionTable} existing_revision WHERE existing_revision.id = prepared.id
    );
    COMMIT TRANSACTION;`,
    params,
    jobTimeoutMs: 60000,
  });
  console.log(`${existing.has(item.revision_id) ? "Verified" : "Inserted"} ${item.revision_id}`);
}

for (const shelf of editorialShelves) {
  const revisionIds = shelf.cuebook_keys.map((key) => cuebookByKey.get(key).revision_id);
  await client.query({ location, query: `
    ASSERT (SELECT COUNT(*) FROM ${revisionTable} WHERE id IN UNNEST(@revisionIds) AND withdrawn_at IS NULL) = ARRAY_LENGTH(@revisionIds)
      AS 'EDITORIAL_REVISION_MISSING';
    MERGE ${shelfTable} target USING (
      SELECT @id AS id, @title AS title, @context AS context,
        ARRAY(SELECT AS STRUCT revision_id, position FROM UNNEST(@revisionIds) revision_id WITH OFFSET position) AS items,
        STRUCT(TRUE AS is_default, 'CuckooCueデフォルト' AS curator_label, TIMESTAMP(@reviewedAt) AS reviewed_at) AS curation
    ) source ON target.id = source.id
    WHEN NOT MATCHED THEN INSERT (id, title, context, created_by, created_at, updated_at, items, curation)
      VALUES (source.id, source.title, source.context, @owner, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), source.items, source.curation)
    WHEN MATCHED AND target.created_by = @owner THEN UPDATE SET title = source.title, context = source.context,
      updated_at = IF(target.title != source.title OR target.context != source.context OR TO_JSON_STRING(target.items) != TO_JSON_STRING(source.items) OR TO_JSON_STRING(target.curation) != TO_JSON_STRING(source.curation), CURRENT_TIMESTAMP(), target.updated_at),
      items = source.items, curation = source.curation`,
    params: { id: shelf.id, title: shelf.title, context: shelf.context, revisionIds, owner: editorialOwner, reviewedAt: editorialCuebooks[0].provenance.reviewed_at },
    jobTimeoutMs: 60000,
  });
  console.log(`Upserted ${shelf.id}`);
}

const [counts] = await client.query({ location, query: `
  SELECT COUNT(*) AS revisions, COUNT(DISTINCT source_cuebook_id) AS cuebooks
  FROM ${revisionTable} WHERE owner_user_id = @owner AND id IN UNNEST(@revisionIds)`,
  params: { owner: editorialOwner, revisionIds: prepared.map((item) => item.revision_id) },
  maximumBytesBilled: "1073741824",
});
assert.equal(Number(counts[0].revisions), summary.revisions);
assert.equal(Number(counts[0].cuebooks), summary.cuebooks);
console.log(JSON.stringify({ applied: true, project, dataset, owner: editorialOwner, ...summary }, null, 2));
