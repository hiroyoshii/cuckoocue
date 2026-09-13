"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { cueAccountId, cueApiFetch } from "@/lib/api-client";
import type { Cuebook } from "@/lib/cuebook-schema";
import { ShelfDescriptionGenerator } from "./shelf-description-generator";

export function PublishCuebook({ cuebook, devUserId, shelves, onPublished, onReloadOriginal }: {
  cuebook: Cuebook; devUserId: string;
  shelves: Array<{ id: string; title: string }>;
  onPublished: () => void;
  onReloadOriginal: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [shelfId, setShelfId] = useState("");
  const [createdShelf, setCreatedShelf] = useState<{ id: string; title: string } | null>(null);
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [publishedResult, setPublishedResult] = useState<{ revision: string; shelf: string } | null>(null);
  const [rejected, setRejected] = useState(false);
  const [ids, setIds] = useState(() => ({ shelf: crypto.randomUUID(), revision: crypto.randomUUID() }));
  const [submitted, setSubmitted] = useState(false);
  const [restored, setRestored] = useState(false);
  const inFlight = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (published) resultRef.current?.focus();
  }, [published]);
  const key = `cuckoo-cue:publication:${cueAccountId(devUserId)}:${cuebook.id}:${cuebook.updated_at}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const value = JSON.parse(raw);
          if (typeof value.ids?.shelf === "string" && typeof value.ids?.revision === "string") {
            setIds(value.ids); setOpen(Boolean(value.open)); setShelfId(String(value.shelfId ?? ""));
            setTitle(String(value.title ?? "")); setContext(String(value.context ?? ""));
            setConfirmed(Boolean(value.confirmed)); setSubmitted(Boolean(value.submitted)); setPublished(Boolean(value.published));
            setRejected(Boolean(value.rejected)); setPublishedResult(value.publishedResult ?? null);
            setCreatedShelf(value.createdShelf ?? null);
          }
        }
      } catch { setError("公開操作の一時保存を読み込めませんでした。"); }
      setRestored(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [key]);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(key, JSON.stringify({ ids, open, shelfId, title, context, confirmed, submitted, published, rejected, publishedResult, createdShelf })); }
    catch { /* The server still protects retries within this open page. */ }
  }, [key, restored, ids, open, shelfId, title, context, confirmed, submitted, published, rejected, publishedResult, createdShelf]);
  async function publish() {
    if (inFlight.current || generating || published || !confirmed || rejected) return;
    inFlight.current = true;
    setBusy(true); setError(null); setSubmitted(true);
    try {
      let destination = shelfId;
      if (!destination) {
        const response = await cueApiFetch("/api/shelves", devUserId, { method: "POST", body: JSON.stringify({ operation_id: ids.shelf, title, context }) });
        const body = await response.json();
        if (!response.ok) {
          // Validation rejection precedes any Shelf write; its input can be corrected.
          if (response.status === 400 || response.status === 422) setSubmitted(false);
          throw new Error(body.error || "公開先を作成できませんでした。");
        }
        destination = body.shelf.id;
        setCreatedShelf({ id: destination, title: body.shelf.title }); setShelfId(destination);
      }
      const response = await cueApiFetch("/api/cuebook-revisions", devUserId, { method: "POST", body: JSON.stringify({
        revision_id: ids.revision, source_cuebook_id: cuebook.id, expected_source_updated_at: cuebook.updated_at,
        shelf_id: destination, title: cuebook.title,
        tasks: cuebook.tasks.map((task) => ({ title: task.text, default_priority: task.default_priority, relative_start_day: task.relative_start_day, relative_end_day: task.relative_end_day })),
      }) });
      const body = await response.json();
      if (!response.ok) {
        if ([400, 403, 404, 409, 410, 422].includes(response.status)) setRejected(true);
        throw new Error(body.error || "公開できませんでした。自分用の保存は完了しています。");
      }
      setPublishedResult({ revision: body.revision.id, shelf: body.shelf.id });
      setPublished(true); onPublished();
    } catch (e) { setError(e instanceof Error ? e.message : "公開できませんでした。"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (published) return <section ref={resultRef} tabIndex={-1} className="publication-panel"><p role="status">公開しました。</p>{publishedResult ? <nav aria-label="公開した内容">
    <a className="text-action" href={`/?revision_id=${encodeURIComponent(publishedResult.revision)}`}>公開した版を見る</a>
    <a className="text-action" href={`/?shelf_id=${encodeURIComponent(publishedResult.shelf)}`}>公開先のグループを見る</a>
  </nav> : null}</section>;
  return <><button ref={triggerRef} type="button" className="secondary-action post-save-action" disabled={!cuebook.enrichment || !restored} onClick={() => setOpen(true)}>グループに公開する</button>
    {open ? <PublicationDialog busy={busy} returnFocusRef={triggerRef} onClose={() => setOpen(false)}>
    <section className="publication-panel" aria-label="公開先の確認">
    <p className="publication-summary"><strong>{cuebook.title}</strong><span>{cuebook.tasks.length}タスク・保存済みの内容</span></p>
    {!shelfId ? <ShelfDescriptionGenerator userId={devUserId} disabled={submitted || busy}
      automatic={!title.trim() && !context.trim()} onBusy={setGenerating}
      input={{ title, context, lists: [{ title: cuebook.title, context: cuebook.enrichment?.context_text ?? "", tasks: cuebook.tasks.map(task => task.text) }] }}
      onGenerated={value => { setTitle(value.title); setContext(value.context); setConfirmed(false); }} /> : null}
    <fieldset disabled={submitted || busy}>
      <label>公開先<select aria-label="公開先" value={shelfId} onChange={(event) => {
        setShelfId(event.target.value);
        if (!event.target.value && createdShelf) setIds(value => ({ ...value, shelf: crypto.randomUUID() }));
      }}><option value="">新しいグループ</option>{createdShelf && !shelves.some(shelf => shelf.id === createdShelf.id) ? <option value={createdShelf.id}>{createdShelf.title}</option> : null}{shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.title}</option>)}</select></label>
      {!shelfId ? <><label>グループ名<input aria-label="グループ名" disabled={generating} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label><label>対象となる状況<textarea aria-label="対象となる状況" disabled={generating} value={context} maxLength={1200} rows={2} onChange={(event) => setContext(event.target.value)} /></label></> : null}
      <label className="publish-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />個人情報が含まれていないことを確認し、公開する</label>
    </fieldset>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {rejected ? <div className="shelf-edit-actions">
      <button type="button" className="secondary-action" onClick={onReloadOriginal}>最新の原本を確認</button>
      <button type="button" className="secondary-action" onClick={() => {
        setIds(value => ({ ...value, revision: crypto.randomUUID() })); setRejected(false); setSubmitted(false); setConfirmed(false); setError(null);
      }}>公開先を確認し直す</button>
    </div> : <button type="button" className="primary-action" disabled={busy || generating || !confirmed || (!shelfId && (!title.trim() || !context.trim()))} onClick={() => void publish()}>{busy ? "公開しています" : submitted ? "公開を再試行" : "公開する"}</button>}
  </section></PublicationDialog> : null}</>;
}

function PublicationDialog({ children, busy, returnFocusRef, onClose }: { children: ReactNode; busy: boolean; returnFocusRef: RefObject<HTMLElement | null>; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const returnTarget = returnFocusRef.current;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);
  return <dialog ref={ref} className="publication-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="detail-toolbar"><h2 id={titleId}>グループに公開</h2><button type="button" className="icon-button" aria-label="公開先の確認を閉じる" title="閉じる" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    {children}
  </dialog>;
}
