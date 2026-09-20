import { NextRequest, NextResponse } from "next/server";
import { optionalRequestUser, requireRegisteredUserId } from "@/lib/auth";
import { getShelfDetail, updateShelf } from "@/lib/shelves";
import { updateShelfSchema } from "@/lib/schema";
import { dataApiError } from "@/lib/bq-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const viewer = await optionalRequestUser(request);
    const shelf = await getShelfDetail(id, viewer?.id);
    if (!shelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }
    return NextResponse.json({ shelf });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireRegisteredUserId(request);
    const { id } = await context.params;
    const input = updateShelfSchema.parse(await request.json());
    const shelf = await updateShelf(userId, id, input);
    return NextResponse.json({ shelf });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  return dataApiError(error);
}
