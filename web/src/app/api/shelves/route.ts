import { NextRequest, NextResponse } from "next/server";
import { optionalRequestUser, requireRegisteredUserId } from "@/lib/auth";
import { createShelf, listShelves } from "@/lib/shelves";
import { createShelfSchema } from "@/lib/schema";
import { setShelfMembership } from "@/lib/memberships";
import { dataApiError } from "@/lib/bq-store";

export async function GET(request: NextRequest) {
  try {
    const viewer = await optionalRequestUser(request);
    return NextResponse.json({ shelves: await listShelves(viewer?.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireRegisteredUserId(request);
    const input = createShelfSchema.parse(await request.json());
    const shelf = await createShelf(userId, input);
    await setShelfMembership(userId, shelf.id, true);
    return NextResponse.json({ shelf }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  return dataApiError(error);
}
