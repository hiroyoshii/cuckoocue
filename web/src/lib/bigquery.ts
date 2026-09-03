import { BigQuery } from "@google-cloud/bigquery";
import { cueEnv } from "./env";
import {
  buildSearchContextEmbeddingText,
  buildTaskListContextEmbeddingText,
  embedText,
} from "./task-list-embeddings";
import { enrichTaskList } from "./task-list-enrichment";
import { withRetry } from "./resilience";
import type { SaveTaskListInput, TaskListEnrichment, TaskListEntry } from "./schema";

let bigQueryClient: BigQuery | null = null;
let domainCache: { expiresAt: number; domains: string[] } | null = null;
const BigQueryJobTimeoutMs = 30_000;
const BigQueryCallTimeoutMs = 35_000;

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
      : await enrichTaskList(input);
  const contextEmbedding = await embedText(
    buildTaskListContextEmbeddingText(input, enrichment),
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

export type SearchResult = TaskListEntry & {
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
  searchDomain: string | null,
  pageSize: number,
): Promise<SearchPage> {
  const explicitTokens = tokenize(message);
  const hasExplicitTokens = explicitTokens.length > 0;
  const requiredExplicitHits = hasExplicitTokens && explicitTokens.length >= 2 ? 2 : 1;
  const explicitTokensParam = hasExplicitTokens
    ? explicitTokens
    : ["__cuckoo_no_query_token__"];
  const explicitHitExpression = explicitTokensParam
    .map((_, index) => `IF(SEARCH(search_text, @explicitToken${index}), 1, 0)`)
    .join(" + ");
  const contextEmbedding = await embedText(
    buildSearchContextEmbeddingText(message, userProfileAttributes),
  );
  const searchDomainParam = searchDomain?.trim() || "__cuckoo_no_search_domain__";

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
        IFNULL(search_text, '') AS search_text,
        LOWER(IFNULL(domain, '')) = LOWER(@searchDomain) AS domain_matched
      FROM \`${cueEnv.projectId()}.${cueEnv.dataset()}.${cueEnv.table()}\`
      WHERE ARRAY_LENGTH(context_embedding) = ARRAY_LENGTH(@contextEmbedding)
    ),
    scored AS (
      SELECT
        *,
        (${explicitHitExpression}) AS explicit_hit_count,
        (
          SELECT SAFE_DIVIDE(
            SUM(document_value * context_value),
            SQRT(SUM(POW(document_value, 2))) * SQRT(SUM(POW(context_value, 2)))
          )
          FROM UNNEST(context_embedding) AS document_value WITH OFFSET document_position
          JOIN UNNEST(@contextEmbedding) AS context_value WITH OFFSET context_position
          ON document_position = context_position
        ) AS context_score
      FROM prepared
    )
    SELECT
      id,
      owner_user_id,
      title,
      tasks,
      domain,
      context_text,
      task_groupings,
      created_at,
      explicit_hit_count >= @requiredExplicitHits AS text_matched,
      IFNULL(context_score, 0) AS context_score
    FROM scored
    WHERE explicit_hit_count >= @requiredExplicitHits
       OR domain_matched
       OR @hasExplicitTokens = FALSE
    ORDER BY context_score DESC, created_at DESC
  `;

  const [job] = await withRetry(
    () =>
      bigQuery().createQueryJob({
        query,
        jobTimeoutMs: BigQueryJobTimeoutMs,
        location: cueEnv.googleCloudLocation(),
        params: {
          ...Object.fromEntries(
            explicitTokensParam.map((token, index) => [`explicitToken${index}`, token]),
          ),
          hasExplicitTokens,
          requiredExplicitHits,
          searchDomain: searchDomainParam,
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
): Promise<SearchPage> {
  const decoded = decodeSearchCursor(cursor);
  const job = bigQuery().job(decoded.jobId, {
    location: cueEnv.googleCloudLocation(),
  });
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
    FROM \`${cueEnv.projectId()}.${cueEnv.dataset()}.${cueEnv.table()}\`
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

export async function listTaskListDomains(): Promise<string[]> {
  const now = Date.now();
  if (domainCache && domainCache.expiresAt > now) {
    return domainCache.domains;
  }

  const query = `
    SELECT DISTINCT domain
    FROM \`${cueEnv.projectId()}.${cueEnv.dataset()}.${cueEnv.table()}\`
    WHERE domain IS NOT NULL
      AND TRIM(domain) != ''
    ORDER BY domain
  `;

  const [rows] = await withRetry(
    () =>
      bigQuery().query({
        query,
        jobTimeoutMs: BigQueryJobTimeoutMs,
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

export function tokenize(input: string): string[] {
  const stopWords = new Set([
    "ある",
    "い",
    "する",
    "した",
    "したい",
    "たい",
    "ため",
    "できる",
    "で",
    "と",
    "に",
    "の",
    "へ",
    "まとめ",
    "まとめる",
    "を",
  ]);
  const normalized = input.toLowerCase().normalize("NFKC");
  const segmenterConstructor = Intl as typeof Intl & {
    Segmenter?: new (
      locales: string[],
      options: { granularity: "word" },
    ) => {
      segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }>;
    };
  };
  const segmenter = segmenterConstructor.Segmenter
    ? new segmenterConstructor.Segmenter(["ja", "en"], { granularity: "word" })
    : null;
  const parts = segmenter
    ? Array.from(segmenter.segment(normalized))
        .filter((part) => part.isWordLike)
        .map((part) => part.segment)
    : normalized.split(/[^\p{Letter}\p{Number}]+/u);

  const tokens = parts
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .filter((part) => !stopWords.has(part));

  return Array.from(new Set(tokens)).slice(0, 64);
}

function buildSearchText(
  input: SaveTaskListInput,
  enrichment: { domain: string; context_text: string; task_groupings: { label: string }[] },
): string {
  return tokenize(
    [
      input.title,
      enrichment.domain,
      enrichment.context_text,
      ...enrichment.task_groupings.map((grouping) => grouping.label),
      ...input.tasks.map((task) => task.text),
    ].join("\n"),
  ).join(" ");
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
