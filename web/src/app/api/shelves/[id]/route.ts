import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { getShelfDetail, updateShelf } from "@/lib/shelves";
import { updateShelfSchema } from "@/lib/schema";
import { dataApiError } from "@/lib/bq-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const shelf = await getShelfDetail(id);
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
