import { z } from "zod";

export const taskEntryTaskSchema = z.object({
  text: z.string().trim().min(1).max(240),
  default_priority: z.number().int().min(0).max(2).nullable().optional(),
  relative_start_day: z.number().int().min(-3650).max(3650).nullable().optional(),
  relative_end_day: z.number().int().min(-3650).max(3650).nullable().optional(),
});

export const taskGroupingSchema = z.object({
  label: z.string().trim().min(1).max(80),
  task_offsets: z.array(z.number().int().nonnegative()).min(1),
});

export const taskListEnrichmentSchema = z.object({
  domain: z.string().trim().min(1),
  context_text: z.string().trim().min(1),
  task_groupings: z.array(taskGroupingSchema).min(1),
});

export const taskListEntrySchema = z.object({
  id: z.string(),
  owner_user_id: z.string(),
  title: z.string(),
  tasks: z.array(taskEntryTaskSchema),
  domain: z.string().nullable(),
  context_text: z.string().nullable(),
  task_groupings: z.array(taskGroupingSchema).nullable(),
  search_text: z.string().nullable().optional(),
  context_embedding: z.array(z.number()).nullable().optional(),
  created_at: z.string(),
});

const taskListDraftObjectSchema = z.object({
  title: z.string().trim().min(1).max(240),
  tasks: z.array(taskEntryTaskSchema).min(1),
});

export const taskListDraftSchema = taskListDraftObjectSchema.superRefine(
  validateTaskList,
);

export const saveTaskListSchema = taskListDraftObjectSchema
  .extend({
    operation_id: z.string().uuid(),
    domain: z.string().trim().min(1).max(40).optional(),
    context_text: z.string().trim().min(1).max(1200).optional(),
    task_groupings: z.array(taskGroupingSchema).min(1).max(20).optional(),
  })
  .superRefine((value, context) => {
    validateTaskList(value, context);

    const usedOffsets = new Set<number>();
    value.task_groupings?.forEach((grouping, groupIndex) => {
      grouping.task_offsets.forEach((offset, offsetIndex) => {
        if (offset >= value.tasks.length) {
          context.addIssue({
            code: "custom",
            path: ["task_groupings", groupIndex, "task_offsets", offsetIndex],
            message: "task offset is outside the reviewed task list",
          });
        }
        if (usedOffsets.has(offset)) {
          context.addIssue({
            code: "custom",
            path: ["task_groupings", groupIndex, "task_offsets", offsetIndex],
            message: "a task may belong to only one grouping",
          });
        }
        usedOffsets.add(offset);
      });
    });
  });

function validateTaskList(
  value: z.infer<typeof taskListDraftObjectSchema>,
  context: z.RefinementCtx,
) {
  value.tasks.forEach((task, index) => {
    if (
      task.relative_start_day != null &&
      task.relative_end_day != null &&
      task.relative_start_day > task.relative_end_day
    ) {
      context.addIssue({
        code: "custom",
        path: ["tasks", index, "relative_start_day"],
        message: "relative_start_day must not be after relative_end_day",
      });
    }
  });

}

export const searchTaskListsSchema = z
  .object({
    message: z.string().trim().optional(),
    cursor: z.string().trim().min(1).optional(),
    page_size: z.number().int().min(1).max(20).optional(),
  })
  .refine((value) => Boolean(value.cursor || value.message), {
    message: "message or cursor is required",
  });

export const memoryEventKindSchema = z.enum([
  "android_task_added",
  "android_task_edited",
  "android_task_deleted",
  "android_task_reordered",
  "android_priority_changed",
  "android_relative_date_changed",
  "android_focus_adjusted",
]);

export const memoryEventInputSchema = z.object({
  event_id: z.string().trim().min(1),
  kind: memoryEventKindSchema,
  text: z.string().trim().min(1),
  occurred_at: z.string().trim().min(1),
});

export type TaskEntryTask = z.infer<typeof taskEntryTaskSchema>;
export type TaskGrouping = z.infer<typeof taskGroupingSchema>;
export type TaskListEnrichment = z.infer<typeof taskListEnrichmentSchema>;
export type TaskListEntry = z.infer<typeof taskListEntrySchema>;
export type SaveTaskListInput = z.infer<typeof saveTaskListSchema>;
