import type { SaveTaskListInput } from "./schema";

const unsafePatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "メールアドレス", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { label: "電話番号", pattern: /(?:\+?81[-\s]?)?0\d{1,4}[-\s]\d{1,4}[-\s]\d{3,4}/ },
  { label: "英国郵便番号", pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i },
  {
    label: "詳細な住所",
    pattern: /(?:\d+(?:丁目|番地|番(?:号)?|号室)|\b\d+[A-Z]?[\s,]+[\p{Letter}.'-]+[\s]+(?:street|st\.|road|rd\.|avenue|ave\.)\b)/iu,
  },
  { label: "アカウント識別子", pattern: /(?:口座番号|会員番号|顧客番号|account\s*(?:number|no\.?))/i },
];

export class UnsafeCorpusContentError extends Error {
  constructor(public readonly labels: string[]) {
    super(`公開できない可能性のある情報を検出しました: ${labels.join("、")}`);
    this.name = "UnsafeCorpusContentError";
  }
}

export function assertPublicCorpusSafe(
  input: Pick<SaveTaskListInput, "title" | "tasks" | "context_text" | "task_groupings">,
): void {
  const text = [
    input.title,
    ...input.tasks.map((task) => task.text),
    input.context_text ?? "",
    ...(input.task_groupings ?? []).map((grouping) => grouping.label),
  ].join("\n");
  const labels = unsafePatterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);

  if (labels.length > 0) {
    throw new UnsafeCorpusContentError(labels);
  }
}
