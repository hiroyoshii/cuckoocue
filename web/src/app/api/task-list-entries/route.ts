import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { insertTaskListEntry } from "@/lib/bigquery";
import { assertPublicCorpusSafe, UnsafeCorpusContentError } from "@/lib/public-corpus-safety";
import { saveTaskListSchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireRegisteredUserId(request);
    const input = saveTaskListSchema.parse(await request.json());
    assertPublicCorpusSafe(input);
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

  if (error instanceof UnsafeCorpusContentError) {
    return NextResponse.json(
      { error: error.message, unsafeLabels: error.labels },
      { status: 422 },
    );
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 400 });
}
