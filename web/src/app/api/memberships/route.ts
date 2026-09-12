import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { getShelfMemberships } from "@/lib/memberships";
import { dataApiError } from "@/lib/bq-store";

export async function GET(request: NextRequest) {
  try {
    const owner = await requireRegisteredUserId(request);
    return NextResponse.json({ shelf_ids: await getShelfMemberships(owner) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return dataApiError(error); }
}
