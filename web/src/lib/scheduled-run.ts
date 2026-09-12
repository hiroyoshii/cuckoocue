import { Temporal } from "@js-temporal/polyfill";
import { digest } from "./bq-store";
import type { Cuebook } from "./cuebook-schema";
import type { SyncedRunSnapshot } from "./synced-run";
import { dayTimestamp, type TaskDates, type ScheduledReuseInput } from "./schedule-dates";
export { scheduledReuseSchema, type ScheduledReuseInput } from "./schedule-dates";

export function validateConfirmedDates(ids: string[], dates: TaskDates[] | undefined, anchor: string, zone: string) {
  if (dates && (dates.length !== ids.length || new Set(dates.map((task) => task.task_id)).size !== ids.length || dates.some((task) => !ids.includes(task.task_id)))) {
    throw Response.json({ error: "確認したタスクと原本が一致しません。読み込み直してください。" }, { status: 400 });
  }
  try {
    dayTimestamp(anchor, zone);
    dates?.forEach((task) => { dayTimestamp(task.available_from_day, zone); dayTimestamp(task.due_day, zone); });
  } catch { throw Response.json({ error: "日付とタイムゾーンを確認してください。" }, { status: 400 }); }
}

export function scheduledRun(cuebook: Cuebook, input: ScheduledReuseInput, now: number, sourceTaskIds = cuebook.tasks.map((task) => task.id)): SyncedRunSnapshot {
  const anchor = Temporal.PlainDate.from(input.target_anchor_day);
  const date = (days: number | null | undefined) => days == null ? null : dayTimestamp(anchor.add({ days }).toString(), input.time_zone);
  const confirmed = new Map(input.task_dates?.map((task) => [task.task_id, task]));
  return {
    id: `scheduled-${input.operation_id}`, source_cuebook_id: cuebook.id, title: cuebook.title,
    sort_order: 0, archived_at: null, completed_anchor_at: null,
    target_anchor_day: date(0), time_zone: input.time_zone, created_at: now, updated_at: now,
    tasks: cuebook.tasks.map((task, position) => {
      const dates = confirmed.get(sourceTaskIds[position]);
      return {
        id: digest([input.operation_id, cuebook.id, task.id]), source_task_id: task.id, title: task.text,
        user_priority: task.default_priority ?? null,
        available_from_at: dates ? dayTimestamp(dates.available_from_day, input.time_zone) : date(task.relative_start_day),
        due_at: dates ? dayTimestamp(dates.due_day, input.time_zone) : date(task.relative_end_day),
        sort_order: position, completed_at: null, created_at: now, updated_at: now,
      };
    }),
  };
}
