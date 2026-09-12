import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

export const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  try { Temporal.PlainDate.from(value); return true; } catch { return false; }
});
export const taskDateFieldsSchema = z.object({
  task_id: z.string().min(1),
  available_from_day: isoDaySchema.nullable(),
  due_day: isoDaySchema.nullable(),
}).strict();
export const taskDatesSchema = taskDateFieldsSchema.refine((value) => !value.available_from_day || !value.due_day || value.available_from_day <= value.due_day);
export const timeZoneSchema = z.string().min(1).max(80).refine((value) => { try { Temporal.Now.zonedDateTimeISO(value); return true; } catch { return false; } });
export const scheduledReuseSchema = z.object({
  operation_id: z.string().uuid(),
  source: z.discriminatedUnion("type", [
    z.object({ type: z.literal("revision"), id: z.string().min(1).max(160) }),
    z.object({ type: z.literal("cuebook"), id: z.string().uuid(), expected_updated_at: z.string().datetime({ offset: true }) }),
  ]),
  target_anchor_day: isoDaySchema, time_zone: timeZoneSchema,
  task_dates: z.array(taskDatesSchema).min(1).max(200).optional(),
}).strict();
export type ScheduledReuseInput = z.infer<typeof scheduledReuseSchema>;
export type TaskDates = z.infer<typeof taskDatesSchema>;
export type ScheduleTask = {
  id: string; text: string; relative_start_day: number | null; relative_end_day: number | null;
};

export function generateTaskDates(tasks: ScheduleTask[], day: string): TaskDates[] {
  const anchor = Temporal.PlainDate.from(day);
  const date = (offset: number | null) => offset === null ? null : anchor.add({ days: offset }).toString();
  return tasks.map((task) => ({ task_id: task.id, available_from_day: date(task.relative_start_day), due_day: date(task.relative_end_day) }));
}

export function dayTimestamp(day: string | null, zone: string): number | null {
  if (day === null) return null;
  const plain = Temporal.PlainDate.from(day);
  const zoned = plain.toZonedDateTime(zone);
  if (!zoned.toPlainDate().equals(plain)) throw new Error("このタイムゾーンには指定された日付がありません。");
  return zoned.epochMilliseconds;
}

export function relativeDays(anchor: string, day: string | null): number | null {
  return day === null ? null : Temporal.PlainDate.from(anchor).until(Temporal.PlainDate.from(day)).days;
}
