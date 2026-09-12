"use client";

import { useEffect, useRef, useState } from "react";
import { cueAccountId, cueApiFetch } from "@/lib/api-client";
import type { Cuebook } from "@/lib/cuebook-schema";

export function PublishCuebook({ cuebook, devUserId, shelves, onPublished }: {
  cuebook: Cuebook; devUserId: string;
  shelves: Array<{ id: string; title: string }>;
  onPublished: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [shelfId, setShelfId] = useState("");
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [ids, setIds] = useState(() => ({ shelf: crypto.randomUUID(), revision: crypto.randomUUID() }));
  const [submitted, setSubmitted] = useState(false);
  const [restored, setRestored] = useState(false);
  const inFlight = useRef(false);
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
          }
        }
      } catch { setError("公開操作の一時保存を読み込めませんでした。"); }
      setRestored(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [key]);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(key, JSON.stringify({ ids, open, shelfId, title, context, confirmed, submitted, published })); }
    catch { /* The server still protects retries within this open page. */ }
  }, [key, restored, ids, open, shelfId, title, context, confirmed, submitted, published]);
  async function publish() {
    if (inFlight.current || published || !confirmed) return;
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
      }
      const response = await cueApiFetch("/api/cuebook-revisions", devUserId, { method: "POST", body: JSON.stringify({
        revision_id: ids.revision, source_cuebook_id: cuebook.id, expected_source_updated_at: cuebook.updated_at,
        shelf_id: destination, title: cuebook.title,
        tasks: cuebook.tasks.map((task) => ({ title: task.text, default_priority: task.default_priority, relative_start_day: task.relative_start_day, relative_end_day: task.relative_end_day })),
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "公開できませんでした。自分用の保存は完了しています。");
      setPublished(true); onPublished();
    } catch (e) { setError(e instanceof Error ? e.message : "公開できませんでした。"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (published) return <p role="status">公開しました。</p>;
  if (!open) return <button type="button" className="secondary-action post-save-action" disabled={!cuebook.enrichment || !restored} onClick={() => setOpen(true)}>グループに公開する</button>;
  return <section className="publication-panel" aria-label="公開先の確認">
    <h2>グループに公開</h2>
    <fieldset disabled={submitted || busy}>
      <label>公開先<select aria-label="公開先" value={shelfId} onChange={(event) => setShelfId(event.target.value)}><option value="">新しいグループ</option>{shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.title}</option>)}</select></label>
      {!shelfId ? <><label>グループ名<input aria-label="グループ名" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label><label>対象となる状況<textarea aria-label="対象となる状況" value={context} maxLength={1200} rows={2} onChange={(event) => setContext(event.target.value)} /></label></> : null}
      <label className="publish-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />個人情報が含まれていないことを確認し、公開する</label>
    </fieldset>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    <button type="button" className="primary-action" disabled={busy || !confirmed || (!shelfId && (!title.trim() || !context.trim()))} onClick={() => void publish()}>{busy ? "公開しています" : submitted ? "公開を再試行" : "公開する"}</button>
  </section>;
}
