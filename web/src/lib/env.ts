export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const cueEnv = {
  projectId: () =>
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "cuckoocue",
  dataset: () => optionalEnv("CUE_BIGQUERY_DATASET", "cuckoo_cue"),
  table: () => optionalEnv("CUE_BIGQUERY_TABLE", "task_list_entries"),
  allowDevAuth: () => process.env.CUE_ALLOW_DEV_AUTH === "true",
  memoryBankStreamId: () =>
    optionalEnv("CUE_MEMORY_BANK_STREAM_ID", "cuckoo-cue-user-profile"),
  memoryProfileSchemaId: () =>
    optionalEnv("CUE_MEMORY_PROFILE_SCHEMA_ID", "cuckoo-user-profile"),
  googleCloudLocation: () => optionalEnv("GOOGLE_CLOUD_LOCATION", "asia-northeast1"),
  memoryBankName: () =>
    process.env.CUE_MEMORY_BANK_NAME ||
    `projects/${cueEnv.projectId()}/locations/${cueEnv.googleCloudLocation()}/reasoningEngines/${requiredEnv("GOOGLE_CLOUD_AGENT_ENGINE_ID")}`,
};
