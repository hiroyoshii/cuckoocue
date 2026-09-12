import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRegisteredUserId } from "@/lib/auth";
import { setShelfMembership } from "@/lib/memberships";
import { getShelfDetail } from "@/lib/shelves";
import { dataApiError } from "@/lib/bq-store";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRegisteredUserId(request);
    const { id } = await context.params;
    const { joined } = z.object({ joined: z.boolean() }).strict().parse(await request.json());
    if (joined && !(await getShelfDetail(id))) return NextResponse.json({ error: "グループが見つかりません。" }, { status: 404 });
    await setShelfMembership(owner, id, joined);
    return NextResponse.json({ id, joined });
  } catch (error) { return dataApiError(error); }
}
