import { createHash } from "node:crypto";
import { type SyncedRunSnapshot, syncedRunSnapshotSchema } from "./synced-run";

export function runEtag(value: SyncedRunSnapshot): string {
  const run = syncedRunSnapshotSchema.parse(value);
  const normalized = { ...run, source_cuebook_id: run.source_cuebook_id ?? null,
    target_anchor_day: run.target_anchor_day ?? null,
    tasks: run.tasks.map((task) => ({ ...task, source_task_id: task.source_task_id ?? null })),
  };
  const json = JSON.stringify(normalized, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
  return `"${createHash("sha256").update(json).digest("hex")}"`;
}
