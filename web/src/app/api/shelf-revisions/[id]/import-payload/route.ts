import { NextRequest, NextResponse } from "next/server";
import { getRevisionById } from "@/lib/shelves";
import { isValidIsoDay } from "@/lib/run-transfer";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const targetAnchorDay = searchParams.get("target_anchor_day");
    if (!targetAnchorDay || !isValidIsoDay(targetAnchorDay)) {
      return NextResponse.json(
        { error: "A valid target_anchor_day is required" },
        { status: 400 },
      );
    }

    const revision = await getRevisionById(id);
    if (!revision) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }

    return NextResponse.json({
      importPayload: {
        version: 1,
        title: revision.title,
        target_anchor_day: targetAnchorDay,
        origin_revision_id: revision.id,
        tasks: revision.tasks,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 400 });
}
