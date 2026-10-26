import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { getShelfMemberships } from "@/lib/memberships";
import { dataApiError } from "@/lib/bq-store";
import { listPersonalShelves } from "@/lib/shelves";

export async function GET(request: NextRequest) {
  try {
    const owner = await requireRegisteredUserId(request);
    const shelfIds = await getShelfMemberships(owner);
    return NextResponse.json({
      shelf_ids: shelfIds,
      shelves: await listPersonalShelves(owner, shelfIds),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return dataApiError(error); }
}
