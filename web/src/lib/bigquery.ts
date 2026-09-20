import { BigQuery } from "@google-cloud/bigquery";
import { cueEnv } from "./env";
import { bqTable, digest } from "./bq-store";
import {
  buildSearchContextEmbeddingText,
  buildTaskListContextEmbeddingText,
  embedText,
} from "./task-list-embeddings";
import { enrichTaskList } from "./task-list-enrichment";
import { withRetry } from "./resilience";
import { buildSearchText } from "./search-text";
import { compileSearchPlan, type SearchPlan } from "./search-plan";
import type { SaveTaskListInput, TaskListEnrichment, TaskListEntry } from "./schema";
import { activeDomainLabels } from "./domain-catalog";

let bigQueryClient: BigQuery | null = null;
let domainCache: { expiresAt: number; domains: string[] } | null = null;
const BigQueryJobTimeoutMs = 30_000;
const BigQueryCallTimeoutMs = 35_000;
const SearchMaximumBytesBilled = "1073741824";

function bigQuery() {
  bigQueryClient ??= new BigQuery({ projectId: cueEnv.projectId() });
  return bigQueryClient;
}

export async function insertTaskListEntry(
  ownerUserId: string,
  input: SaveTaskListInput,
): Promise<TaskListEntry> {
  const existing = await getTaskListEntry(input.operation_id);
  if (existing) {
    if (existing.owner_user_id !== ownerUserId) {
      throw new Error("operation_id is already owned by another user");
    }
    return existing;
  }

  const enrichment: TaskListEnrichment =
    input.domain && input.context_text && input.task_groupings
      ? {
          domain: input.domain,
          context_text: input.context_text,
          task_groupings: input.task_groupings,
        }
      : await enrichTaskList(input, activeDomainLabels());
  const contextEmbedding = await embedText(
    buildTaskListContextEmbeddingText(input, enrichment),
    "RETRIEVAL_DOCUMENT",
  );
  const searchText = buildSearchText(input, enrichment);
  const row: TaskListEntry = {
    id: input.operation_id,
    owner_user_id: ownerUserId,
    title: input.title.trim(),
    tasks: input.tasks.map((task) => ({
      text: task.text.trim(),
      default_priority: task.default_priority ?? null,
      relative_start_day: task.relative_start_day ?? null,
      relative_end_day: task.relative_end_day ?? task.relative_start_day ?? null,
    })),
    domain: enrichment.domain,
    context_text: enrichment.context_text,
    task_groupings: enrichment.task_groupings,
    search_text: searchText,
    context_embedding: contextEmbedding,
    created_at: new Date().toISOString(),
  };

  await withRetry(
    () =>
      bigQuery().query({
        query: `
          MERGE \`${cueEnv.projectId()}.${cueEnv.dataset()}.${cueEnv.table()}\` AS target
          USING (
            SELECT
              @id AS id,
              @ownerUserId AS owner_user_id,
              @title AS title,
              @tasks AS tasks,
              @domain AS domain,
              @contextText AS context_text,
              @taskGroupings AS task_groupings,
              @searchText AS search_text,
              @contextEmbedding AS context_embedding,
              TIMESTAMP(@createdAt) AS created_at
          ) AS source
          ON target.id = source.id
          WHEN NOT MATCHED THEN
            INSERT (
              id, owner_user_id, title, tasks, domain, context_text,
              task_groupings, search_text, context_embedding, created_at
            )
            VALUES (
              source.id, source.owner_user_id, source.title, source.tasks,
              source.domain, source.context_text, source.task_groupings,
              source.search_text, source.context_embedding, source.created_at
            )
        `,
        jobTimeoutMs: BigQueryJobTimeoutMs,
        params: {
          id: row.id,
          ownerUserId: row.owner_user_id,
          title: row.title,
          tasks: row.tasks,
          domain: row.domain,
          contextText: row.context_text,
          taskGroupings: row.task_groupings,
          searchText: row.search_text,
          contextEmbedding: row.context_embedding,
          createdAt: row.created_at,
        },
      }),
    { attempts: 2, timeoutMs: BigQueryCallTimeoutMs, delayMs: 500 },
  );

  return row;
}

export type SearchResult = Omit<
  TaskListEntry,
  "owner_user_id" | "search_text" | "context_embedding"
> & {
  text_matched: boolean;
  context_score: number;
};

export type SearchPage = {
  results: SearchResult[];
  nextCursor: string | null;
};

export async function searchTaskListEntries(
  message: string,
  userProfileAttributes: string[],
  searchPlan: SearchPlan,
  pageSize: number,
  owner = "",
): Promise<SearchPage> {
  const filter = compileSearchPlan(searchPlan);
  // A null domain is a genuine no-match, not permission to search every domain.
  if (!filter.domain) return { results: [], nextCursor: null };
  const contextEmbedding = await embedText(
    buildSearchContextEmbeddingText(message, userProfileAttributes),
    "RETRIEVAL_QUERY",
  );

  const query = `
    WITH prepared AS (
      SELECT
        id,
        owner_user_id,
        title,
        tasks,
        domain,
        context_text,
        task_groupings,
        context_embedding,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', created_at) AS created_at,
        ARRAY_CONCAT(
          ARRAY(SELECT NORMALIZE_AND_CASEFOLD(task.text, NFKC) FROM UNNEST(tasks) task),
          ARRAY(SELECT NORMALIZE_AND_CASEFOLD(task_group.label, NFKC) FROM UNNEST(task_groupings) task_group
            WHERE EXISTS(SELECT 1 FROM UNNEST(task_group.task_offsets) task_offset WHERE task_offset >= 0 AND task_offset < ARRAY_LENGTH(tasks)))
        ) AS task_text,
        NORMALIZE_AND_CASEFOLD(CONCAT(IFNULL(title, ''), '\\n', IFNULL(context_text, ''), '\\n',
          ARRAY_TO_STRING(ARRAY(SELECT task.text FROM UNNEST(tasks) task), '\\n')), NFKC) AS context_search_text,
        TO_HEX(SHA256(TO_JSON_STRING(STRUCT(
          LOWER(TRIM(title)) AS title,
          ARRAY(
            SELECT LOWER(TRIM(task.text))
            FROM UNNEST(tasks) AS task WITH OFFSET task_position
            ORDER BY task_position
          ) AS task_texts
        )))) AS content_key
      FROM ${bqTable("cuebook_revisions")}
      WHERE withdrawn_at IS NULL
        AND domain = @searchDomain
        AND ARRAY_LENGTH(context_embedding) = ARRAY_LENGTH(@contextEmbedding)
    ),
    filtered AS (
      SELECT *, @hasTextConditions AS text_matched
      FROM prepared
      WHERE ${filter.predicate}
    ),
    scored AS (
      SELECT
        *,
        (
          SELECT SAFE_DIVIDE(
            SUM(document_value * context_value),
            SQRT(SUM(POW(document_value, 2))) * SQRT(SUM(POW(context_value, 2)))
          )
          FROM UNNEST(context_embedding) AS document_value WITH OFFSET document_position
          JOIN UNNEST(@contextEmbedding) AS context_value WITH OFFSET context_position
          ON document_position = context_position
        ) AS context_score
      FROM filtered
    )
    , related AS (
      SELECT item.revision_id, ARRAY_AGG(STRUCT(s.id, s.title) ORDER BY s.title, s.id) AS shelves
      FROM ${bqTable("shelves")} s CROSS JOIN UNNEST(s.items) item GROUP BY item.revision_id
    )
    SELECT scored.* EXCEPT(
      content_key, task_text, context_search_text,
      context_embedding, owner_user_id, context_score
    ),
      IFNULL(context_score, 0) AS context_score,
      IFNULL(related.shelves, []) AS shelves
    FROM scored LEFT JOIN related ON related.revision_id = scored.id
    ORDER BY context_score DESC, created_at DESC, scored.id
  `;

  const [job] = await withRetry(
    () =>
      bigQuery().createQueryJob({
        query,
        labels: { cue_kind: "public_search", cue_owner: digest(owner).slice(0, 63) },
        jobTimeoutMs: BigQueryJobTimeoutMs,
        maximumBytesBilled: SearchMaximumBytesBilled,
        location: cueEnv.googleCloudLocation(),
        params: {
          ...filter.params,
          hasTextConditions: filter.hasTextConditions,
          searchDomain: filter.domain,
          contextEmbedding,
        },
      }),
    { attempts: 2, timeoutMs: BigQueryCallTimeoutMs, delayMs: 500 },
  );
  const [rows, nextQuery] = await withRetry(
    () =>
      job.getQueryResults({
        autoPaginate: false,
        maxResults: pageSize,
      }),
    { attempts: 2, timeoutMs: BigQueryCallTimeoutMs, delayMs: 500 },
  );

  console.info(JSON.stringify({
    event: "search.executed",
    domain: searchPlan.domain,
    required_task_group_count: searchPlan.required_tasks.length,
    required_context_group_count: searchPlan.required_context.length,
    excluded_task_group_count: searchPlan.excluded_tasks.length,
    selected_profile_attribute_count: userProfileAttributes.length,
    job_id: job.id,
    first_page_count: rows.length,
  }));

  return {
    results: rows as SearchResult[],
    nextCursor:
      nextQuery?.pageToken && job.id
        ? encodeSearchCursor({ jobId: job.id, pageToken: nextQuery.pageToken })
        : null,
  };
}

export async function getSearchTaskListEntriesPage(
  cursor: string,
  pageSize: number,
  owner = "",
): Promise<SearchPage> {
  const decoded = decodeSearchCursor(cursor);
  const job = bigQuery().job(decoded.jobId, {
    location: cueEnv.googleCloudLocation(),
  });
  const [metadata] = await job.getMetadata();
  if (metadata.configuration?.labels?.cue_kind !== "public_search" || metadata.configuration?.labels?.cue_owner !== digest(owner).slice(0, 63)) {
    throw Response.json({ error: "検索結果の有効期限が切れました。再検索してください。" }, { status: 400 });
  }
  const [rows, nextQuery] = await withRetry(
    () =>
      job.getQueryResults({
        autoPaginate: false,
        maxResults: pageSize,
        pageToken: decoded.pageToken,
      }),
    { attempts: 2, timeoutMs: BigQueryCallTimeoutMs, delayMs: 500 },
  );

  return {
    results: rows as SearchResult[],
    nextCursor:
      nextQuery?.pageToken && job.id
        ? encodeSearchCursor({ jobId: job.id, pageToken: nextQuery.pageToken })
        : null,
  };
}

export async function getTaskListEntry(
  id: string,
): Promise<TaskListEntry | null> {
  const query = `
    SELECT
      id,
      owner_user_id,
      title,
      tasks,
      domain,
      context_text,
      task_groupings,
      search_text,
      context_embedding,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', created_at) AS created_at
    FROM ${bqTable("cuebook_revisions")}
    WHERE id = @id
    LIMIT 1
  `;

  const [rows] = await withRetry(
    () =>
      bigQuery().query({
        query,
        jobTimeoutMs: BigQueryJobTimeoutMs,
        params: { id },
      }),
    { attempts: 2, timeoutMs: BigQueryCallTimeoutMs, delayMs: 500 },
  );
  return (rows[0] as TaskListEntry | undefined) ?? null;
}

export function invalidateTaskListDomains() {
  domainCache = null;
}

export async function listTaskListDomains(): Promise<string[]> {
  const now = Date.now();
  if (domainCache && domainCache.expiresAt > now) {
    return domainCache.domains;
  }

  const candidates = activeDomainLabels();
  const query = `
    SELECT domain
    FROM ${bqTable("cuebook_revisions")}
    WHERE withdrawn_at IS NULL AND domain IN UNNEST(@candidates)
    GROUP BY domain
    ORDER BY domain
  `;

  const [rows] = await withRetry(
    () =>
      bigQuery().query({
        query,
        jobTimeoutMs: BigQueryJobTimeoutMs,
        maximumBytesBilled: SearchMaximumBytesBilled,
        params: { candidates },
      }),
    { attempts: 2, timeoutMs: BigQueryCallTimeoutMs, delayMs: 500 },
  );
  const domains = rows
    .map((row) => String(row.domain ?? "").trim())
    .filter(Boolean);

  domainCache = {
    expiresAt: now + 24 * 60 * 60 * 1000,
    domains,
  };

  return domains;
}

function encodeSearchCursor(value: { jobId: string; pageToken: string }): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeSearchCursor(cursor: string): { jobId: string; pageToken: string } {
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  if (
    !parsed ||
    typeof parsed.jobId !== "string" ||
    typeof parsed.pageToken !== "string"
  ) {
    throw new Error("Invalid search cursor");
  }
  return parsed;
}
