import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { adminFirestore } from "@/lib/firebase-admin";
import { reuseCompletedRun, reuseCompletedRunSchema } from "@/lib/reuse-completed-run";
import { digest } from "@/lib/bq-store";
import { syncedRunSnapshotSchema } from "@/lib/synced-run";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireRegisteredUserId(request);
    const { id } = await context.params;
    if (!id || id.length > 128 || id.includes("/")) return NextResponse.json({ error: "リストの指定が不正です。" }, { status: 400 });
    const parsed = reuseCompletedRunSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "再利用するタスクを選んでください。" }, { status: 400 });
    const { operation_id, task_ids } = parsed.data;
    const fingerprint = digest({ source: id, task_ids: [...task_ids].sort() });
    const db = adminFirestore();
    const runs = db.collection("users").doc(userId).collection("runs");
    const destination = runs.doc(`reuse-${operation_id}`);
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(destination);
      if (existing.exists) {
        if (existing.data()?.creation_request_hash !== fingerprint) throw new Response(JSON.stringify({ error: "保存済みの操作と選択内容が異なります。" }), { status: 409, headers: { "content-type": "application/json" } });
        return;
      }
      const snapshot = await transaction.get(runs.doc(id));
      if (!snapshot.exists) throw new Response(JSON.stringify({ error: "完了したリストが見つかりません。" }), { status: 404, headers: { "content-type": "application/json" } });
      const source = syncedRunSnapshotSchema.parse(snapshot.data());
      let run;
      try { run = reuseCompletedRun(source, operation_id, task_ids, Date.now()); }
      catch (error) { throw new Response(JSON.stringify({ error: (error as Error).message }), { status: 409, headers: { "content-type": "application/json" } }); }
      transaction.create(destination, { ...run, creation_request_hash: fingerprint, synced_at: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ runId: destination.id });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof SyntaxError) return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
    console.error("completed_run_reuse_failed", error);
    return NextResponse.json({ error: "リストを保存できませんでした。もう一度お試しください。" }, { status: 503 });
  }
}
