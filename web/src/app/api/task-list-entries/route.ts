import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { insertTaskListEntry } from "@/lib/bigquery";
import { saveTaskListSchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const input = saveTaskListSchema.parse(await request.json());
    const entry = await insertTaskListEntry(userId, input);

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof Response) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 400 });
}
