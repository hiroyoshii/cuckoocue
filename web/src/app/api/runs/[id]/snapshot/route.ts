import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { adminFirestore } from "@/lib/firebase-admin";
import { syncedRunSnapshotSchema } from "@/lib/synced-run";
import { runEtag } from "@/lib/run-etag";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireRegisteredUserId(request);
    const { id } = await context.params;
    if (!id || id.length > 128 || id.includes("/")) return NextResponse.json({ error: "リストの指定が不正です。" }, { status: 400 });
    const snapshot = await adminFirestore().collection("users").doc(userId).collection("runs").doc(id).get();
    if (!snapshot.exists) return NextResponse.json({ error: "リストが見つかりません。" }, { status: 404 });
    const run = syncedRunSnapshotSchema.parse(snapshot.data());
    return NextResponse.json({ run }, { headers: { "Cache-Control": "private, no-store", ETag: runEtag(run) } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("run_snapshot_read_failed", error);
    return NextResponse.json({ error: "リストを読み込めませんでした。" }, { status: 503 });
  }
}
