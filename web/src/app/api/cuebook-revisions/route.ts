import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { publishCuebookRevision } from "@/lib/shelves";
import { publishCuebookRevisionSchema } from "@/lib/schema";
import { dataApiError } from "@/lib/bq-store";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireRegisteredUserId(request);
    const input = publishCuebookRevisionSchema.parse(await request.json());
    const result = await publishCuebookRevision(userId, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  return dataApiError(error);
}
