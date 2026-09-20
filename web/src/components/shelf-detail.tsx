"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { cueApiFetch } from "@/lib/api-client";
import type { ShelfDetail, PublicRevisionSummary } from "@/lib/shelves";
import type { UpdateShelfInput } from "@/lib/schema";
import { TaskList } from "./tasks/task-list";
import { ScheduledReuse } from "./scheduled-reuse";
import { ShelfDescriptionGenerator } from "./shelf-description-generator";

type Draft = { title: string; context: string; items: ShelfDetail["items"] };
type ForkRequest = { operation_id: string; expected_updated_at: string; title: string; context: string; items: ShelfDetail["items"] };
type Props = {
  shelf: ShelfDetail; userId: string; registered: boolean; joined: boolean; membershipReady: boolean;
  busy: boolean; onJoin: () => void; onSignIn: () => void; onBack: () => void;
  onSaved: (shelf: ShelfDetail, joined?: boolean) => void;
};
const draftOf = (shelf: ShelfDetail): Draft => ({ title: shelf.title, context: shelf.context, items: shelf.items });

export function ShelfDetailView(props: Props) {
  const { shelf, userId } = props;
  const owner = shelf.is_owned;
  const key = `cuckoo-cue:shelf-editor:${userId}:${shelf.id}`;
  const [draft, setDraft] = useState<Draft>(() => draftOf(shelf));
  const [base, setBase] = useState(shelf.updated_at);
  const [pending, setPending] = useState<UpdateShelfInput | null>(null);
  const [fork, setFork] = useState<ForkRequest | null>(null);
  const [forkSent, setForkSent] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<ShelfDetail | null>(null);
  const [undo, setUndo] = useState<Draft[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [operation, setOperation] = useState<"save" | "copy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [adding, setAdding] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(shelf));

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const value = JSON.parse(raw);
          if (owner && value.draft && Array.isArray(value.draft.items) && typeof value.base === "string") {
            setDraft(value.draft); setBase(value.base); setPending(value.pending ?? null);
          }
          if (value.fork) { setFork(value.fork); setForkSent(Boolean(value.forkSent)); }
        }
      } catch { setStorageError(true); }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [key, owner]);
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(key, JSON.stringify({ draft: owner && (dirty || pending) ? draft : undefined, base, pending, fork, forkSent })); }
    catch {
      const frame = requestAnimationFrame(() => setStorageError(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [ready, key, draft, base, pending, fork, forkSent, owner, dirty]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  function edit(next: Draft) { setUndo((values) => [...values, draft]); setDraft(next); setNotice(null); }
  function reorder(index: number, delta: number) {
    const items = [...draft.items];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    edit({ ...draft, items: items.map((item, position) => ({ ...item, position })) });
  }
  async function json(path: string, method = "GET", input?: unknown) {
    const response = await cueApiFetch(path, userId, { method, ...(input ? { body: JSON.stringify(input) } : {}) });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error || "保存結果を確認できませんでした。"), { status: response.status });
    return body;
  }
  async function save() {
    if (inFlight.current) return;
    const request = pending ?? { operation_id: crypto.randomUUID(), expected_updated_at: base,
      title: draft.title.trim(), context: draft.context.trim(), items: draft.items.map((item, position) => ({ revision_id: item.revision_id, position })) };
    setPending(request); inFlight.current = true; setBusy(true); setOperation("save"); setError(null); setNotice(null);
    try {
      const { shelf: saved } = await json(`/api/shelves/${shelf.id}`, "PATCH", request);
      if (!mounted.current) return;
      setDraft(draftOf(saved)); setBase(saved.updated_at); setPending(null); setUndo([]); setConflict(false); setLatest(null);
      props.onSaved(saved); setNotice("変更を保存しました。");
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 400 || status === 422 || status === 409) setPending(null);
      if (status === 409) setConflict(true);
      setError(e instanceof Error ? e.message : "変更を保存できませんでした。");
    } finally { inFlight.current = false; setBusy(false); setOperation(null); }
  }
  async function copy() {
    if (!fork || inFlight.current) return;
    inFlight.current = true; setBusy(true); setOperation("copy"); setError(null); setForkSent(true);
    try {
      const { shelf: saved } = await json(`/api/shelves/${shelf.id}/fork`, "POST", {
        operation_id: fork.operation_id, expected_updated_at: fork.expected_updated_at, title: fork.title, context: fork.context,
      });
      if (!mounted.current) return;
      setFork(null); setForkSent(false);
      // Clear only this completed operation before navigating to the new Shelf.
      try { sessionStorage.setItem(key, JSON.stringify({ draft, base, pending, fork: null, forkSent: false })); } catch { setStorageError(true); }
      props.onSaved(saved, true);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 400 || status === 422) setForkSent(false);
      if (status === 409) setConflict(true);
      setError(e instanceof Error ? e.message : "コピー結果を確認できませんでした。");
    } finally { inFlight.current = false; setBusy(false); setOperation(null); }
  }
  async function readLatest() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { setLatest((await json(`/api/shelves/${shelf.id}`)).shelf); }
    catch (e) { setError(e instanceof Error ? e.message : "最新の内容を取得できませんでした。"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const locked = busy || generating || !!pending || !ready || props.busy;
  return <div className="workspace shelf-detail-workspace" aria-busy={busy || props.busy}>
    <header className="workspace-heading shelf-heading">
      <div className="shelf-navigation">
        <button className="text-action" onClick={props.onBack}><ArrowLeft size={16} />探す</button>
        <button className="secondary-action" disabled={busy || props.busy || !props.membershipReady} onClick={props.onJoin}>{!props.membershipReady ? "参加状態を確認中" : props.joined ? "参加を解除" : "参加する"}</button>
      </div>
      <h1>{shelf.title}</h1>
      <p>{shelf.context}</p>
      {shelf.forked_from_shelf_id ? <a className="text-action source-reference" href={`/?shelf_id=${encodeURIComponent(shelf.forked_from_shelf_id)}`}>コピー元のグループを見る</a> : null}
      <div className="shelf-edit-actions"><button className="secondary-action" disabled={locked} onClick={() => {
        if (!props.registered) { props.onSignIn(); return; }
        setFork((value) => value ?? { operation_id: crypto.randomUUID(), expected_updated_at: shelf.updated_at, title: shelf.title, context: shelf.context, items: shelf.items });
      }}><Copy size={17} />全件コピー</button>{owner ? <span className="ownership-label">自分のグループ・公開</span> : null}</div>
    </header>
    {storageError ? <p role="alert">このブラウザでは編集を一時保存できません。保存前に閉じると変更が失われます。</p> : null}
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {conflict ? <section className="shelf-conflict" aria-label="グループの競合">
      <h2>別の変更が保存されています</h2>
      <button className="secondary-action" disabled={busy} onClick={() => void readLatest()}>最新の内容を確認</button>
      {latest ? <><h3>{latest.title}</h3><p>{latest.context}</p><ol>{latest.items.map((item) => <li key={item.revision_id}>{item.revision.title}</li>)}</ol>
        <button className="secondary-action" onClick={() => {
          setBase(latest.updated_at); setConflict(false); setLatest(null); setError(null);
          if (fork) { props.onSaved(latest); setFork({ ...fork, operation_id: crypto.randomUUID(), expected_updated_at: latest.updated_at, items: latest.items }); setForkSent(false); }
        }}>{fork ? "この内容でコピーを確認し直す" : "確認した版に自分の編集を適用する"}</button></> : null}
    </section> : null}
    {fork ? <section className="publication-panel" aria-label="全件コピーの確認">
      <h2>グループを全件コピー</h2><p>公開される新しいグループ</p>
      <ShelfDescriptionGenerator userId={userId} disabled={busy || forkSent || conflict} onBusy={setGenerating}
        input={{ title: fork.title, context: fork.context, lists: fork.items.filter(item => !item.revision.withdrawn_at).map(item => ({ title: item.revision.title, tasks: item.revision.tasks.map(task => task.title) })) }}
        onGenerated={value => setFork({ ...fork, ...value })} />
      <fieldset disabled={busy || forkSent || generating}>
        <label>グループ名<input aria-label="コピー先のグループ名" value={fork.title} maxLength={120} onChange={(e) => setFork({ ...fork, title: e.target.value })} /></label>
        <label>対象となる状況<textarea aria-label="コピー先の状況" value={fork.context} maxLength={1200} onChange={(e) => setFork({ ...fork, context: e.target.value })} /></label>
      </fieldset>
      <p>{fork.items.length}件すべて・以下の公開版を固定</p>
      <ol>{fork.items.map((item) => <li key={item.revision_id}>{item.revision.title} <small>{item.revision.published_at.slice(0, 10)} 公開</small></li>)}</ol>
      <div className="shelf-edit-actions"><button className="primary-action" disabled={busy || generating || conflict || !fork.title.trim() || !fork.context.trim()} onClick={() => void copy()}><Copy size={16} />{operation === "copy" ? "コピーしています" : forkSent ? "コピーを再試行" : "公開グループとしてコピー"}</button>
        {!forkSent ? <button className="text-action" disabled={generating} onClick={() => setFork(null)}>キャンセル</button> : null}</div>
    </section> : null}
    {owner ? <section className="shelf-editor" aria-label="グループを編集">
      <ShelfDescriptionGenerator userId={userId} disabled={busy || !!pending || !ready || props.busy || conflict || !!fork} onBusy={setGenerating}
        input={{ title: draft.title, context: draft.context, lists: draft.items.filter(item => !item.revision.withdrawn_at).map(item => ({ title: item.revision.title, tasks: item.revision.tasks.map(task => task.title) })) }}
        onGenerated={value => edit({ ...draft, ...value })} />
      <fieldset className="shelf-detail-fields" disabled={locked || conflict}>
        <label>グループ名<input aria-label="グループ名" value={draft.title} maxLength={120} onChange={(e) => edit({ ...draft, title: e.target.value })} /></label>
        <label>対象となる状況<textarea aria-label="グループの状況" value={draft.context} maxLength={1200} onChange={(e) => edit({ ...draft, context: e.target.value })} /></label>
      </fieldset>
      <div className="shelf-edit-actions"><h2>配置 <small>{draft.items.length}件</small></h2>
        <button className="secondary-action" disabled={locked || conflict || draft.items.length >= 80} onClick={() => setAdding(true)}><Plus size={16} />公開リストを追加</button>
        <button className="icon-button" title="変更を取り消す" aria-label="配置の変更を取り消す" disabled={locked || conflict || !undo.length} onClick={() => { setDraft(undo[undo.length - 1]); setUndo(undo.slice(0, -1)); }}><RotateCcw size={18} /></button>
      </div>
      {adding ? <RevisionPicker userId={userId} selected={draft.items.map((item) => item.revision_id)} onClose={() => setAdding(false)} onAdd={(revision) => {
        edit({ ...draft, items: [...draft.items, { revision_id: revision.id, position: draft.items.length, revision }] }); setAdding(false);
      }} /> : null}
      <div className="cue-stack">{draft.items.map((item, index) => <div className="shelf-revision-row" key={item.revision_id}>
        <RevisionCard revision={item.revision} userId={userId} onSignIn={props.onSignIn} />
        <div className="shelf-item-actions" aria-label={`${item.revision.title}の配置`}>
          <button className="icon-button" title="上へ" aria-label={`${item.revision.title}を上へ`} disabled={locked || conflict || index === 0} onClick={() => reorder(index, -1)}><ArrowUp size={16} /></button>
          <button className="icon-button" title="下へ" aria-label={`${item.revision.title}を下へ`} disabled={locked || conflict || index === draft.items.length - 1} onClick={() => reorder(index, 1)}><ArrowDown size={16} /></button>
          <button className="icon-button danger-action" title="配置から外す" aria-label={`${item.revision.title}を外す`} disabled={locked || conflict} onClick={() => edit({ ...draft, items: draft.items.filter((candidate) => candidate.revision_id !== item.revision_id).map((candidate, position) => ({ ...candidate, position })) })}><Trash2 size={16} /></button>
        </div>
      </div>)}</div>
      {!draft.items.length ? <p>リストはまだありません。</p> : null}
      <div className="shelf-edit-actions"><button className="primary-action" disabled={busy || generating || !ready || conflict || (!dirty && !pending) || !draft.title.trim() || !draft.context.trim()} onClick={() => void save()}><Check size={16} />{operation === "save" ? "保存しています" : pending ? "保存を再試行" : "変更を保存"}</button>
        <span role="status">{operation === "save" ? "保存中" : pending ? "保存結果を未確認" : dirty ? "未保存" : "保存済み"}</span>
        {dirty && !pending ? <button className="text-action" disabled={busy || generating} onClick={() => { setDraft(draftOf(shelf)); setBase(shelf.updated_at); setUndo([]); setConflict(false); setError(null); }}>変更を破棄</button> : null}
      </div>
    </section> : <section aria-label="グループのリスト"><p>{shelf.items.length}件</p>{shelf.items.map((item) => <RevisionCard key={item.revision_id} revision={item.revision} userId={userId} onSignIn={props.onSignIn} />)}{!shelf.items.length ? <p>リストはまだありません。</p> : null}</section>}
  </div>;
}

function RevisionCard({ revision, userId, onSignIn }: { revision: PublicRevisionSummary; userId: string; onSignIn: () => void }) {
  if (revision.withdrawn_at) return <article className="cue-result shelf-revision"><h2>{revision.title}</h2><p>公開停止</p></article>;
  const tasks = revision.tasks.map((task) => ({ ...task, text: task.title }));
  return <article className="cue-result shelf-revision">
    <header className="result-title-row"><div><small>{revision.published_at.slice(0, 10)} 公開</small><h2><a href={`/?revision_id=${encodeURIComponent(revision.id)}`}>{revision.title}</a></h2></div>
      <ScheduledReuse source={{ type: "revision", id: revision.id }} title={revision.title} tasks={tasks} devUserId={userId} onSignIn={onSignIn} />
    </header>
    <TaskList tasks={tasks.slice(0, 3)} metadata />
    {tasks.length > 3 ? <details><summary>全{tasks.length}件を見る</summary><TaskList tasks={tasks.slice(3)} start={3} metadata /></details> : null}
  </article>;
}

function RevisionPicker({ userId, selected, onClose, onAdd }: { userId: string; selected: string[]; onClose: () => void; onAdd: (revision: PublicRevisionSummary) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string; context_text: string; tasks: { text: string }[] }[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PublicRevisionSummary | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { if (trigger?.isConnected) trigger.focus(); };
  }, []);
  async function search(more = false) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await cueApiFetch("/api/search", userId, { method: "POST", body: JSON.stringify(more ? { cursor } : { message: query }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "検索できませんでした。");
      setResults((current) => more ? [...new Map([...current, ...body.results].map((result) => [result.id, result])).values()] : body.results);
      setCursor(body.nextCursor ?? null); setSearched(true); if (!more) setPreview(null);
    } catch (e) { setError(e instanceof Error ? e.message : "検索できませんでした。"); }
    finally { setBusy(false); }
  }
  async function inspect(id: string) {
    setBusy(true); setError(null);
    try {
      const response = await cueApiFetch(`/api/cuebook-revisions/${id}`, userId);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "公開版を取得できませんでした。");
      setPreview(body.revision);
    } catch (e) { setError(e instanceof Error ? e.message : "公開版を取得できませんでした。"); }
    finally { setBusy(false); }
  }
  return <dialog ref={ref} className="result-detail shelf-picker" aria-label="追加する公開リストを探す" onCancel={onClose} onClose={onClose}>
    <header className="detail-toolbar"><h2>公開リストを追加</h2><button className="icon-button" title="閉じる" aria-label="追加を閉じる" onClick={onClose}><X size={18} /></button></header>
    <div className="detail-body">
      <form onSubmit={(event) => { event.preventDefault(); void search(); }}><label>目的や条件<textarea aria-label="追加するリストの検索条件" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button className="primary-action" disabled={busy || !query.trim()}><Search size={16} />検索</button></form>
      {error ? <p role="alert">{error}</p> : null}{busy ? <p role="status">読み込んでいます</p> : null}
      {preview ? <section aria-label="追加する公開版の確認"><h3>{preview.title}</h3><p>{preview.published_at.slice(0, 10)} 公開</p><TaskList tasks={preview.tasks.map((task) => ({ ...task, text: task.title }))} metadata />
        <button className="primary-action" disabled={busy || selected.includes(preview.id)} onClick={() => onAdd(preview)}><Plus size={16} />配置に追加</button></section> : null}
      {results.map((result) => <article className="shelf-picker-result" key={result.id} data-revision-id={result.id}><h3>{result.title}</h3><p>{result.context_text}</p><ol>{result.tasks.slice(0, 3).map((task, index) => <li key={index}>{task.text}</li>)}</ol>
        <button className="secondary-action" disabled={busy || selected.includes(result.id)} onClick={() => void inspect(result.id)}>{selected.includes(result.id) ? "配置済み" : "内容と公開版を確認"}</button></article>)}
      {searched && !results.length && !busy && !error ? <p>条件に合う公開リストはありません。</p> : null}
      {cursor ? <button className="secondary-action" disabled={busy} onClick={() => void search(true)}>続きを読み込む</button> : null}
    </div>
  </dialog>;
}
