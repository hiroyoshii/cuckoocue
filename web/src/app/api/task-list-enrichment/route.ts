import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { enrichTaskList } from "@/lib/task-list-enrichment";
import { assertPublicCorpusSafe, UnsafeCorpusContentError } from "@/lib/public-corpus-safety";
import { saveTaskListSchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  try {
    await requireUserId(request);
    const input = saveTaskListSchema
      .pick({
        title: true,
        tasks: true,
      })
      .parse(await request.json());
    assertPublicCorpusSafe(input);
    const enrichment = await enrichTaskList(input);

    return NextResponse.json({ enrichment });
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
  return NextResponse.json({ error: message }, { status: 503 });
}
