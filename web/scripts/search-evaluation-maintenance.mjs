import assert from "node:assert/strict";
import { BigQuery } from "@google-cloud/bigquery";

export async function cleanEvaluationShelf({ dataset, shelfId, owner, apply = false }) {
  assert.equal(dataset, "cuckoo_cue_search_evaluation_v2", "Never maintain production Shelves with fixture tooling");
  assert.match(owner, /^search-evaluation-/);
  const bq = new BigQuery({ projectId: "cuckoocue" });
  const shelves = `\`cuckoocue.${dataset}.shelves\``;
  const revisions = `\`cuckoocue.${dataset}.cuebook_revisions\``;
  const query = `WITH inspected AS (SELECT s.id, ARRAY_AGG(STRUCT(i.revision_id, i.position,
    r.owner_user_id, r.withdrawn_at) ORDER BY i.position) AS inspected
    FROM ${shelves} s CROSS JOIN UNNEST(s.items) i LEFT JOIN ${revisions} r ON r.id = i.revision_id
    WHERE s.id = @id AND s.created_by = @owner GROUP BY s.id)
    SELECT s.*, IFNULL(inspected.inspected, []) AS inspected FROM ${shelves} s
    LEFT JOIN inspected USING(id) WHERE s.id = @id AND s.created_by = @owner`;
  const options = { location: "asia-northeast1", params: { id: shelfId, owner } };
  const [rows] = await bq.query({ ...options, query });
  assert.equal(rows.length, 1);
  const before = rows[0];
  assert.ok(before.inspected.every(item => item.owner_user_id === owner), "Unexpected or missing revision: inspect manually");
  const removed = before.inspected.filter(item => item.withdrawn_at).map(item => item.revision_id);
  const retained = before.inspected.filter(item => !item.withdrawn_at).map(item => item.revision_id);
  const evidence = { dataset, shelfId, owner, apply, before, removed, retained, updated: 0 };
  if (apply && removed.length) {
    const [result] = await bq.query({ ...options, query: `
      BEGIN TRANSACTION;
      ASSERT NOT EXISTS(SELECT 1 FROM UNNEST(JSON_VALUE_ARRAY(@removed)) removed_id
        LEFT JOIN ${revisions} r ON r.id = removed_id
        WHERE r.id IS NULL OR r.owner_user_id != @owner OR r.withdrawn_at IS NULL) AS 'Fixture changed';
      UPDATE ${shelves} SET items = ARRAY(SELECT AS STRUCT id AS revision_id, position
        FROM UNNEST(JSON_VALUE_ARRAY(@retained)) id WITH OFFSET position ORDER BY position), updated_at = CURRENT_TIMESTAMP()
      WHERE id = @id AND created_by = @owner AND updated_at = TIMESTAMP(@expected);
      ASSERT @@row_count = 1 AS 'Concurrent Shelf update';
      COMMIT TRANSACTION;
      SELECT 1 AS updated;`, params: { ...options.params, expected: before.updated_at.value, removed: JSON.stringify(removed), retained: JSON.stringify(retained) } });
    evidence.updated = result[0].updated;
  }
  const [after] = await bq.query({ ...options, query });
  evidence.after = after[0];
  if (apply) assert.deepEqual(evidence.after.inspected.map(item => item.revision_id), retained);
  return evidence;
}
