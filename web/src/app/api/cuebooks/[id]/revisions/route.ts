import { NextRequest } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { bqRead, bqTable, dataApiError } from "@/lib/bq-store";
import { getCuebook } from "@/lib/cuebooks";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRegisteredUserId(request);
    const { id } = await context.params;
    if (!await getCuebook(owner, id)) return Response.json({ error: "原本が見つかりません。" }, { status: 404 });
    const revisions = await bqRead(`WITH placements AS (
      SELECT item.revision_id, ARRAY_AGG(STRUCT(s.id, s.title) ORDER BY s.title, s.id) AS shelves
      FROM ${bqTable("shelves")} s CROSS JOIN UNNEST(s.items) item GROUP BY item.revision_id
    ) SELECT r.id, r.title,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', r.created_at) AS published_at,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ', r.withdrawn_at) AS withdrawn_at,
      IFNULL(placements.shelves, []) AS shelves
      FROM ${bqTable("cuebook_revisions")} r LEFT JOIN placements ON placements.revision_id = r.id
      WHERE r.source_cuebook_id = @id AND r.owner_user_id = @owner ORDER BY r.created_at DESC, r.id`, { id, owner });
    return Response.json({ revisions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return dataApiError(error); }
}
