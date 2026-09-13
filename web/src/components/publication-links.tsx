"use client";

import { useEffect, useState } from "react";
import { cueApiFetch } from "@/lib/api-client";

type Published = { id: string; title: string; published_at: string; withdrawn_at: string | null; shelves: { id: string; title: string }[] };
export function PublicationLinks({ id, userId }: { id: string; userId: string }) {
  const [items, setItems] = useState<Published[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void cueApiFetch(`/api/cuebooks/${encodeURIComponent(id)}/revisions`, userId, { signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error();
      if (!controller.signal.aborted) { setItems(body.revisions ?? []); setError(false); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [id, userId, attempt]);
  if (error) return <p role="alert">公開済みの版を取得できませんでした。<button type="button" onClick={() => setAttempt(attempt + 1)}>再取得</button></p>;
  if (!items.length) return null;
  return <section className="publication-panel" aria-label="公開済みの版"><h2>公開済みの版</h2><ul>{items.map(item => <li key={item.id}>
    {item.withdrawn_at ? <span>{item.title}（公開停止）</span> : <a href={`/?revision_id=${encodeURIComponent(item.id)}`}>{item.title} · {item.published_at.slice(0, 10)}</a>}
    {item.shelves.map(shelf => <a className="text-action" key={shelf.id} href={`/?shelf_id=${encodeURIComponent(shelf.id)}`}>{shelf.title}</a>)}
  </li>)}</ul></section>;
}
