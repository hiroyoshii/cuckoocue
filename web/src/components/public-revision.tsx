"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { cueApiFetch } from "@/lib/api-client";
import type { PublicRevisionDetail } from "@/lib/shelves";
import { TaskList } from "./tasks/task-list";
import { ScheduledReuse } from "./scheduled-reuse";
import { RelatedShelves } from "./search/search-result";

export function PublicRevision({ id, userId, onBack, onSignIn, onOpenShelf }: { id: string; userId: string; onBack: () => void; onSignIn: () => void; onOpenShelf: (id: string) => void }) {
  const [revision, setRevision] = useState<PublicRevisionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void cueApiFetch(`/api/cuebook-revisions/${encodeURIComponent(id)}`, userId, { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "公開版を読み込めませんでした。");
      if (!controller.signal.aborted) { setRevision(body.revision); setError(null); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [id, userId, attempt]);
  return <div className="workspace public-revision-workspace"><button className="text-action" onClick={onBack}><ArrowLeft size={16} />探す</button>
    {error ? <p role="alert">{error}<button onClick={() => setAttempt(attempt + 1)}>再取得</button></p> : revision ? <>
      <header className="workspace-heading"><h1>{revision.title}</h1><small>{revision.published_at.slice(0, 10)} 公開</small></header>
      <p className="result-facts">{revision.tasks.length}タスク{revision.domain ? ` · ${revision.domain}` : ""}</p>
      {revision.context_text ? <p className="detail-context">{revision.context_text}</p> : null}
      <RelatedShelves shelves={revision.shelves} onOpen={onOpenShelf} disabled={false} />
      {revision.task_groupings?.length ? <p className="result-facts">{revision.task_groupings.map(group => group.label).join(" · ")}</p> : null}
      <TaskList tasks={revision.tasks.map(t => ({ ...t, text: t.title }))} metadata />
      <ScheduledReuse source={{ type: "revision", id }} title={revision.title} tasks={revision.tasks.map(t => ({ ...t, text: t.title }))} devUserId={userId} onSignIn={onSignIn} />
    </> : <p role="status">読み込んでいます</p>}
  </div>;
}
