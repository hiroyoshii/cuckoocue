import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getTaskListEntry } from "@/lib/bigquery";
import { isValidIsoDay } from "@/lib/run-transfer";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireUserId(request);
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const targetAnchorDay = searchParams.get("target_anchor_day");
    const entry = await getTaskListEntry(id);

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (!targetAnchorDay || !isValidIsoDay(targetAnchorDay)) {
      return NextResponse.json(
        { error: "A valid target_anchor_day is required" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      importPayload: {
        version: 1,
        title: entry.title,
        target_anchor_day: targetAnchorDay,
        tasks: entry.tasks.map((task) => ({
          title: task.text,
          default_priority: task.default_priority,
          relative_start_day: task.relative_start_day,
          relative_end_day: task.relative_end_day,
        })),
      },
    });
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
