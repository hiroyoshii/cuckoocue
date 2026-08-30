"use client";

import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  Database,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { cueApiFetch } from "@/lib/api-client";

type TaskDraft = {
  text: string;
  default_priority: number | null;
  relative_start_day: number | null;
  relative_end_day: number | null;
};

type TaskGrouping = {
  label: string;
  task_offsets: number[];
};

type SearchResult = {
  id: string;
  title: string;
  domain: string | null;
  context_text: string | null;
  tasks: TaskDraft[];
  task_groupings: TaskGrouping[] | null;
  text_matched: boolean;
};

type EnrichmentDraft = {
  domain: string;
  context_text: string;
  task_groupings: TaskGrouping[];
};

const emptyTask = (): TaskDraft => ({
  text: "",
  default_priority: null,
  relative_start_day: null,
  relative_end_day: null,
});

export function CuckooCueWebApp() {
  const [devUserId, setDevUserId] = useState("local-user");
  const [searchMessage, setSearchMessage] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [tasks, setTasks] = useState<TaskDraft[]>([emptyTask(), emptyTask(), emptyTask()]);
  const [enrichment, setEnrichment] = useState<EnrichmentDraft | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [memoryFacts, setMemoryFacts] = useState<string[]>([]);
  const [searchDomain, setSearchDomain] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [targetAnchorDay, setTargetAnchorDay] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [status, setStatus] = useState("Ready");
  const [busyAction, setBusyAction] = useState<
    "search" | "more" | "enrich" | "save" | "import" | null
  >(null);

  const cleanedTasks = useMemo(
    () => tasks.filter((task) => task.text.trim().length > 0),
    [tasks],
  );
  const canSearch = searchMessage.trim().length > 0 && busyAction === null;
  const canPrepareSave =
    saveTitle.trim().length > 0 && cleanedTasks.length > 0 && busyAction === null;
  const canSave = canPrepareSave && enrichment !== null;

  async function searchTaskLists(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("search");
    setStatus("Searching");

    try {
      const response = await cueApiFetch("/api/search", devUserId, {
        method: "POST",
        body: JSON.stringify({ message: searchMessage, page_size: 20 }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Search failed");
      setResults(body.results ?? []);
      setMemoryFacts(body.userProfileAttributes ?? []);
      setSearchDomain(body.searchDomain ?? null);
      setNextCursor(body.nextCursor ?? null);
      setStatus(`${(body.results ?? []).length} results`);
    } catch (error) {
      setResults([]);
      setSearchDomain(null);
      setNextCursor(null);
      setStatus(error instanceof Error ? error.message : "Search failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function loadMoreResults() {
    if (!nextCursor) return;
    setBusyAction("more");
    setStatus("Loading more");

    try {
      const response = await cueApiFetch("/api/search", devUserId, {
        method: "POST",
        body: JSON.stringify({ cursor: nextCursor, page_size: 20 }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Load more failed");
      const nextResults = body.results ?? [];
      setResults([...results, ...nextResults]);
      setNextCursor(body.nextCursor ?? null);
      setStatus(`${results.length + nextResults.length} results`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Load more failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function prepareSave() {
    setBusyAction("enrich");
    setStatus("Preparing review");

    try {
      const response = await cueApiFetch("/api/task-list-enrichment", devUserId, {
        method: "POST",
        body: JSON.stringify({
          title: saveTitle,
          tasks: cleanedTasks,
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Review preparation failed");
      setEnrichment(body.enrichment);
      setStatus("Review ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Review preparation failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveTaskList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrichment) return;
    setBusyAction("save");
    setStatus("Saving");

    try {
      const response = await cueApiFetch("/api/task-list-entries", devUserId, {
        method: "POST",
        body: JSON.stringify({
          title: saveTitle,
          tasks: cleanedTasks,
          domain: enrichment.domain,
          context_text: enrichment.context_text,
          task_groupings: enrichment.task_groupings,
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Save failed");
      setStatus(`Saved ${body.entry.title}`);
      setEnrichment(null);
      setSaveTitle("");
      setTasks([emptyTask(), emptyTask(), emptyTask()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function fetchImportPayload(id: string) {
    setBusyAction("import");
    setStatus("Preparing import");

    try {
      const params = new URLSearchParams({ target_anchor_day: targetAnchorDay });
      const response = await cueApiFetch(
        `/api/import-payload/${id}?${params.toString()}`,
        devUserId,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Import payload failed");
      await navigator.clipboard?.writeText(JSON.stringify(body.importPayload, null, 2));
      setStatus("Import payload copied");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import payload failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Cuckoo Cue</p>
          <h1>再利用する Cue</h1>
        </div>
        <label className="dev-user">
          Dev user
          <input
            value={devUserId}
            onChange={(event) => setDevUserId(event.target.value)}
          />
        </label>
        <div className="project-pill">
          <Database size={16} aria-hidden="true" />
          Corpus
        </div>
      </header>

      <section className="search-surface" aria-labelledby="search-title">
        <form className="search-form" onSubmit={searchTaskLists}>
          <div className="section-heading">
            <Search size={18} aria-hidden="true" />
            <h2 id="search-title">探す</h2>
          </div>
          <textarea
            aria-label="Search query"
            value={searchMessage}
            onChange={(event) => setSearchMessage(event.target.value)}
            placeholder="東京から名古屋へ引っ越す。役所、ライフライン、郵便転送、住所変更を整理したい。"
            rows={4}
          />
          <div className="search-actions">
            <label className="anchor-control" htmlFor="target-anchor-day">
              <CalendarDays size={15} aria-hidden="true" />
              <input
                id="target-anchor-day"
                type="date"
                value={targetAnchorDay}
                onChange={(event) => setTargetAnchorDay(event.target.value)}
              />
            </label>
            <button type="submit" disabled={!canSearch}>
              {busyAction === "search" ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <Search size={16} aria-hidden="true" />
              )}
              探す
            </button>
          </div>
        </form>

        <div className="search-meta" aria-live="polite">
          <span>{statusLabel(status)}</span>
          {searchDomain ? <span>{searchDomain}</span> : null}
          {memoryFacts.slice(0, 4).map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
      </section>

      <section className="content-grid">
        <section className="results-section" aria-label="Search results">
          {results.length === 0 ? (
            <div className="empty-state">
              <p>Cuckoo Cue</p>
              <span>検索すると Cue がここへ並びます。</span>
            </div>
          ) : (
            <div className="results-list">
              {results.map((result) => (
                <article className="result-card" key={result.id}>
                  <div className="cue-main-row">
                    <span className="check-box" aria-hidden="true" />
                    <span className="cue-dot" aria-hidden="true" />
                    <div className="cue-title-block">
                      <p className="eyebrow">{result.domain ?? "未分類"}</p>
                      <h2>{result.title}</h2>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`${result.title} を import`}
                      onClick={() => fetchImportPayload(result.id)}
                    >
                      {busyAction === "import" ? (
                        <Loader2 className="spin" size={17} aria-hidden="true" />
                      ) : (
                        <ArrowDownToLine size={17} aria-hidden="true" />
                      )}
                    </button>
                    <div className="priority-bars" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                  <div className="result-body">
                    {result.context_text ? (
                      <p className="context-text">{result.context_text}</p>
                    ) : null}
                    {result.task_groupings?.length ? (
                      <div className="group-strip" aria-label="Task groups">
                        {result.task_groupings.map((group) => (
                          <span key={group.label}>{group.label}</span>
                        ))}
                      </div>
                    ) : null}
                    <details className="task-details">
                      <summary>{result.tasks.length} tasks</summary>
                      <ol>
                        {result.tasks.map((task, index) => (
                          <li key={`${result.id}-${index}`}>
                            <span>{task.text}</span>
                            <small>
                              {formatDayRange(
                                task.relative_start_day,
                                task.relative_end_day,
                              )}
                            </small>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </div>
                </article>
              ))}
              {nextCursor ? (
                <button
                  type="button"
                  className="load-more-button"
                  disabled={busyAction !== null}
                  onClick={loadMoreResults}
                >
                  {busyAction === "more" ? (
                    <Loader2 className="spin" size={16} aria-hidden="true" />
                  ) : (
                    <MoreHorizontal size={16} aria-hidden="true" />
                  )}
                  さらに見る
                </button>
              ) : null}
            </div>
          )}
        </section>

        <form className="save-panel" onSubmit={saveTaskList}>
          <div className="section-heading">
            <ListPlus size={18} aria-hidden="true" />
            <h2>残す</h2>
          </div>
          <label htmlFor="save-title">完了した Cue 面</label>
          <input
            id="save-title"
            value={saveTitle}
            onChange={(event) => {
              setSaveTitle(event.target.value);
              setEnrichment(null);
            }}
            placeholder="東京から名古屋への引っ越し手続き"
          />

          <div className="task-editor" aria-label="Tasks to save">
            <div className="task-editor-head" aria-hidden="true">
              <span>Cue</span>
              <span>Pri</span>
              <span>Start</span>
              <span>End</span>
              <span />
            </div>
            {tasks.map((task, index) => (
              <div className="task-edit-row" key={index}>
                <input
                  aria-label={`Task ${index + 1}`}
                  value={task.text}
                  onChange={(event) => updateTask(index, { text: event.target.value })}
                  placeholder="手続きや確認事項"
                />
                <input
                  aria-label={`Priority ${index + 1}`}
                  className="small-input"
                  type="number"
                  value={task.default_priority ?? ""}
                  onChange={(event) =>
                    updateTask(index, {
                      default_priority:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
                <input
                  aria-label={`Relative start day ${index + 1}`}
                  className="small-input"
                  type="number"
                  value={task.relative_start_day ?? ""}
                  onChange={(event) =>
                    updateTask(index, {
                      relative_start_day:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
                <input
                  aria-label={`Relative end day ${index + 1}`}
                  className="small-input"
                  type="number"
                  value={task.relative_end_day ?? ""}
                  onChange={(event) =>
                    updateTask(index, {
                      relative_end_day:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
                <button
                  type="button"
                  className="ghost-icon"
                  aria-label={`Remove task ${index + 1}`}
                  onClick={() => removeTask(index)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setTasks([...tasks, emptyTask()])}
            >
              <Plus size={16} aria-hidden="true" />
              追加
            </button>
            <button type="button" disabled={!canPrepareSave} onClick={prepareSave}>
              {busyAction === "enrich" ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <WandSparkles size={16} aria-hidden="true" />
              )}
              確認
            </button>
          </div>

          {enrichment ? (
            <section className="review-panel" aria-label="Save review">
                <label htmlFor="review-domain">Domain</label>
              <input
                id="review-domain"
                value={enrichment.domain}
                onChange={(event) =>
                  setEnrichment({ ...enrichment, domain: event.target.value })
                }
              />
                <label htmlFor="review-context">Context</label>
              <textarea
                id="review-context"
                value={enrichment.context_text}
                onChange={(event) =>
                  setEnrichment({ ...enrichment, context_text: event.target.value })
                }
                rows={4}
              />
              <div className="group-editor">
                {enrichment.task_groupings.map((group, index) => (
                  <div className="group-edit-row" key={index}>
                    <input
                      aria-label={`Group label ${index + 1}`}
                      value={group.label}
                      onChange={(event) => updateGrouping(index, "label", event.target.value)}
                    />
                    <input
                      aria-label={`Group task offsets ${index + 1}`}
                      value={group.task_offsets.join(",")}
                      onChange={(event) =>
                        updateGrouping(index, "task_offsets", parseOffsets(event.target.value))
                      }
                    />
                  </div>
                ))}
              </div>
              <button type="submit" disabled={!canSave}>
                {busyAction === "save" ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  <Check size={16} aria-hidden="true" />
                )}
                保存
              </button>
            </section>
          ) : null}
        </form>
      </section>
    </main>
  );

  function updateTask(index: number, patch: Partial<TaskDraft>) {
    const next = [...tasks];
    next[index] = { ...next[index], ...patch };
    setTasks(next);
    setEnrichment(null);
  }

  function removeTask(index: number) {
    const next = tasks.filter((_, taskIndex) => taskIndex !== index);
    setTasks(next.length > 0 ? next : [emptyTask()]);
    setEnrichment(null);
  }

  function updateGrouping(
    index: number,
    key: keyof TaskGrouping,
    value: string | number[],
  ) {
    if (!enrichment) return;
    const next = [...enrichment.task_groupings];
    next[index] = { ...next[index], [key]: value };
    setEnrichment({ ...enrichment, task_groupings: next });
  }
}

function parseOffsets(value: string): number[] {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

function formatDayRange(start: number | null, end: number | null): string {
  if (start === null && end === null) return "no date";
  if (start === end) return dayLabel(start);
  return `${dayLabel(start)} to ${dayLabel(end)}`;
}

function dayLabel(value: number | null): string {
  if (value === null) return "any";
  if (value === 0) return "day 0";
  return value > 0 ? `+${value}d` : `${value}d`;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    Ready: "待機中",
    Searching: "検索中",
    "Loading more": "読み込み中",
    "Preparing review": "確認中",
    "Review ready": "確認できます",
    Saving: "保存中",
    "Preparing import": "取り込み準備中",
    "Import payload copied": "取り込み内容をコピーしました",
  };
  const count = status.match(/^(\d+) results$/);
  if (count) return `${count[1]}件`;
  const saved = status.match(/^Saved (.+)$/);
  if (saved) return `保存しました: ${saved[1]}`;
  return labels[status] ?? status;
}
