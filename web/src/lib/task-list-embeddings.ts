import { GoogleAuth } from "google-auth-library";
import { cueEnv } from "./env";
import { withRetry } from "./resilience";

import type {
  SaveTaskListInput,
  TaskListEnrichment,
  TaskListEntry,
} from "./schema";

type PredictEmbeddingsResponse = {
  predictions?: Array<{
    embeddings?: {
      values?: number[];
    };
  }>;
};

let authClient: GoogleAuth | null = null;

function googleAuth() {
  authClient ??= new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  return authClient;
}

export async function embedText(text: string): Promise<number[]> {
  const model = process.env.CUE_EMBEDDING_MODEL || "text-multilingual-embedding-002";
  const url = [
    `https://${cueEnv.googleCloudLocation()}-aiplatform.googleapis.com/v1`,
    `projects/${cueEnv.projectId()}`,
    `locations/${cueEnv.googleCloudLocation()}`,
    `publishers/google/models/${model}:predict`,
  ].join("/");

  const response = await withRetry(
    () =>
      googleAuth().request<PredictEmbeddingsResponse>({
        url,
        method: "POST",
        timeout: 5000,
        data: {
          instances: [{ content: text }],
        },
      }),
    { attempts: 2, timeoutMs: 7000, delayMs: 250 },
  );

  const values = response.data.predictions?.[0]?.embeddings?.values;
  if (!values?.length) {
    throw new Error("Embedding model returned no values");
  }

  return values;
}

export function buildTaskListContextEmbeddingText(
  input: SaveTaskListInput,
  enrichment: TaskListEnrichment,
) {
  return [
    `domain: ${enrichment.domain}`,
    `context: ${enrichment.context_text}`,
    "groups:",
    ...enrichment.task_groupings.map((grouping) => {
      const groupedTasks = grouping.task_offsets
        .map((offset) => input.tasks[offset]?.text)
        .filter(Boolean)
        .join(" / ");
      return `- ${grouping.label}: ${groupedTasks}`;
    }),
  ].join("\n");
}

export function buildSearchContextEmbeddingText(
  message: string,
  memoryFacts: string[],
) {
  return [
    `current situation: ${message}`,
    memoryFacts.length ? "user context:" : "",
    ...memoryFacts.map((fact) => `- ${fact}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTaskListEntryContextText(entry: TaskListEntry) {
  return [
    `domain: ${entry.domain ?? ""}`,
    `context: ${entry.context_text ?? ""}`,
    "groups:",
    ...(entry.task_groupings ?? []).map((grouping) => {
      const groupedTasks = grouping.task_offsets
        .map((offset) => entry.tasks[offset]?.text)
        .filter(Boolean)
        .join(" / ");
      return `- ${grouping.label}: ${groupedTasks}`;
    }),
  ].join("\n");
}
