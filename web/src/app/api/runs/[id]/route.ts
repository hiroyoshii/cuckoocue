import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { adminFirestore } from "@/lib/firebase-admin";
import { completedRunToSaveDraft, syncedRunSnapshotSchema } from "@/lib/synced-run";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireRegisteredUserId(request);
    const { id } = await context.params;
    const run = syncedRunSnapshotSchema.parse(await request.json());
    if (run.id !== id) {
      return NextResponse.json({ error: "Run id does not match the path" }, { status: 400 });
    }

    await runDocument(userId, id).set({
      ...run,
      synced_at: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ runId: id });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireRegisteredUserId(request);
    const { id } = await context.params;
    const snapshot = await runDocument(userId, id).get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    const run = syncedRunSnapshotSchema.parse(snapshot.data());
    return NextResponse.json({ run: completedRunToSaveDraft(run) });
  } catch (error) {
    return errorResponse(error);
  }
}

function runDocument(userId: string, runId: string) {
  return adminFirestore().collection("users").doc(userId).collection("runs").doc(runId);
}

function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message === "完了したリストだけを残せます。" ? 409 : 400;
  return NextResponse.json({ error: message }, { status });
}
