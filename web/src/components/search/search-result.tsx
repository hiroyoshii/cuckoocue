"use client";

import { ArrowDownToLine, ChevronDown, Library } from "lucide-react";
import { useId } from "react";
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
  const contentId = useId();
  return <article className="search-result-item cue-result">
    <header>
      <h2><button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => onExpand(!expanded)}>{result.title}</button></h2>
      <span className="result-facts">{result.tasks.length}タスク{result.domain ? ` · ${result.domain}` : ""}</span>
    </header>
    {result.context_text ? <p className={`result-context${expanded ? "" : " result-context-preview"}`}>{result.context_text}</p> : null}
    <RelatedShelves shelves={result.shelves} onOpen={onOpenShelf} disabled={disabled} />
    {!expanded ? <p className="result-task-preview">{result.tasks.slice(0, 3).map(task => task.text).join(" / ")}</p> : null}
    <div id={contentId} hidden={!expanded}>
      {expanded ? <>
        <a className="text-action" href={`/?revision_id=${encodeURIComponent(result.id)}`}>この公開版を開く</a>
        {result.task_groupings?.length ? <p className="result-facts">{result.task_groupings.map(group => group.label).join(" · ")}</p> : null}
        <TaskList tasks={result.tasks} metadata />
      </> : null}
    </div>
    <footer>
      <button type="button" className="text-action expand-tasks" aria-expanded={expanded} aria-controls={contentId} onClick={() => onExpand(!expanded)}>
        <ChevronDown size={16} aria-hidden="true" />{expanded ? "折りたたむ" : `全${result.tasks.length}件を見る`}
      </button>
      <button type="button" className="secondary-action" disabled={disabled} onClick={onImport} aria-label={`${result.title}の日程を決めて使う`}><ArrowDownToLine size={17} />日程を決めて使う</button>
    </footer>
  </article>;
}

export function RelatedShelves({ shelves, onOpen, disabled }: { shelves: SearchResult["shelves"]; onOpen: (id: string) => void; disabled: boolean }) {
  if (!shelves?.length) return null;
  return <nav className="result-shelves" aria-label="関連グループ">{shelves.map((shelf) => <button type="button" className="text-action" key={shelf.id} data-shelf-id={shelf.id} disabled={disabled} onClick={() => onOpen(shelf.id)}><Library size={16} aria-hidden="true" />{shelf.title}</button>)}</nav>;
}
