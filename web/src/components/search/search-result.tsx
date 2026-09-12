"use client";

import { ArrowDownToLine, ChevronDown, Library, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { TaskList } from "../tasks/task-list";
import type { TaskDraft } from "../tasks/task-values";

export type SearchResult = {
  id: string;
  title: string;
  domain: string | null;
  context_text: string | null;
  tasks: TaskDraft[];
  task_groupings: { label: string; task_offsets: number[] }[] | null;
  text_matched: boolean;
  shelves?: { id: string; title: string }[];
};

export function SearchResultItem({ result, onImport, onOpenShelf, disabled, expanded, onExpand }: {
  result: SearchResult;
  onImport: () => void;
  onOpenShelf: (id: string) => void;
  disabled: boolean;
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
}) {
  const [detail, setDetail] = useState(false);
  const contentId = useId();
  return <article className="search-result-item cue-result">
    <header>
      <h2><button type="button" onClick={() => setDetail(true)}>{result.title}</button></h2>
      <span className="result-facts">{result.tasks.length}タスク{result.domain ? ` · ${result.domain}` : ""}</span>
    </header>
    {result.context_text ? <p className="result-context">{result.context_text}</p> : null}
    <RelatedShelves shelves={result.shelves} onOpen={onOpenShelf} disabled={disabled} />
    <div className="task-preview"><TaskList tasks={result.tasks.slice(0, 3)} /></div>
    {result.tasks.length > 3 ? <>
      <div id={contentId} hidden={!expanded}><TaskList tasks={result.tasks.slice(3)} start={3} /></div>
      <button type="button" className="text-action expand-tasks" aria-expanded={expanded} aria-controls={contentId} onClick={() => onExpand(!expanded)}>
        <ChevronDown size={16} aria-hidden="true" />{expanded ? "折りたたむ" : `全${result.tasks.length}件を見る`}
      </button>
    </> : null}
    <footer>
      <button type="button" className="text-action" onClick={() => setDetail(true)}>内容を見る</button>
      <button type="button" className="secondary-action" disabled={disabled} onClick={onImport} aria-label={`${result.title}をAndroidに取り込む`}><ArrowDownToLine size={17} />取り込む</button>
    </footer>
    {detail ? <ResultDetail result={result} onClose={() => setDetail(false)} onImport={() => { setDetail(false); onImport(); }} onOpenShelf={(id) => { setDetail(false); onOpenShelf(id); }} disabled={disabled} /> : null}
  </article>;
}

function ResultDetail({ result, onClose, onImport, onOpenShelf, disabled }: {
  result: SearchResult;
  onClose: () => void;
  onImport: () => void;
  onOpenShelf: (id: string) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className="result-detail" aria-labelledby={titleId} onCancel={onClose} onClose={onClose}>
    <header className="detail-toolbar"><span>リストの内容</span><button type="button" className="icon-button" aria-label="内容を閉じる" title="閉じる" onClick={onClose}><X size={20} /></button></header>
    <div className="detail-body">
      <h2 id={titleId}>{result.title}</h2>
      <p className="result-facts">{result.tasks.length}タスク{result.domain ? ` · ${result.domain}` : ""}</p>
      {result.context_text ? <p className="detail-context">{result.context_text}</p> : null}
      <RelatedShelves shelves={result.shelves} onOpen={onOpenShelf} disabled={disabled} />
      {result.task_groupings?.length ? <p className="result-facts">{result.task_groupings.map((group) => group.label).join(" · ")}</p> : null}
      <TaskList tasks={result.tasks} metadata />
    </div>
    <footer><button type="button" className="primary-action" disabled={disabled} onClick={onImport}><ArrowDownToLine size={18} />取り込む</button></footer>
  </dialog>;
}

function RelatedShelves({ shelves, onOpen, disabled }: { shelves: SearchResult["shelves"]; onOpen: (id: string) => void; disabled: boolean }) {
  if (!shelves?.length) return null;
  return <nav className="result-shelves" aria-label="関連グループ">{shelves.map((shelf) => <button type="button" className="text-action" key={shelf.id} data-shelf-id={shelf.id} disabled={disabled} onClick={() => onOpen(shelf.id)}><Library size={16} aria-hidden="true" />{shelf.title}</button>)}</nav>;
}
