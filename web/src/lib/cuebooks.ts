import type { Cuebook, SaveCuebookInput } from "./cuebook-schema";
import { bqRead, bqTable, bqWrite } from "./bq-store";

const projection = `id, origin_revision_id, title, tasks,
  IF(domain IS NULL, NULL, STRUCT(domain, context_text, task_groupings)) AS enrichment,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', updated_at) AS updated_at`;

export async function getCuebook(owner: string, id: string): Promise<Cuebook | null> {
  const rows = await bqRead<Cuebook>(`SELECT ${projection} FROM ${bqTable("cuebooks")} WHERE owner_user_id = @owner AND id = @id LIMIT 1`, { owner, id });
  return rows[0] ?? null;
}

export async function listCuebooks(owner: string, after = "") {
  const rows = await bqRead<Cuebook>(`SELECT ${projection} FROM ${bqTable("cuebooks")} WHERE owner_user_id = @owner AND id > @after ORDER BY id LIMIT 21`, { owner, after });
  return { cuebooks: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
}

export const contentSql = `SELECT JSON_VALUE(@content, '$.title') AS title,
  ARRAY(SELECT AS STRUCT JSON_VALUE(t, '$.id') AS id, JSON_VALUE(t, '$.text') AS text,
    CAST(JSON_VALUE(t, '$.default_priority') AS INT64) AS default_priority,
    CAST(JSON_VALUE(t, '$.relative_start_day') AS INT64) AS relative_start_day,
    CAST(JSON_VALUE(t, '$.relative_end_day') AS INT64) AS relative_end_day
    FROM UNNEST(JSON_QUERY_ARRAY(@content, '$.tasks')) t WITH OFFSET pos ORDER BY pos) AS tasks,
  JSON_VALUE(@content, '$.enrichment.domain') AS domain,
  JSON_VALUE(@content, '$.enrichment.context_text') AS context_text,
  ARRAY(SELECT AS STRUCT JSON_VALUE(g, '$.label') AS label,
    ARRAY(SELECT CAST(o AS INT64) FROM UNNEST(JSON_VALUE_ARRAY(g, '$.task_offsets')) o) AS task_offsets
    FROM UNNEST(JSON_QUERY_ARRAY(@content, '$.enrichment.task_groupings')) g WITH OFFSET pos ORDER BY pos) AS task_groupings`;

export async function saveCuebook(owner: string, id: string, input: SaveCuebookInput) {
  const table = bqTable("cuebooks");
  const create = input.expected_updated_at === null;
  const rows = await bqWrite<Cuebook>(owner, create ? `cuebook-create:${id}` : `cuebook-update:${input.operation_id}`, { id, ...input }, `
    BEGIN TRANSACTION;
    CREATE TEMP TABLE content AS (${contentSql});
    ${create ? `
      ASSERT NOT EXISTS(SELECT 1 FROM ${table} WHERE id = @id) AS 'CUE_CONFLICT';
      INSERT INTO ${table} (id, owner_user_id, origin_revision_id, title, tasks, domain, context_text, task_groupings, updated_at)
      SELECT @id, @owner, NULL, title, tasks, domain, context_text, task_groupings, CURRENT_TIMESTAMP() FROM content;
    ` : `
      ASSERT EXISTS(SELECT 1 FROM ${table} WHERE id = @id AND owner_user_id = @owner) AS 'CUE_NOT_FOUND';
      UPDATE ${table} c SET title = n.title, tasks = n.tasks, domain = n.domain,
        context_text = n.context_text, task_groupings = n.task_groupings, updated_at = CURRENT_TIMESTAMP()
      FROM content n WHERE c.id = @id AND c.owner_user_id = @owner AND c.updated_at = TIMESTAMP(@expected);
      ASSERT @@row_count = 1 AS 'CUE_CONFLICT';
    `}
    CREATE TEMP TABLE saved AS SELECT ${projection} FROM ${table} WHERE id = @id AND owner_user_id = @owner;
    COMMIT TRANSACTION;
    SELECT * FROM saved;
  `, { owner, id, content: JSON.stringify(input.content), ...(create ? {} : { expected: input.expected_updated_at }) }, async () => {
    const saved = await getCuebook(owner, id);
    if (!saved) throw new Error("Committed Cuebook is unavailable");
    return [saved];
  });
  return rows[0];
}

export async function borrowRevision(owner: string, id: string, revisionId: string): Promise<Cuebook> {
  const rows = await bqWrite<Cuebook>(owner, `borrow:${id}`, { revisionId }, `
    BEGIN TRANSACTION;
    ASSERT EXISTS(SELECT 1 FROM ${bqTable("cuebook_revisions")} WHERE id = @revision AND withdrawn_at IS NULL) AS 'CUE_NOT_FOUND';
    ASSERT NOT EXISTS(SELECT 1 FROM ${bqTable("cuebooks")} WHERE id = @id) AS 'CUE_CONFLICT';
    INSERT INTO ${bqTable("cuebooks")} (id, owner_user_id, origin_revision_id, title, tasks, domain, context_text, task_groupings, updated_at)
    SELECT @id, @owner, id, title,
      ARRAY(SELECT AS STRUCT GENERATE_UUID() AS id, task.text, task.default_priority, task.relative_start_day, task.relative_end_day
        FROM UNNEST(tasks) task WITH OFFSET pos ORDER BY pos),
      domain, context_text, task_groupings, CURRENT_TIMESTAMP()
    FROM ${bqTable("cuebook_revisions")} WHERE id = @revision;
    CREATE TEMP TABLE saved AS SELECT ${projection} FROM ${bqTable("cuebooks")} WHERE id = @id AND owner_user_id = @owner;
    COMMIT TRANSACTION;
    SELECT * FROM saved;
  `, { owner, id, revision: revisionId }, async () => {
    const saved = await getCuebook(owner, id);
    if (!saved) throw new Error("Committed Cuebook is unavailable");
    return [saved];
  });
  return rows[0];
}
