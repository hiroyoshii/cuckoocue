"use client";

import { useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { cueApiFetch } from "@/lib/api-client";
import { buildAndroidRunUri } from "@/lib/run-transfer";
import { type TaskDraft } from "./task-values";

export type CompletedRunDraft = {
  run_id: string; title: string; source_anchor_day: string | null;
  task_ids: string[]; tasks: TaskDraft[];
};
export type CompletedReviewState = {
  run: CompletedRunDraft; selectedIds: string[]; operationId: string;
  submitted: boolean; savedRunId: string | null;
};

export function CompletedRunReview({ state, onChange, onEdit, onBack, devUserId }: {
  state: CompletedReviewState; onChange: (state: CompletedReviewState) => void;
  onEdit: (tasks: TaskDraft[]) => void; onBack: () => void; devUserId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const locked = busy || state.submitted;
  const selected = new Set(state.selectedIds);
  async function reuse() {
    if (inFlight.current || !state.selectedIds.length || state.savedRunId) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    onChange({ ...state, submitted: true });
    try {
      const response = await cueApiFetch(`/api/runs/${encodeURIComponent(state.run.run_id)}/reuse`, devUserId, {
        method: "POST", signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ operation_id: state.operationId, task_ids: state.selectedIds }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" && /[ぁ-んァ-ヶ一-龠]/u.test(body.error) ? body.error : "リストを保存できませんでした。もう一度お試しください。");
      if (typeof body.runId !== "string" || !body.runId) throw new Error("保存結果を確認できませんでした。同じ操作で再試行してください。");
      onChange({ ...state, submitted: true, savedRunId: body.runId });
      if (/Android/i.test(navigator.userAgent)) window.location.assign(buildAndroidRunUri(body.runId));
    } catch (error) {
      setError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "保存結果を確認できませんでした。同じ操作で再試行してください。");
    } finally { inFlight.current = false; setBusy(false); }
  }
  if (state.savedRunId) return <div className="workspace reuse-completed-result">
    <header className="workspace-heading"><h1>リストを保存しました</h1></header>
    <h2>{state.run.title}</h2><p>{state.selectedIds.length}件・日付と優先度なし</p>
    <button type="button" className="secondary-action" onClick={onBack}>完了履歴に戻る</button>
  </div>;
  return <div className="workspace completed-review">
    <header className="workspace-heading"><h1>完了したリスト</h1></header>
    <h2>{state.run.title}</h2>
    <div className="completed-selection-toolbar"><label><input type="checkbox" checked={selected.size === state.run.tasks.length} disabled={locked}
      onChange={(event) => onChange({ ...state, selectedIds: event.target.checked ? [...state.run.task_ids] : [] })} />すべて選択</label><span>{selected.size} / {state.run.tasks.length}件</span></div>
    <ul className="completed-task-selection">{state.run.tasks.map((task, i) => <li key={state.run.task_ids[i]}><label>
      <input type="checkbox" checked={selected.has(state.run.task_ids[i])} disabled={locked} onChange={(event) => onChange({ ...state, selectedIds: event.target.checked ? [...state.selectedIds, state.run.task_ids[i]] : state.selectedIds.filter((id) => id !== state.run.task_ids[i]) })} />
      <span>{task.text}</span>
    </label></li>)}</ul>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    <div className="completed-reuse-actions">
      <button type="button" disabled={busy || !selected.size} onClick={reuse}>{busy ? <Loader2 className="spin" size={18} /> : <RotateCcw size={18} />}{state.submitted ? "保存を再試行" : "タスクだけもう一度使う"}</button>
      <button type="button" className="secondary-action" disabled={locked || !selected.size} onClick={() => onEdit(state.run.tasks.filter((_, i) => selected.has(state.run.task_ids[i])))}>再利用用に整える</button>
    </div>
  </div>;
}
