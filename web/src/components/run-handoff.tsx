"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, RotateCcw } from "lucide-react";
import { cueApiFetch } from "@/lib/api-client";
import { buildAndroidRunUri } from "@/lib/run-transfer";
import { syncedRunSnapshotSchema, type SyncedRunSnapshot } from "@/lib/synced-run";

export function RunHandoff({ runId, devUserId, registered, onSignIn }: {
  runId: string; devUserId: string; registered: boolean; onSignIn: () => void;
}) {
  const [run, setRun] = useState<SyncedRunSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!registered) return;
    const controller = new AbortController();
    void cueApiFetch(`/api/runs/${encodeURIComponent(runId)}/snapshot`, devUserId, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(response.status === 404 ? "このアカウントではリストが見つかりません。Webで保存したアカウントを確認してください。" : body.error || "読み込めませんでした。");
        const snapshot = syncedRunSnapshotSchema.parse(body.run);
        if (snapshot.id !== runId) throw new Error("リストの指定と保存内容が一致しません。");
        if (!controller.signal.aborted) setRun(snapshot);
      }).catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [runId, devUserId, registered, attempt]);
  const completed = run && run.tasks.length > 0 && run.tasks.every((task) => task.completed_at !== null);
  const day = (value: number | null | undefined) => value == null ? "未設定" : new Intl.DateTimeFormat("ja-JP", { timeZone: run!.time_zone, dateStyle: "medium" }).format(value);
  return <div className="workspace run-handoff">
    <Link className="text-action" href="/"><ArrowLeft size={17} />探す</Link>
    <header className="workspace-heading"><h1>{run?.title ?? "保存したリスト"}</h1></header>
    {!registered ? <button type="button" className="primary-action" onClick={onSignIn}>Googleでログイン</button> : <>
      {loading ? <p role="status">読み込んでいます</p> : null}
      {error ? <div role="alert"><p>{error}</p><button type="button" className="secondary-action" onClick={() => { setError(null); setLoading(true); setAttempt((value) => value + 1); }}><RotateCcw size={17} />再試行</button><button type="button" className="text-action" onClick={onSignIn}>アカウントを選び直す</button></div> : null}
      {run ? <><p role="status">{completed ? "完了済み" : "アカウントに保存済み"} · {run.tasks.length}タスク</p>
        <div className="handoff-actions"><a className="primary-action" href={buildAndroidRunUri(run.id)}><ExternalLink size={17} />Androidで開く</a><a className="text-action" href={completed ? `/?run_id=${encodeURIComponent(run.id)}` : "/?view=history"}>完了履歴を見る</a></div>
        <p>最終日: {day(run.target_anchor_day)}</p>
        <ol className="handoff-task-list">{[...run.tasks].sort((a, b) => a.sort_order - b.sort_order).map((task) => <li key={task.id}><strong>{task.title}</strong><span>{task.completed_at !== null ? "完了 · " : ""}開始: {day(task.available_from_at)} · 期限: {day(task.due_at)}</span></li>)}</ol>
      </> : null}
    </>}
  </div>;
}
