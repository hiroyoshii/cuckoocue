import { createHash } from "node:crypto";
import { z } from "zod";
import { type SyncedRunSnapshot } from "./synced-run";

export const reuseCompletedRunSchema = z.object({
  operation_id: z.string().uuid(),
  task_ids: z.array(z.string().min(1).max(128)).min(1).max(200),
}).strict().refine((value) => new Set(value.task_ids).size === value.task_ids.length, "タスクの指定が重複しています。");

export function reusedTaskId(sourceId: string, operationId: string, taskId: string) {
  return createHash("sha256").update(JSON.stringify([sourceId, operationId, taskId])).digest("hex");
}

export function reuseCompletedRun(source: SyncedRunSnapshot, operationId: string, selectedIds: string[], now: number): SyncedRunSnapshot {
  if (source.completed_anchor_at === null || !source.tasks.length || source.tasks.some((task) => task.completed_at === null)) {
    throw new Error("完了したリストだけを再利用できます。");
  }
  const selected = new Set(selectedIds);
  const tasks = source.tasks.filter((task) => selected.has(task.id)).sort((a, b) => a.sort_order - b.sort_order);
  if (!tasks.length || tasks.length !== selectedIds.length || selected.size !== selectedIds.length) {
    throw new Error("選択したタスクが見つかりません。完了履歴を読み込み直してください。");
  }
  return {
    id: `reuse-${operationId}`, title: source.title, sort_order: 0,
    archived_at: null, completed_anchor_at: null, target_anchor_day: null,
    time_zone: source.time_zone, created_at: now, updated_at: now,
    tasks: tasks.map((task, index) => ({
      id: reusedTaskId(source.id, operationId, task.id), title: task.title,
      user_priority: null, available_from_at: null, due_at: null,
      sort_order: index, completed_at: null, created_at: now, updated_at: now,
    })),
  };
}
