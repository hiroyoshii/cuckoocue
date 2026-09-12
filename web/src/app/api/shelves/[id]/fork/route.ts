import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { forkShelf } from "@/lib/shelves";
import { createShelfSchema } from "@/lib/schema";
import { z } from "zod";
import { setShelfMembership } from "@/lib/memberships";
import { dataApiError } from "@/lib/bq-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireRegisteredUserId(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const input = createShelfSchema.partial().extend({ operation_id: z.string().uuid(), expected_updated_at: z.string().datetime({ offset: true }) }).parse(body);
    const shelf = await forkShelf(userId, id, input);
    await setShelfMembership(userId, shelf.id, true);
    return NextResponse.json({ shelf }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  return dataApiError(error);
}
