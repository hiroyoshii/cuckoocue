import { NextRequest, NextResponse } from "next/server";
import { optionalRequestUser, requireRegisteredUserId } from "@/lib/auth";
import { createShelf, listShelves } from "@/lib/shelves";
import { createShelfSchema } from "@/lib/schema";
import { setShelfMembership } from "@/lib/memberships";
import { dataApiError } from "@/lib/bq-store";

export async function GET(request: NextRequest) {
  try {
    const viewer = await optionalRequestUser(request);
    const page = await listShelves(viewer?.id, request.nextUrl.searchParams.get("cursor") ?? "");
    return NextResponse.json(page, { headers: viewer
      ? { "Cache-Control": "private, no-store", Vary: "Authorization" }
      : { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", Vary: "Authorization" } });
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
