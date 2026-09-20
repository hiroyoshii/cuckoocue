import type { CreateShelfInput, PublishCuebookRevisionInput, UpdateShelfInput } from "./schema";
import { bqRead, bqTable, bqWrite } from "./bq-store";
import { getCuebook } from "./cuebooks";
import { embedText, buildTaskListContextEmbeddingText } from "./task-list-embeddings";
import { buildSearchText } from "./search-text";
import { invalidateTaskListDomains } from "./bigquery";
import { assertPublicCorpusSafe } from "./public-corpus-safety";

export type PublicRevisionTask = {
  id: string; title: string; default_priority: number | null;
  relative_start_day: number | null; relative_end_day: number | null;
};
export type PublicRevisionSummary = {
  id: string; title: string; tasks: PublicRevisionTask[];
  published_at: string; withdrawn_at: string | null;
};
export type PublicRevisionDetail = PublicRevisionSummary & {
  domain: string | null;
  context_text: string | null;
  task_groupings: { label: string; task_offsets: number[] }[] | null;
  shelves: { id: string; title: string }[];
};
export type ShelfSummary = {
  id: string; title: string; context: string; forked_from_shelf_id: string | null;
  is_owned: boolean; created_at: string; updated_at: string; item_count: number;
};
export type ShelfDetail = ShelfSummary & {
  items: Array<{ revision_id: string; position: number; revision: PublicRevisionSummary }>;
};
const shelfColumns = (ownerExpression: string) => `id, title, context, forked_from_shelf_id, ${ownerExpression} AS is_owned,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', created_at) AS created_at,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', updated_at) AS updated_at,
  ARRAY_LENGTH(items) AS item_count`;
const revisionColumns = `id, title,
  ARRAY(SELECT AS STRUCT t.id, t.text AS title, t.default_priority, t.relative_start_day, t.relative_end_day FROM UNNEST(tasks) t WITH OFFSET pos ORDER BY pos) AS tasks,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', created_at) AS published_at,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', withdrawn_at) AS withdrawn_at`;

export async function listShelves(viewer = ""): Promise<ShelfSummary[]> {
  return bqRead(`SELECT ${shelfColumns("created_by = @viewer")} FROM ${bqTable("shelves")} ORDER BY updated_at DESC`, { viewer });
}
export async function createShelf(owner: string, input: CreateShelfInput): Promise<ShelfSummary> {
  assertPublicCorpusSafe({ title: input.title, context_text: input.context, tasks: [] });
  const rows = await bqWrite<ShelfSummary>(owner, `shelf-create:${input.operation_id}`, input, `
    BEGIN TRANSACTION;
    ASSERT NOT EXISTS(SELECT 1 FROM ${bqTable("shelves")} WHERE id = @id) AS 'CUE_CONFLICT';
    INSERT INTO ${bqTable("shelves")} (id, title, context, created_by, created_at, updated_at, items)
    VALUES (@id, @title, @context, @owner, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), []);
    CREATE TEMP TABLE saved AS SELECT ${shelfColumns("TRUE")} FROM ${bqTable("shelves")} WHERE id = @id;
    COMMIT TRANSACTION;
    SELECT * FROM saved;
  `, { id: input.operation_id, owner, title: input.title, context: input.context }, async () => {
    const saved = await getShelfDetail(input.operation_id, owner);
    if (!saved) throw new Error("Committed Shelf is unavailable");
    return [saved];
  });
  return rows[0];
}

export async function getShelfDetail(id: string, viewer = ""): Promise<ShelfDetail | null> {
  const rows = await bqRead<ShelfDetail>(`
    WITH revisions AS (SELECT ${revisionColumns} FROM ${bqTable("cuebook_revisions")}),
    base AS (SELECT ${shelfColumns("created_by = @viewer")} FROM ${bqTable("shelves")} WHERE id = @id),
    placements AS (
      SELECT s.id AS shelf_id, ARRAY_AGG(STRUCT(i.revision_id, i.position, r AS revision) ORDER BY i.position) AS items
      FROM ${bqTable("shelves")} s CROSS JOIN UNNEST(s.items) i JOIN revisions r ON r.id = i.revision_id
      WHERE s.id = @id GROUP BY s.id
    ) SELECT base.*, IFNULL(placements.items, []) AS items FROM base LEFT JOIN placements ON shelf_id = base.id`, { id, viewer });
  const shelf = rows[0] ?? null;
  if (shelf && shelf.item_count !== shelf.items.length) {
    throw Response.json({ error: "グループの公開版をすべて取得できませんでした。" }, { status: 503 });
  }
  return shelf;
}

export async function updateShelf(owner: string, id: string, input: UpdateShelfInput): Promise<ShelfDetail> {
  assertPublicCorpusSafe({ title: input.title ?? "", context_text: input.context ?? "", tasks: [] });
  if (input.items && new Set(input.items.map((item) => item.revision_id)).size !== input.items.length) {
    throw Response.json({ error: "同じ公開版を重複して配置できません。" }, { status: 400 });
  }
  await bqWrite(owner, `shelf-update:${input.operation_id}`, { id, ...input }, `
    BEGIN TRANSACTION;
    ASSERT EXISTS(SELECT 1 FROM ${bqTable("shelves")} WHERE id = @id AND created_by = @owner) AS 'CUE_NOT_FOUND';
    ${input.items ? `ASSERT NOT EXISTS(SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(@input, '$.items')) item
      WHERE NOT EXISTS(SELECT 1 FROM ${bqTable("cuebook_revisions")} r
        WHERE r.id = JSON_VALUE(item, '$.revision_id') AND (r.withdrawn_at IS NULL OR EXISTS(
          SELECT 1 FROM ${bqTable("shelves")} s CROSS JOIN UNNEST(s.items) existing
          WHERE s.id = @id AND existing.revision_id = r.id)))) AS 'CUE_NOT_FOUND';` : ""}
    UPDATE ${bqTable("shelves")} SET
      title = COALESCE(JSON_VALUE(@input, '$.title'), title), context = COALESCE(JSON_VALUE(@input, '$.context'), context),
      ${input.items ? `items = ARRAY(SELECT AS STRUCT JSON_VALUE(item, '$.revision_id') AS revision_id, pos AS position
        FROM UNNEST(JSON_QUERY_ARRAY(@input, '$.items')) item WITH OFFSET pos ORDER BY pos),` : ""}
      updated_at = CURRENT_TIMESTAMP()
    WHERE id = @id AND created_by = @owner AND updated_at = TIMESTAMP(@expected);
    ASSERT @@row_count = 1 AS 'CUE_CONFLICT';
    COMMIT TRANSACTION;
    SELECT @id AS id;
  `, { owner, id, input: JSON.stringify(input), expected: input.expected_updated_at });
  return (await getShelfDetail(id, owner))!;
}

export async function publishCuebookRevision(owner: string, input: PublishCuebookRevisionInput) {
  const cuebook = await getCuebook(owner, input.source_cuebook_id);
  if (!cuebook) throw Response.json({ error: "原本が見つかりません。" }, { status: 404 });
  const confirmedTasks = input.tasks.map((t) => [t.title, t.default_priority ?? null, t.relative_start_day ?? null, t.relative_end_day ?? null]);
  const savedTasks = cuebook.tasks.map((t) => [t.text, t.default_priority ?? null, t.relative_start_day ?? null, t.relative_end_day ?? null]);
  const existing = await getRevisionById(input.revision_id);
  if (!existing && (cuebook.updated_at !== input.expected_source_updated_at || cuebook.title !== input.title || JSON.stringify(confirmedTasks) !== JSON.stringify(savedTasks) || !cuebook.enrichment)) {
    throw Response.json({ error: "保存済み原本と確認内容が異なります。先に自分用に保存してください。" }, { status: 409 });
  }
  const enrichment = cuebook.enrichment;
  if (!existing) assertPublicCorpusSafe({ ...cuebook, ...enrichment });
  const embedding = existing ? [] : await embedText(buildTaskListContextEmbeddingText(cuebook, enrichment!), "RETRIEVAL_DOCUMENT");
  const searchText = buildSearchText(cuebook, {
    domain: enrichment?.domain ?? "",
    context_text: enrichment?.context_text ?? "",
    task_groupings: enrichment?.task_groupings ?? [],
  });
  await bqWrite(owner, `publish:${input.revision_id}`, input, `
    BEGIN TRANSACTION;
    ASSERT EXISTS(SELECT 1 FROM ${bqTable("cuebooks")} WHERE id = @source AND owner_user_id = @owner AND updated_at = TIMESTAMP(@expected)) AS 'CUE_CONFLICT';
    ASSERT NOT EXISTS(SELECT 1 FROM ${bqTable("cuebook_revisions")} WHERE id = @id) AS 'CUE_CONFLICT';
    UPDATE ${bqTable("shelves")} SET items = ARRAY_CONCAT(items, [STRUCT(@id AS revision_id, ARRAY_LENGTH(items) AS position)]), updated_at = CURRENT_TIMESTAMP()
    WHERE id = @shelf AND created_by = @owner AND ARRAY_LENGTH(items) < 80;
    ASSERT @@row_count = 1 AS 'CUE_CONFLICT';
    INSERT INTO ${bqTable("cuebook_revisions")} (id, owner_user_id, source_cuebook_id, title, tasks, domain, context_text, task_groupings, search_text, context_embedding, created_at)
    SELECT @id, @owner, id, title, tasks, domain, context_text, task_groupings, @searchText,
      ARRAY(SELECT CAST(v AS FLOAT64) FROM UNNEST(JSON_VALUE_ARRAY(@embedding)) v), CURRENT_TIMESTAMP()
    FROM ${bqTable("cuebooks")} WHERE id = @source AND owner_user_id = @owner;
    COMMIT TRANSACTION;
    SELECT @id AS id;
  `, { owner, id: input.revision_id, source: cuebook.id, expected: input.expected_source_updated_at, shelf: input.shelf_id, searchText, embedding: JSON.stringify(embedding) });
  invalidateTaskListDomains();
  return { revision: (await getRevisionById(input.revision_id))!, shelf: (await getShelfDetail(input.shelf_id, owner))! };
}

export async function forkShelf(owner: string, sourceId: string, input: { operation_id: string; expected_updated_at: string; title?: string; context?: string }): Promise<ShelfDetail> {
  assertPublicCorpusSafe({ title: input.title ?? "", context_text: input.context ?? "", tasks: [] });
  await bqWrite(owner, `shelf-fork:${input.operation_id}`, { sourceId, ...input }, `
    BEGIN TRANSACTION;
    ASSERT EXISTS(SELECT 1 FROM ${bqTable("shelves")} WHERE id = @source AND updated_at = TIMESTAMP(@expected)) AS 'CUE_CONFLICT';
    ASSERT NOT EXISTS(SELECT 1 FROM ${bqTable("shelves")} WHERE id = @id) AS 'CUE_CONFLICT';
    INSERT INTO ${bqTable("shelves")} (id, title, context, forked_from_shelf_id, created_by, created_at, updated_at, items)
    SELECT @id, COALESCE(NULLIF(@title, ''), title), COALESCE(NULLIF(@context, ''), context), id, @owner, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), items
    FROM ${bqTable("shelves")} WHERE id = @source;
    COMMIT TRANSACTION;
    SELECT @id AS id;
  `, { owner, id: input.operation_id, source: sourceId, expected: input.expected_updated_at, title: input.title ?? "", context: input.context ?? "" });
  return (await getShelfDetail(input.operation_id, owner))!;
}

export async function getRevisionById(id: string): Promise<PublicRevisionSummary | null> {
  const rows = await bqRead<PublicRevisionSummary>(`SELECT ${revisionColumns} FROM ${bqTable("cuebook_revisions")} WHERE id = @id LIMIT 1`, { id });
  return rows[0] ?? null;
}

export async function getPublicRevisionDetail(id: string): Promise<PublicRevisionDetail | null> {
  const rows = await bqRead<PublicRevisionDetail>(`
    SELECT ${revisionColumns}, domain, context_text, task_groupings,
      ARRAY(
        SELECT AS STRUCT s.id, s.title FROM ${bqTable("shelves")} s
        WHERE EXISTS(SELECT 1 FROM UNNEST(s.items) item WHERE item.revision_id = @id)
        ORDER BY s.title, s.id
      ) AS shelves
    FROM ${bqTable("cuebook_revisions")} WHERE id = @id LIMIT 1`, { id });
  return rows[0] ?? null;
}
