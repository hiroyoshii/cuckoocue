import { z } from "zod";

const nullableEpochMillis = z.number().int().nonnegative().nullable();

export const syncedRunSnapshotSchema = z.object({
  id: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(240),
  sort_order: z.number().int(),
  archived_at: nullableEpochMillis,
  completed_anchor_at: nullableEpochMillis,
  time_zone: z.string().trim().min(1).max(80),
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
  tasks: z.array(
    z.object({
      id: z.string().trim().min(1).max(128),
      title: z.string().trim().min(1).max(240),
      user_priority: z.number().int().min(0).max(2).nullable(),
      available_from_at: nullableEpochMillis,
      due_at: nullableEpochMillis,
      sort_order: z.number().int(),
      completed_at: nullableEpochMillis,
      created_at: z.number().int().nonnegative(),
      updated_at: z.number().int().nonnegative(),
    }),
  ),
});

export type SyncedRunSnapshot = z.infer<typeof syncedRunSnapshotSchema>;

export function completedRunToSaveDraft(run: SyncedRunSnapshot) {
  if (
    run.completed_anchor_at == null ||
    run.tasks.length === 0 ||
    run.tasks.some((task) => task.completed_at == null)
  ) {
    throw new Error("完了したリストだけを残せます。");
  }

  const anchorDay = localIsoDay(run.completed_anchor_at, run.time_zone);
  return {
    run_id: run.id,
    title: run.title,
    source_anchor_day: anchorDay,
    tasks: [...run.tasks]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((task) => ({
        text: task.title,
        default_priority: task.user_priority,
        relative_start_day: relativeDay(task.available_from_at, anchorDay, run.time_zone),
        relative_end_day: relativeDay(task.due_at, anchorDay, run.time_zone),
      })),
  };
}

function relativeDay(value: number | null, anchorDay: string, timeZone: string) {
  if (value == null) return null;
  return Math.round((isoDayUtc(localIsoDay(value, timeZone)) - isoDayUtc(anchorDay)) / 86_400_000);
}

function isoDayUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function localIsoDay(epochMillis: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(epochMillis));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
