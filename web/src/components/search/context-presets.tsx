"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { contextPresets, type ContextPreset } from "@/lib/context-presets";
import type { PublicRevisionDetail, ShelfDetail } from "@/lib/shelves";
import type { SearchResult } from "./search-result";
import { TaskList } from "../tasks/task-list";

type UsableResult = SearchResult & { tasks: (SearchResult["tasks"][number] & { id: string })[] };

export function ContextPresetChoices({ selectedId, disabled, onSelect }: {
  selectedId: string | null; disabled: boolean; onSelect: (preset: ContextPreset) => void;
}) {
  return <section className="context-presets" aria-labelledby="context-presets-heading">
    <h2 id="context-presets-heading">運営が用意した例</h2>
    <div className="context-preset-options">{contextPresets.map(preset => <button type="button" key={preset.id}
      className="context-preset-option" aria-pressed={selectedId === preset.id} disabled={disabled} onClick={() => onSelect(preset)}>
      <strong>{preset.label}</strong><span>{preset.examples[0]}</span><ArrowRight size={16} aria-hidden="true" />
    </button>)}</div>
  </section>;
}

type LoadedPreset = { id: string; shelf: ShelfDetail | null; error: string | null };

export function ContextPresetContents({ preset, selectedId, onSelectRevision, disabled, onUse }: {
  preset: ContextPreset; selectedId: string | null; onSelectRevision: (id: string) => void;
  disabled: boolean; onUse: (result: UsableResult) => void;
}) {
  const [loaded, setLoaded] = useState<LoadedPreset | null>(null);
  const [attempt, setAttempt] = useState(0);
  const detail = useRef<HTMLElement>(null);
  const candidates = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/shelves/${encodeURIComponent(preset.id)}`, { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error("例を読み込めませんでした。");
      const shelf: ShelfDetail = body.shelf;
      if (shelf?.id !== preset.id || !shelf.curation?.is_default || !Array.isArray(shelf.items)) {
        throw new Error("この例は現在利用できません。");
      }
      if (!controller.signal.aborted) setLoaded({ id: preset.id, shelf, error: null });
    }).catch(error => {
      if (!controller.signal.aborted) setLoaded({ id: preset.id, shelf: null, error: error instanceof Error ? error.message : "例を読み込めませんでした。" });
    });
    return () => controller.abort();
  }, [preset.id, attempt]);

  useEffect(() => {
    if (!loaded?.shelf || !window.matchMedia("(max-width: 760px)").matches) return;
    // Move to the opened example; the search draft stays available immediately above it.
    detail.current?.closest(".context-search-workspace")?.querySelector(".example-toolbar")?.scrollIntoView({ block: "start" });
  }, [loaded]);

  const current = loaded?.id === preset.id ? loaded : null;
  if (!current) return <p className="context-preset-loading" role="status"><Loader2 size={18} className="spin" aria-hidden="true" />例を読み込んでいます</p>;
  if (current.error || !current.shelf) return <div className="context-preset-error" role="alert">
    <p>{current.error}</p><button type="button" className="text-action" onClick={() => { setLoaded(null); setAttempt(attempt + 1); }}>例を再読み込み</button>
  </div>;
  const shelf = current.shelf;
  const revisions = shelf.items.filter(item => !item.revision.withdrawn_at).map(item => item.revision);
  const selected = revisions.find(revision => revision.id === selectedId) ?? revisions[0];
  return <section className="context-preset-contents" aria-label="運営が用意した手順">
    <header className="context-preset-heading"><h2>{shelf.title}</h2><p>{shelf.context}</p></header>
    {!selected ? <p className="empty-state">現在利用できる手順はありません。</p> : <>
      <button type="button" className="text-action context-candidates-jump" onClick={() => { candidates.current?.focus({ preventScroll: true }); candidates.current?.scrollIntoView({ block: "start" }); }}>この例の手順を選ぶ（{revisions.length}件）</button>
      <div className="context-preset-layout">
        <div className="context-candidates" ref={candidates} tabIndex={-1} aria-label="手順の候補">{revisions.map(revision => <button type="button" key={revision.id}
          aria-pressed={selected.id === revision.id} onClick={() => {
            onSelectRevision(revision.id);
            if (window.matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => { detail.current?.focus({ preventScroll: true }); detail.current?.scrollIntoView({ block: "start" }); });
          }}>
          <strong>{revision.title}</strong><span>{revision.tasks[0]?.title}</span>
        </button>)}</div>
        <article className="context-candidate-detail" ref={detail} tabIndex={-1} aria-label="選択した手順">
          <PresetRevision key={selected.id} id={selected.id} title={selected.title} disabled={disabled} onUse={onUse} />
        </article>
      </div>
    </>}
  </section>;
}

function PresetRevision({ id, title, disabled, onUse }: { id: string; title: string; disabled: boolean; onUse: (result: UsableResult) => void }) {
  const [revision, setRevision] = useState<PublicRevisionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/cuebook-revisions/${encodeURIComponent(id)}`, { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(response.status === 410 ? "この手順は公開を停止しています。" : "手順の内容を読み込めませんでした。");
      const value: PublicRevisionDetail = body.revision;
      if (value?.id !== id || value.withdrawn_at || !Array.isArray(value.tasks)) throw new Error("この手順は現在利用できません。");
      if (!controller.signal.aborted) { setRevision(value); setError(null); }
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "手順の内容を読み込めませんでした。"); });
    return () => controller.abort();
  }, [id, attempt]);
  const tasks = revision?.tasks.map(task => ({ ...task, text: task.title })) ?? [];
  return <>
    <div className="context-detail-label"><span>手順の内容</span>{revision ? <span>{tasks.length}項目</span> : null}</div>
    <h3>{revision?.title ?? title}</h3>
    {error ? <div role="alert"><p>{error}</p><button type="button" className="text-action" onClick={() => { setError(null); setAttempt(attempt + 1); }}>手順を再読み込み</button></div> : !revision ? <p role="status">対象条件と手順を読み込んでいます</p> : <>
      <p className="context-applicability">{revision.context_text || "対象条件の記載はありません。"}</p>
      <TaskList tasks={tasks} />
      <footer><span>自分用のリストにする</span><button type="button" className="primary-action" disabled={disabled || !tasks.length} onClick={() => onUse({
        id: revision.id, title: revision.title, tasks, domain: revision.domain, context_text: revision.context_text, task_groupings: revision.task_groupings, text_matched: false,
      })}>日程を決めて使う</button></footer>
      {revision.provenance ? <details className="context-sources"><summary>参考資料・確認日</summary>
        <p>{revision.provenance.reviewed_at.slice(0, 10)} 確認</p><ul>{revision.provenance.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{source.publisher}</span></li>)}</ul>
      </details> : null}
    </>}
  </>;
}
