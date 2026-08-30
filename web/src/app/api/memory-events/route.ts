import { after, NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { ingestMemoryEvent } from "@/lib/memory-bank";
import { memoryEventInputSchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const input = memoryEventInputSchema.parse(await request.json());

    after(async () => {
      await ingestMemoryEvent({
        eventId: input.event_id,
        userId,
        kind: input.kind,
        text: input.text,
        occurredAt: input.occurred_at,
      });
    });

    return NextResponse.json({ accepted: true });
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
