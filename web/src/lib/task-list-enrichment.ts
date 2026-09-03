import { GoogleAuth } from "google-auth-library";
import { cueEnv } from "./env";
import { withRetry } from "./resilience";
import { taskListEnrichmentSchema } from "./schema";

import type { SaveTaskListInput, TaskListEnrichment } from "./schema";

type GenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

let authClient: GoogleAuth | null = null;

function googleAuth() {
  authClient ??= new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  return authClient;
}

export async function enrichTaskList(
  input: Omit<SaveTaskListInput, "operation_id">,
): Promise<TaskListEnrichment> {
  const model = process.env.CUE_LLM_MODEL || "gemini-2.5-flash";
  const url = [
    `https://${cueEnv.googleCloudLocation()}-aiplatform.googleapis.com/v1`,
    `projects/${cueEnv.projectId()}`,
    `locations/${cueEnv.googleCloudLocation()}`,
    `publishers/google/models/${model}:generateContent`,
  ].join("/");

  const response = await withRetry(
    () =>
      googleAuth().request<GenerateContentResponse>({
        url,
        method: "POST",
        timeout: 12000,
        data: {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildPrompt(input),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        },
      }),
    { attempts: 2, timeoutMs: 15000, delayMs: 500 },
  );

  const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Task list enrichment returned no content");
  }

  return normalizeEnrichment(JSON.parse(text), input.tasks.length);
}

export function normalizeEnrichment(value: unknown, taskCount: number): TaskListEnrichment {
  const parsed = taskListEnrichmentSchema.parse(value);
  const usedOffsets = new Set<number>();
  const task_groupings = parsed.task_groupings
    .map((grouping) => ({
      label: grouping.label,
      task_offsets: Array.from(new Set(grouping.task_offsets))
        .filter((offset) => offset >= 0 && offset < taskCount)
        .filter((offset) => {
          if (usedOffsets.has(offset)) return false;
          usedOffsets.add(offset);
          return true;
        })
        .sort((left, right) => left - right),
    }))
    .filter((grouping) => grouping.task_offsets.length > 0);

  if (task_groupings.length === 0) {
    throw new Error("Task list enrichment returned no usable task_groupings");
  }

  return {
    domain: parsed.domain,
    context_text: parsed.context_text,
    task_groupings,
  };
}

function buildPrompt(input: Omit<SaveTaskListInput, "operation_id">) {
  return `
あなたは reusable task list corpus の curator です。
完了済み task list を、将来の検索と Android/widget での再利用に使いやすい形へ分類してください。

重要な制約:
- user profile やユーザ個人の好みは書かない。これは Memory Bank 側で扱う。
- domain は粗い日本語名にする。地域・制度・国は domain に含めず、context_text に残す。例: "引っ越し", "端末移行", "旅行準備"。
- context_text は、この task list が再利用される状況を1から2文の日本語で説明する。
- context_text には、再利用判断に効く地域、制度、行政手続き、サービス名、制約を残す。汎用化しすぎない。
- ただし、住所、氏名、個人の好み、今回だけの感情や試行錯誤は含めない。
- task_groupings は Web の検索結果で一覧を理解しやすい粒度にする。Android には渡さない。
- task_offsets は 0 始まりの task index。存在しない index は含めない。
- relative_start_day / relative_end_day は、再利用時にユーザが指定する target_anchor_day を 0 日目とする相対日数として扱う。
- 引っ越しやイベント準備のように目標日が明確な task list では、事前に行う task は負の値、当日の task は 0 になる。
- Android/widget へ import するときは、新しい target_anchor_day を基準に absolute schedule へ変換する想定。
- JSON 以外は返さない。

返却 JSON:
{
  "domain": "短い日本語 domain",
  "context_text": "再利用状況の説明",
  "task_groupings": [
    { "label": "グループ名", "task_offsets": [0, 1] }
  ]
}

入力:
${JSON.stringify(input, null, 2)}
`.trim();
}
