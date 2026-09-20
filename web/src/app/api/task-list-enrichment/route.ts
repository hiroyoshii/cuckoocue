import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { enrichTaskList } from "@/lib/task-list-enrichment";
import { assertPublicCorpusSafe, UnsafeCorpusContentError } from "@/lib/public-corpus-safety";
import { taskListDraftSchema } from "@/lib/schema";
import { activeDomainLabels } from "@/lib/domain-catalog";

export async function POST(request: NextRequest) {
  try {
    await requireRegisteredUserId(request);
    const input = taskListDraftSchema.parse(await request.json());
    assertPublicCorpusSafe(input);
    const enrichment = await enrichTaskList(input, activeDomainLabels());

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
