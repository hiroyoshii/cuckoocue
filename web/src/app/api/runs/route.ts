import { FieldPath } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRegisteredUserId } from "@/lib/auth";
import { adminFirestore } from "@/lib/firebase-admin";
import { syncedRunSnapshotSchema } from "@/lib/synced-run";
import { dataApiError } from "@/lib/bq-store";

const cursorSchema = z.object({ completed_at: z.number().int().nonnegative(), id: z.string().min(1).max(128) });
export async function GET(request: NextRequest) {
  try {
    const owner = await requireRegisteredUserId(request);
    const state = z.enum(["completed", "all"]).parse(request.nextUrl.searchParams.get("state") ?? "completed");
    const collection = adminFirestore().collection("users").doc(owner).collection("runs");
    let query = state === "all" ? collection.orderBy(FieldPath.documentId()).limit(21) : collection
      .where("completed_anchor_at", ">=", 0).orderBy("completed_anchor_at", "desc").orderBy(FieldPath.documentId(), "desc").limit(21);
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor) {
      const raw = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (state === "all") query = query.startAfter(z.object({ id: z.string().min(1).max(128) }).parse(raw).id);
      else { const value = cursorSchema.parse(raw); query = query.startAfter(value.completed_at, value.id); }
    }
    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, 20);
    const runs = docs.flatMap((doc) => {
      const run = syncedRunSnapshotSchema.parse(doc.data());
      if (state === "completed" && (!run.tasks.length || run.tasks.some((task) => task.completed_at === null))) return [];
      return [{ id: run.id, title: run.title, completed_at: run.completed_anchor_at, task_count: run.tasks.length }];
    });
    const last = docs.at(-1);
    const nextCursor = snapshot.docs.length > 20 && last ? Buffer.from(JSON.stringify({ completed_at: last.data().completed_anchor_at, id: last.id })).toString("base64url") : null;
    return NextResponse.json({ runs, nextCursor }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return dataApiError(error); }
}
