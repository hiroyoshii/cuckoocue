import { createHash } from "node:crypto";
import { BigQuery, type Query } from "@google-cloud/bigquery";
import { cueEnv } from "./env";
import { withRetry } from "./resilience";

const client = new BigQuery({ projectId: cueEnv.projectId() });
const location = () => cueEnv.googleCloudLocation();
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function bqTable(name: "cuebooks" | "cuebook_revisions" | "shelves") {
  const project = cueEnv.projectId();
  const dataset = cueEnv.dataset();
  if (!/^[a-zA-Z0-9_-]+$/.test(project) || !/^\w+$/.test(dataset)) throw new Error("Invalid BigQuery configuration");
  return `\`${project}.${dataset}.${name}\``;
}

export async function bqRead<T>(query: string, params: Query["params"] = {}): Promise<T[]> {
  const [rows] = await withRetry(() => client.query({ query, params, location: location(), jobTimeoutMs: 30_000 }), { timeoutMs: 40_000 });
  return rows as T[];
}

// A stable job ID prevents concurrent retries of an INSERT from creating two rows.
// BigQuery does not enforce primary-key uniqueness, even inside a transaction.
export async function bqWrite<T>(owner: string, operation: string, input: unknown, query: string, params: Query["params"]): Promise<T[]> {
  const id = `cue_write_${digest([owner, operation])}`;
  const fingerprint = digest(input).slice(0, 63);
  const job = client.job(id, { location: location() });
  await withRetry(async () => {
    try {
      await client.createQueryJob({ jobId: id, query, params, location: location(), jobTimeoutMs: 60_000, labels: { cue_request: fingerprint } });
    } catch (error) {
      if ((error as { code?: number }).code !== 409) throw error;
    }
    const [metadata] = await job.getMetadata();
    if (metadata.configuration?.labels?.cue_request !== fingerprint) throw Response.json({ error: "同じ保存操作の内容が変わっています。保存結果を確認してください。" }, { status: 409 });
  }, { timeoutMs: 40_000 });
  const [rows] = await withRetry(() => job.getQueryResults(), { timeoutMs: 70_000 });
  return rows as T[];
}

export function dataApiError(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof Error && error.name === "ZodError") return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  if (error instanceof Error && error.name === "UnsafeCorpusContentError") return Response.json({ error: error.message }, { status: 422 });
  const message = error instanceof Error ? error.message : "";
  if (message.includes("CUE_NOT_FOUND")) return Response.json({ error: "対象が見つかりません。" }, { status: 404 });
  if (/CUE_CONFLICT|concurrent update|serialization/i.test(message)) return Response.json({ error: "別の変更が保存されています。入力は残っています。保存済みの内容を確認してください。" }, { status: 409 });
  console.error("Data operation failed", error);
  return Response.json({ error: "保存先に接続できませんでした。再試行してください。" }, { status: 503 });
}
