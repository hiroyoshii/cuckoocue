import { z } from "zod";
import { taskEntryTaskSchema, taskListEnrichmentSchema } from "./schema";
import { isActiveDomainLabel } from "./domain-catalog";

export const cuebookTaskSchema = taskEntryTaskSchema.extend({ id: z.string().uuid() });
export const cuebookContentSchema = z.object({
  title: z.string().trim().min(1).max(240),
  tasks: z.array(cuebookTaskSchema).min(1).max(200),
  enrichment: taskListEnrichmentSchema.nullable(),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  value.tasks.forEach((task, index) => {
    if (ids.has(task.id)) ctx.addIssue({ code: "custom", path: ["tasks", index, "id"], message: "Duplicate task id" });
    ids.add(task.id);
    if (task.relative_start_day != null && task.relative_end_day != null && task.relative_start_day > task.relative_end_day) {
      ctx.addIssue({ code: "custom", path: ["tasks", index], message: "開始日は終了日以前にしてください。" });
    }
  });
  if (value.enrichment) {
    if (!isActiveDomainLabel(value.enrichment.domain)) {
      ctx.addIssue({ code: "custom", path: ["enrichment", "domain"], message: "管理語彙にないdomainは保存できません。" });
    }
    const offsets = value.enrichment.task_groupings.flatMap((group) => group.task_offsets);
    if (offsets.length !== value.tasks.length || new Set(offsets).size !== offsets.length || offsets.some((offset) => offset >= value.tasks.length)) {
      ctx.addIssue({ code: "custom", path: ["enrichment", "task_groupings"], message: "すべてのタスクを1つずつまとまりに指定してください。" });
    }
  }
});

export const saveCuebookSchema = z.object({
  operation_id: z.string().uuid(),
  expected_updated_at: z.string().datetime({ offset: true }).nullable(),
  content: cuebookContentSchema,
}).strict();

export type CuebookContent = z.infer<typeof cuebookContentSchema>;
export type Cuebook = CuebookContent & {
  id: string;
  origin_revision_id: string | null;
  updated_at: string;
};
export type SaveCuebookInput = z.infer<typeof saveCuebookSchema>;
