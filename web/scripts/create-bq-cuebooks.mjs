import { BigQuery } from "@google-cloud/bigquery";

const project = process.env.GOOGLE_CLOUD_PROJECT || "cuckoocue";
const dataset = process.env.CUE_BIGQUERY_DATASET || "cuckoo_cue";
if (!/^[\w-]+$/.test(project) || !/^\w+$/.test(dataset)) throw new Error("Invalid dataset");
const client = new BigQuery({ projectId: project });
const location = process.env.CUE_BIGQUERY_LOCATION || "asia-northeast1";
const tasks = `ARRAY<STRUCT<id STRING, text STRING, default_priority INT64, relative_start_day INT64, relative_end_day INT64>>`;
const groups = `ARRAY<STRUCT<label STRING, task_offsets ARRAY<INT64>>>`;
const provenance = `STRUCT<origin_type STRING, curator_label STRING, context_mode STRING, reviewed_at TIMESTAMP,
  sources ARRAY<STRUCT<url STRING, title STRING, publisher STRING, source_type STRING, rights STRING>>>`;
if (!(await client.dataset(dataset).exists())[0]) await client.createDataset(dataset, { location });
await client.query({ location, query: `
  CREATE TABLE IF NOT EXISTS \`${project}.${dataset}.cuebooks\` (
    id STRING NOT NULL, owner_user_id STRING NOT NULL, origin_revision_id STRING,
    title STRING NOT NULL, tasks ${tasks}, domain STRING, context_text STRING,
    task_groupings ${groups}, updated_at TIMESTAMP NOT NULL
  ) CLUSTER BY owner_user_id, id;
  CREATE TABLE IF NOT EXISTS \`${project}.${dataset}.cuebook_revisions\` (
    id STRING NOT NULL, owner_user_id STRING NOT NULL, source_cuebook_id STRING NOT NULL,
    title STRING NOT NULL, tasks ${tasks}, domain STRING,
    context_text STRING, task_groupings ${groups}, search_text STRING,
    context_embedding ARRAY<FLOAT64>, provenance ${provenance}, created_at TIMESTAMP NOT NULL, withdrawn_at TIMESTAMP
  ) CLUSTER BY domain, source_cuebook_id;
  ALTER TABLE \`${project}.${dataset}.cuebook_revisions\` DROP COLUMN IF EXISTS revision;
  ALTER TABLE \`${project}.${dataset}.cuebook_revisions\` ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMP;
  ALTER TABLE \`${project}.${dataset}.cuebook_revisions\` ADD COLUMN IF NOT EXISTS provenance ${provenance};
  CREATE TABLE IF NOT EXISTS \`${project}.${dataset}.shelves\` (
    id STRING NOT NULL, title STRING NOT NULL, context STRING NOT NULL,
    forked_from_shelf_id STRING, created_by STRING NOT NULL,
    created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL,
    items ARRAY<STRUCT<revision_id STRING, position INT64>>,
    curation STRUCT<is_default BOOL, curator_label STRING, reviewed_at TIMESTAMP>
  ) CLUSTER BY created_by, id;
  ALTER TABLE \`${project}.${dataset}.shelves\` ADD COLUMN IF NOT EXISTS curation
    STRUCT<is_default BOOL, curator_label STRING, reviewed_at TIMESTAMP>;
` });
console.log(`Verified Cuebook/Revision/Shelf tables in ${project}.${dataset} (${location}); existing tables were not reset.`);
