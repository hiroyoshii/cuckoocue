import assert from "node:assert/strict";
import { BigQuery } from "@google-cloud/bigquery";
import { editorialOwner } from "../data/editorial-shelves.mjs";
import { managedDomainSeeds } from "../data/managed-domain-seeds.mjs";

const project = process.env.GOOGLE_CLOUD_PROJECT || "cuckoocue";
const dataset = process.env.CUE_BIGQUERY_DATASET || "cuckoo_cue";
const location = process.env.GOOGLE_CLOUD_LOCATION || "asia-northeast1";
const shouldAssert = process.argv.includes("--assert");
const managedOwner = "managed-domain-bootstrap-v1";
const managedRevisionIds = managedDomainSeeds.flatMap((domain) =>
  domain.revisions.map((revision) => `managed-${domain.id}-${revision.key}`));
assert.match(project, /^[\w-]+$/);
assert.match(dataset, /^\w+$/);

const client = new BigQuery({ projectId: project });
const cuebookTable = `\`${project}.${dataset}.cuebooks\``;
const revisionTable = `\`${project}.${dataset}.cuebook_revisions\``;
const shelfTable = `\`${project}.${dataset}.shelves\``;
const [rows] = await client.query({
  location,
  maximumBytesBilled: "1073741824",
  params: { managedOwner, editorialOwner, managedRevisionIds },
  query: `
    SELECT
      (SELECT COUNT(*) FROM ${revisionTable} WHERE owner_user_id = @managedOwner) AS managed_revisions,
      (SELECT COUNT(*) FROM ${revisionTable} WHERE owner_user_id = @managedOwner AND id IN UNNEST(@managedRevisionIds)) AS managed_expected_revision_ids,
      (SELECT COUNT(DISTINCT domain) FROM ${revisionTable} WHERE owner_user_id = @managedOwner) AS managed_domains,
      (SELECT COUNT(*) FROM ${cuebookTable} WHERE owner_user_id = @managedOwner) AS managed_cuebooks,
      (SELECT COUNT(*) FROM ${revisionTable} WHERE owner_user_id = @editorialOwner) AS editorial_revisions,
      (SELECT COUNT(*) FROM ${revisionTable} WHERE owner_user_id = @editorialOwner AND provenance IS NOT NULL) AS revisions_with_provenance,
      (SELECT COUNT(DISTINCT source_cuebook_id) FROM ${revisionTable} WHERE owner_user_id = @editorialOwner) AS editorial_revision_cuebooks,
      (SELECT COUNT(*) FROM ${cuebookTable} WHERE owner_user_id = @editorialOwner) AS editorial_cuebooks,
      (SELECT COUNT(*) FROM ${shelfTable} WHERE created_by = @editorialOwner) AS editorial_shelves,
      (SELECT COUNT(*) FROM ${shelfTable} WHERE created_by = @editorialOwner AND curation.is_default IS TRUE) AS default_shelves,
      (SELECT COALESCE(SUM(ARRAY_LENGTH(items)), 0) FROM ${shelfTable} WHERE created_by = @editorialOwner) AS editorial_placements
  `,
});
const summary = Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
if (shouldAssert) {
  assert.deepEqual(summary, {
    managed_revisions: 99,
    managed_expected_revision_ids: 99,
    managed_domains: 33,
    managed_cuebooks: 99,
    editorial_revisions: 30,
    revisions_with_provenance: 30,
    editorial_revision_cuebooks: 30,
    editorial_cuebooks: 30,
    editorial_shelves: 5,
    default_shelves: 5,
    editorial_placements: 30,
  });
}
console.log(JSON.stringify({ project, dataset, valid: shouldAssert ? true : undefined, ...summary }, null, 2));
