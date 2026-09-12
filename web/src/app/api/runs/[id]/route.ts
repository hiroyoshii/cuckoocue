import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { adminFirestore } from "@/lib/firebase-admin";
import { completedRunToSaveDraft, syncedRunSnapshotSchema } from "@/lib/synced-run";
import { runEtag } from "@/lib/run-etag";
import { dataApiError } from "@/lib/bq-store";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireRegisteredUserId(request);
    const { id } = await context.params;
    const run = syncedRunSnapshotSchema.parse(await request.json());
    if (run.id !== id) {
      return NextResponse.json({ error: "Run id does not match the path" }, { status: 400 });
    }

    const etag = runEtag(run);
    const ref = runDocument(userId, id);
    await adminFirestore().runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (current.exists) {
        const currentTag = runEtag(syncedRunSnapshotSchema.parse(current.data()));
        if (currentTag === etag) return;
        if (request.headers.get("if-match") !== currentTag) throw Response.json({ error: "別の変更が保存されています。同期前の版を確認してください。" }, { status: 409 });
      } else if (request.headers.has("if-match")) {
        throw Response.json({ error: "同期先のリストが見つかりません。" }, { status: 409 });
      }
      transaction.set(ref, { ...run, synced_at: FieldValue.serverTimestamp() }, { merge: true });
    });
    return NextResponse.json({ runId: id }, { headers: { ETag: etag } });
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
  if (error instanceof Error && error.message === "完了したリストだけを残せます。") return NextResponse.json({ error: error.message }, { status: 409 });
  return dataApiError(error);
}
