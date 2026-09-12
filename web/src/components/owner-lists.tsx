"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { cueApiFetch } from "@/lib/api-client";

type ListRow = { id: string; title: string; task_count?: number; tasks?: unknown[]; completed_at?: number };
export function OwnerLists({ kind, devUserId, onOpen, onSwitch }: {
  kind: "history" | "library"; devUserId: string;
  onOpen: (id: string) => void; onSwitch: () => void;
}) {
  const [rows, setRows] = useState<ListRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const pending = useRef(false);
  const failedLoadMore = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  async function load(more: boolean, signal?: AbortSignal) {
    if (pending.current) return;
    pending.current = true;
    failedLoadMore.current = more;
    setLoading(true);
    setError(null);
    try {
      const endpoint = kind === "history" ? "/api/runs" : "/api/cuebooks";
      const response = await cueApiFetch(`${endpoint}${more && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, devUserId, { signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "読み込めませんでした。");
      if (signal?.aborted) return;
      const incoming: ListRow[] = body[kind === "history" ? "runs" : "cuebooks"];
      setRows((current) => more ? [...current, ...incoming.filter((row) => !current.some((item) => item.id === row.id))] : incoming);
      setCursor(body.nextCursor);
      setLoaded(true);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "読み込めませんでした。");
    } finally {
      pending.current = false;
      if (!signal?.aborted) setLoading(false);
    }
  }
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => void loadRef.current(false, controller.signal));
    return () => { cancelAnimationFrame(frame); controller.abort(); };
  }, []);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void loadRef.current(false); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => {
    if (!sentinel.current || !cursor || loading || error) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadRef.current(true);
    }, { rootMargin: "150px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [cursor, loading, error]);
  return <div className="workspace owner-list-workspace">
    <header className="workspace-heading"><h1>{kind === "history" ? "完了履歴" : "自分のリスト"}</h1>
      <div className="owner-list-tools"><button type="button" className="text-action" onClick={onSwitch}>{kind === "history" ? "自分のリスト" : "完了履歴"}<ArrowRight size={16} /></button>
        <button type="button" className="icon-button" title="更新" aria-label="更新" disabled={loading} onClick={() => void load(false)}><RotateCcw size={18} /></button></div>
    </header>
    {error ? <div role="alert" className="field-error">{error}<button type="button" onClick={() => void load(failedLoadMore.current)}>再試行</button></div> : null}
    {loaded && !rows.length && !loading ? <p role="status">{kind === "history" ? "同期済みの完了履歴はありません。" : "保存したリストはありません。"}</p> : null}
    <ul className="owner-list-rows">{rows.map((row) => <li key={row.id}><button type="button" onClick={() => onOpen(row.id)}>
      <span><strong>{row.title}</strong><small>{row.task_count ?? row.tasks?.length ?? 0}件{row.completed_at != null ? ` · ${new Date(row.completed_at).toLocaleDateString("ja-JP")}` : ""}</small></span><ArrowRight size={18} />
    </button></li>)}</ul>
    {loading ? <p role="status">読み込んでいます</p> : null}
    <div ref={sentinel}>{cursor ? <button type="button" disabled={loading} onClick={() => void load(true)}>続きを読み込む</button> : null}</div>
  </div>;
}
