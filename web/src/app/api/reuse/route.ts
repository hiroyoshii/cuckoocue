import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { adminFirestore } from "@/lib/firebase-admin";
import { dataApiError, digest } from "@/lib/bq-store";
import { borrowRevision, getCuebook } from "@/lib/cuebooks";
import { scheduledReuseSchema, scheduledRun, validateConfirmedDates } from "@/lib/scheduled-run";
import { getRevisionById } from "@/lib/shelves";

export async function POST(request: NextRequest) {
  try {
    const owner = await requireRegisteredUserId(request);
    const input = scheduledReuseSchema.parse(await request.json());
    const ref = adminFirestore().collection("users").doc(owner).collection("runs").doc(`scheduled-${input.operation_id}`);
    const fingerprint = digest(input);
    const existing = await ref.get();
    if (existing.exists) {
      if (existing.data()?.creation_request_hash !== fingerprint) return NextResponse.json({ error: "保存済みの操作と指定内容が異なります。" }, { status: 409 });
      return NextResponse.json({ runId: ref.id });
    }
    const privateCuebook = input.source.type === "cuebook" ? await getCuebook(owner, input.source.id) : null;
    const source = input.source.type === "revision" ? await getRevisionById(input.source.id) : privateCuebook;
    if (!source) return NextResponse.json({ error: "リストが見つかりません。" }, { status: 404 });
    if ("withdrawn_at" in source && source.withdrawn_at) return NextResponse.json({ error: "この公開版は公開を停止しています。" }, { status: 410 });
    validateConfirmedDates(source.tasks.map((task) => task.id), input.task_dates, input.target_anchor_day, input.time_zone);
    const cuebook = input.source.type === "revision"
      ? await borrowRevision(owner, input.operation_id, input.source.id)
      : privateCuebook;
    if (!cuebook) return NextResponse.json({ error: "リストが見つかりません。" }, { status: 404 });
    if (input.source.type === "cuebook" && cuebook.updated_at !== input.source.expected_updated_at) return NextResponse.json({ error: "原本が変更されています。読み込み直してください。" }, { status: 409 });
    const run = scheduledRun(cuebook, input, Date.now(), source.tasks.map((task) => task.id));
    await adminFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        if (snapshot.data()?.creation_request_hash !== fingerprint) throw Response.json({ error: "保存済みの操作と指定内容が異なります。" }, { status: 409 });
        return;
      }
      transaction.create(ref, { ...run, creation_request_hash: fingerprint, synced_at: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ runId: run.id });
  } catch (error) { return dataApiError(error); }
}
