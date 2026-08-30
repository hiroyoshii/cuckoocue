import { BigQuery } from "@google-cloud/bigquery";

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "cuckoocue";
const datasetId = process.env.CUE_BIGQUERY_DATASET || "cuckoo_cue";
const tableId = process.env.CUE_BIGQUERY_TABLE || "task_list_entries";
const location = process.env.CUE_BIGQUERY_LOCATION || "asia-northeast1";

const bigquery = new BigQuery({ projectId });
const dataset = bigquery.dataset(datasetId);

const [datasetExists] = await dataset.exists();
if (!datasetExists) {
  await bigquery.createDataset(datasetId, { location });
  console.log(`Created dataset ${projectId}.${datasetId} in ${location}`);
}

const table = dataset.table(tableId);
const [tableExists] = await table.exists();
if (!tableExists) {
  await dataset.createTable(tableId, {
    schema: [
      { name: "id", type: "STRING", mode: "REQUIRED" },
      { name: "owner_user_id", type: "STRING", mode: "REQUIRED" },
      { name: "title", type: "STRING", mode: "REQUIRED" },
      {
        name: "tasks",
        type: "RECORD",
        mode: "REPEATED",
        fields: [
          { name: "text", type: "STRING", mode: "REQUIRED" },
          { name: "default_priority", type: "INT64", mode: "NULLABLE" },
          { name: "relative_start_day", type: "INT64", mode: "NULLABLE" },
          { name: "relative_end_day", type: "INT64", mode: "NULLABLE" },
        ],
      },
      { name: "domain", type: "STRING", mode: "NULLABLE" },
      { name: "context_text", type: "STRING", mode: "NULLABLE" },
      {
        name: "task_groupings",
        type: "RECORD",
        mode: "REPEATED",
        fields: [
          { name: "label", type: "STRING", mode: "REQUIRED" },
          { name: "task_offsets", type: "INT64", mode: "REPEATED" },
        ],
      },
      { name: "search_text", type: "STRING", mode: "NULLABLE" },
      { name: "context_embedding", type: "FLOAT64", mode: "REPEATED" },
      { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
    ],
  });
  console.log(`Created table ${projectId}.${datasetId}.${tableId}`);
} else {
  console.log(`Table already exists: ${projectId}.${datasetId}.${tableId}`);
}
