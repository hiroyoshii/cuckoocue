"use client";

import {
  AlertCircle, ArrowDownToLine, CalendarDays, Check, ChevronDown, Circle,
  GripVertical, Layers3, ListChecks, Loader2, LogIn, LogOut, MoreHorizontal,
  Plus, RotateCcw, Search, Smartphone, Square, Tag, Trash2, User,
  WandSparkles,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { cueApiFetch } from "@/lib/api-client";
import { firebaseAuth, hasFirebaseClientConfig } from "@/lib/firebase-client";
import {
  buildAndroidImportUri,
  decodeSaveReviewTransfer,
  type AndroidImportTransfer,
} from "@/lib/run-transfer";
import { BrandMark } from "./brand-mark";

type TaskDraft = {
  text: string;
  default_priority: number | null;
  relative_start_day: number | null;
  relative_end_day: number | null;
};
type TaskGrouping = { label: string; task_offsets: number[] };
type SearchResult = {
  id: string;
  title: string;
  domain: string | null;
  context_text: string | null;
  tasks: TaskDraft[];
  task_groupings: TaskGrouping[] | null;
  text_matched: boolean;
};
type EnrichmentDraft = { domain: string; context_text: string; task_groupings: TaskGrouping[] };
type ImportPayload = Omit<AndroidImportTransfer, "version"> & { source_task_list_entry_id: string };

const emptyTask = (): TaskDraft => ({
  text: "", default_priority: null, relative_start_day: null, relative_end_day: null,
});

export function CuckooCueWebApp() {
  const [view, setView] = useState<"search" | "save">("search");
  const [devUserId, setDevUserId] = useState("local-user");
  const [authReady, setAuthReady] = useState(!hasFirebaseClientConfig());
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [searchMessage, setSearchMessage] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [tasks, setTasks] = useState<TaskDraft[]>([emptyTask(), emptyTask(), emptyTask()]);
  const [enrichment, setEnrichment] = useState<EnrichmentDraft | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchDomain, setSearchDomain] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [preparedImport, setPreparedImport] = useState<ImportPayload | null>(null);
  const [androidImportUri, setAndroidImportUri] = useState<string | null>(null);
  const [targetAnchorDay, setTargetAnchorDay] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    "search" | "more" | "enrich" | "save" | "import" | null
  >(null);
  const saveOperationId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!hasFirebaseClientConfig()) return;
    return onAuthStateChanged(firebaseAuth(), (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const encoded = url.searchParams.get("save");
    if (!encoded) return;
    const transfer = decodeSaveReviewTransfer(encoded);
    /* eslint-disable react-hooks/set-state-in-effect -- URL handoff initializes this client-only workspace. */
    if (!transfer) {
      setErrorMessage("Android から受け取った内容を読み込めませんでした。");
      return;
    }
    setSaveTitle(transfer.title);
    setTasks(transfer.tasks);
    setView("save");
    setStatus("Completed list received");
    /* eslint-enable react-hooks/set-state-in-effect */
    url.searchParams.delete("save");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const cleanedTasks = useMemo(
    () => tasks.filter((task) => task.text.trim().length > 0),
    [tasks],
  );
  const canSearch = searchMessage.trim().length > 0 && busyAction === null;
  const canPrepareSave = saveTitle.trim().length > 0 && cleanedTasks.length > 0 && busyAction === null;
  const canSave = canPrepareSave && enrichment !== null;

  async function signInWithGoogle() {
    setErrorMessage(null);
    const auth = firebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ログインできませんでした。");
    }
  }

  async function searchTaskLists(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!searchMessage.trim()) return;
    setBusyAction("search");
    setStatus("Searching");
    setErrorMessage(null);
    setPreparedImport(null);
    setAndroidImportUri(null);
    setHasSearched(true);
    try {
      const response = await cueApiFetch("/api/search", devUserId, {
        method: "POST",
        body: JSON.stringify({ message: searchMessage, page_size: 20 }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Search failed");
      setResults(body.results ?? []);
      setSearchDomain(body.searchDomain ?? null);
      setNextCursor(body.nextCursor ?? null);
      setStatus(`${(body.results ?? []).length} results`);
    } catch (error) {
      setResults([]);
      setSearchDomain(null);
      setNextCursor(null);
      setStatus("Search failed");
      setErrorMessage(error instanceof Error ? error.message : "検索に失敗しました。");
    } finally {
      setBusyAction(null);
    }
  }

  async function loadMoreResults() {
    if (!nextCursor) return;
    setBusyAction("more");
    setErrorMessage(null);
    try {
      const response = await cueApiFetch("/api/search", devUserId, {
        method: "POST",
        body: JSON.stringify({ cursor: nextCursor, page_size: 20 }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Load more failed");
      const nextResults = body.results ?? [];
      setResults((current) => [...current, ...nextResults]);
      setNextCursor(body.nextCursor ?? null);
      setStatus(`${results.length + nextResults.length} results`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "続きを読み込めませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function prepareSave() {
    setBusyAction("enrich");
    setStatus("Preparing review");
    setErrorMessage(null);
    try {
      const response = await cueApiFetch("/api/task-list-enrichment", devUserId, {
        method: "POST",
        body: JSON.stringify({ title: saveTitle, tasks: cleanedTasks }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Review preparation failed");
      setEnrichment(body.enrichment);
      setStatus("Review ready");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "確認内容を作れませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveTaskList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrichment) return;
    setBusyAction("save");
    setErrorMessage(null);
    try {
      const response = await cueApiFetch("/api/task-list-entries", devUserId, {
        method: "POST",
        body: JSON.stringify({
          operation_id: saveOperationId.current,
          title: saveTitle,
          tasks: cleanedTasks,
          domain: enrichment.domain,
          context_text: enrichment.context_text,
          task_groupings: enrichment.task_groupings,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Save failed");
      setSavedTitle(body.entry.title);
      saveOperationId.current = crypto.randomUUID();
      setStatus(`Saved ${body.entry.title}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function prepareAndroidImport(id: string) {
    setBusyAction("import");
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ target_anchor_day: targetAnchorDay });
      const response = await cueApiFetch(`/api/import-payload/${id}?${params}`, devUserId);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Import payload failed");
      const payload = body.importPayload as ImportPayload;
      const uri = buildAndroidImportUri({
        version: 1,
        title: payload.title,
        target_anchor_day: payload.target_anchor_day,
        tasks: payload.tasks,
      });
      setPreparedImport(payload);
      setAndroidImportUri(uri);
      setStatus("Import ready");
      if (/Android/i.test(navigator.userAgent)) window.location.assign(uri);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Android 用の内容を準備できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  function resetSave() {
    setSaveTitle("");
    setTasks([emptyTask(), emptyTask(), emptyTask()]);
    setEnrichment(null);
    setSavedTitle(null);
    setErrorMessage(null);
    setStatus("Ready");
    saveOperationId.current = crypto.randomUUID();
  }

  if (!authReady) {
    return <AuthWorkspace loading />;
  }

  if (hasFirebaseClientConfig() && !user) {
    return <AuthWorkspace errorMessage={errorMessage} onSignIn={signInWithGoogle} />;
  }

  return (
    <main className="product-shell">
      <aside className="product-rail">
        <a className="brand-lockup" href="#top" aria-label="Cuckoo Cue">
          <BrandMark size={42} />
          <span><strong>Cuckoo Cue</strong><small>次の自分へ渡す</small></span>
        </a>
        <nav aria-label="主な操作">
          <button className={view === "search" ? "active" : ""} onClick={() => setView("search")}>
            <Search size={18} aria-hidden="true" />探す
          </button>
          <button className={view === "save" ? "active" : ""} onClick={() => setView("save")}>
            <ListChecks size={18} aria-hidden="true" />残す
          </button>
        </nav>
        <details className="connection-panel">
          <summary><User size={17} aria-hidden="true" />{user?.displayName ?? "接続"}</summary>
          {user ? (
            <button type="button" onClick={() => signOut(firebaseAuth())}><LogOut size={15} />ログアウト</button>
          ) : (
            <label>Dev user<input value={devUserId} onChange={(event) => setDevUserId(event.target.value)} /></label>
          )}
        </details>
      </aside>

      <section className="product-main" id="top">
        <MobileHeader view={view} onChange={setView} />
        {errorMessage ? (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span><strong>処理を完了できませんでした</strong><small>{errorMessage}</small></span>
            {view === "search" ? (
              <button type="button" onClick={() => searchTaskLists()} disabled={!canSearch}>
                <RotateCcw size={16} aria-hidden="true" />再検索
              </button>
            ) : null}
          </div>
        ) : null}

        {view === "search" ? (
          <SearchWorkspace
            searchMessage={searchMessage} setSearchMessage={setSearchMessage}
            targetAnchorDay={targetAnchorDay} setTargetAnchorDay={setTargetAnchorDay}
            canSearch={canSearch} busyAction={busyAction} onSearch={searchTaskLists}
            status={status} searchDomain={searchDomain} hasSearched={hasSearched}
            results={results} onImport={prepareAndroidImport}
            preparedImport={preparedImport} androidImportUri={androidImportUri}
            nextCursor={nextCursor} onMore={loadMoreResults}
          />
        ) : (
          <SaveWorkspace
            title={saveTitle} setTitle={(value) => { setSaveTitle(value); setEnrichment(null); }}
            tasks={tasks} setTasks={setTasks} enrichment={enrichment} setEnrichment={setEnrichment}
            busyAction={busyAction} canPrepare={canPrepareSave} canSave={canSave}
            savedTitle={savedTitle} onPrepare={prepareSave} onSave={saveTaskList} onReset={resetSave}
          />
        )}
      </section>
    </main>
  );
}

function AuthWorkspace({
  loading = false,
  errorMessage,
  onSignIn,
}: {
  loading?: boolean;
  errorMessage?: string | null;
  onSignIn?: () => void;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-workspace">
        <BrandMark size={52} />
        <span><strong>Cuckoo Cue</strong><small>次の自分へ渡す</small></span>
        {loading ? (
          <Loader2 className="spin" size={22} aria-label="ログイン状態を確認中" />
        ) : (
          <button type="button" onClick={onSignIn}><LogIn size={18} />Googleでログイン</button>
        )}
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      </section>
    </main>
  );
}

function MobileHeader({ view, onChange }: { view: "search" | "save"; onChange: (view: "search" | "save") => void }) {
  return (
    <header className="mobile-header">
      <a className="brand-lockup" href="#top"><BrandMark size={34} /><strong>Cuckoo Cue</strong></a>
      <nav aria-label="主な操作">
        <button className={view === "search" ? "active" : ""} onClick={() => onChange("search")} aria-label="探す"><Search size={18} /></button>
        <button className={view === "save" ? "active" : ""} onClick={() => onChange("save")} aria-label="残す"><ListChecks size={18} /></button>
      </nav>
    </header>
  );
}

type SearchWorkspaceProps = {
  searchMessage: string; setSearchMessage: (value: string) => void;
  targetAnchorDay: string; setTargetAnchorDay: (value: string) => void;
  canSearch: boolean; busyAction: string | null;
  onSearch: (event?: FormEvent<HTMLFormElement>) => void;
  status: string; searchDomain: string | null; hasSearched: boolean;
  results: SearchResult[]; onImport: (id: string) => void;
  preparedImport: ImportPayload | null; androidImportUri: string | null;
  nextCursor: string | null; onMore: () => void;
};

function SearchWorkspace(props: SearchWorkspaceProps) {
  const pagingSentinel = useRef<HTMLDivElement>(null);
  const { busyAction, nextCursor, onMore } = props;

  useEffect(() => {
    const node = pagingSentinel.current;
    if (!node || !nextCursor || busyAction !== null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onMore();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [nextCursor, busyAction, onMore]);

  return (
    <div className="workspace">
      <header className="workspace-heading">
        <p>REUSE LIBRARY</p><h1>やることを探す</h1>
        <span>誰かが完了し、確認して残したリストから探します。</span>
      </header>
      <form className="search-composer" onSubmit={props.onSearch} autoComplete="off">
        <label><span>これからすること</span><textarea aria-label="Search query" value={props.searchMessage} onChange={(event) => props.setSearchMessage(event.target.value)} placeholder="東京から名古屋へ引っ越す。役所、ライフライン、住所変更を整理したい。" rows={3} /></label>
        <div>
          <label className="anchor-field" htmlFor="target-anchor-day"><CalendarDays size={17} /><span>基準日</span><input id="target-anchor-day" type="date" value={props.targetAnchorDay} onChange={(event) => props.setTargetAnchorDay(event.target.value)} /></label>
          <button className="primary-action" type="submit" disabled={!props.canSearch}>{props.busyAction === "search" ? <Loader2 className="spin" size={18} /> : <Search size={18} />}探す</button>
        </div>
      </form>
      {props.preparedImport ? (
        <section className="handoff-bar" aria-live="polite">
          <BrandMark size={34} />
          <span><strong>{props.preparedImport.title}</strong><small>{props.preparedImport.target_anchor_day} を基準に {props.preparedImport.tasks.length}件を準備しました</small></span>
          {props.androidImportUri ? <a href={props.androidImportUri}><Smartphone size={17} />Androidで開く</a> : null}
        </section>
      ) : null}
      {props.results.length > 0 ? (
        <div className="result-heading"><span>{statusLabel(props.status)}</span>{props.searchDomain ? <span>{props.searchDomain}</span> : null}</div>
      ) : null}
      <section className="cue-surface" aria-label="検索結果">
        {props.results.length === 0 ? <EmptySearch hasSearched={props.hasSearched} /> : (
          <div className="cue-stack">
            {props.results.map((result) => <CueResult key={result.id} result={result} importBusy={props.busyAction === "import"} onImport={() => props.onImport(result.id)} />)}
            {props.nextCursor ? <div ref={pagingSentinel}><button className="more-button" type="button" disabled={props.busyAction !== null} onClick={props.onMore}>{props.busyAction === "more" ? <Loader2 className="spin" size={16} /> : <MoreHorizontal size={16} />}続きを読み込む</button></div> : null}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptySearch({ hasSearched }: { hasSearched: boolean }) {
  return <div className="empty-state"><Search size={28} /><strong>{hasSearched ? "一致するリストがありません" : "自然な文章で探せます"}</strong><span>{hasSearched ? "言葉を変えて、もう一度検索してください。" : "場所や制度、状況まで書くと近い内容から並びます。"}</span></div>;
}

type SaveWorkspaceProps = {
  title: string; setTitle: (value: string) => void;
  tasks: TaskDraft[]; setTasks: (tasks: TaskDraft[]) => void;
  enrichment: EnrichmentDraft | null; setEnrichment: (value: EnrichmentDraft | null) => void;
  busyAction: string | null; canPrepare: boolean; canSave: boolean; savedTitle: string | null;
  onPrepare: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onReset: () => void;
};

function SaveWorkspace(props: SaveWorkspaceProps) {
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  function updateTask(index: number, patch: Partial<TaskDraft>) {
    const next = [...props.tasks];
    next[index] = { ...next[index], ...patch };
    props.setTasks(next);
    props.setEnrichment(null);
  }
  function removeTask(index: number) {
    const next = props.tasks.filter((_, taskIndex) => taskIndex !== index);
    props.setTasks(next.length ? next : [emptyTask()]);
    props.setEnrichment(null);
  }
  function updateGrouping(index: number, key: keyof TaskGrouping, value: string | number[]) {
    if (!props.enrichment) return;
    const groups = [...props.enrichment.task_groupings];
    groups[index] = { ...groups[index], [key]: value };
    props.setEnrichment({ ...props.enrichment, task_groupings: groups });
  }
  if (props.savedTitle) {
    return <div className="workspace save-success"><BrandMark size={56} /><p>LIBRARY UPDATED</p><h1>残しました</h1><span>「{props.savedTitle}」は、次の検索から見つけて使えます。</span><button onClick={props.onReset}><Plus size={17} />別のリストを残す</button></div>;
  }
  return (
    <div className="workspace">
      <header className="workspace-heading"><p>COMPLETED LIST</p><h1>完了した内容を残す</h1><span>Android から受け取った内容を確認し、検索できる形にします。</span></header>
      <form className="save-form" onSubmit={props.onSave} autoComplete="off">
        <label className="save-title-field" htmlFor="save-title"><span>タイトル</span><input id="save-title" value={props.title} onChange={(event) => props.setTitle(event.target.value)} placeholder="完了したことの名前" /></label>
        <div className="task-edit-list" aria-label="残す項目">
          {props.tasks.map((task, index) => (
            <div className="task-edit-row" key={index}>
              <GripVertical className="row-grip" size={18} />
              <label><span>項目</span><input aria-label={`Task ${index + 1}`} value={task.text} onChange={(event) => updateTask(index, { text: event.target.value })} placeholder="手続きや確認事項" /></label>
              <label><span>強さ</span><select aria-label={`Priority ${index + 1}`} value={task.default_priority ?? ""} onChange={(event) => updateTask(index, { default_priority: nullableNumber(event.target.value) })}><option value="">なし</option><option value="0">強</option><option value="1">中</option><option value="2">弱</option></select></label>
              <label><span>開始</span><input aria-label={`Relative start day ${index + 1}`} type="number" value={task.relative_start_day ?? ""} onChange={(event) => updateTask(index, { relative_start_day: nullableNumber(event.target.value) })} /></label>
              <label><span>終了</span><input aria-label={`Relative end day ${index + 1}`} type="number" value={task.relative_end_day ?? ""} onChange={(event) => updateTask(index, { relative_end_day: nullableNumber(event.target.value) })} /></label>
              <button type="button" className="icon-button" aria-label={`${index + 1}件目を削除`} onClick={() => removeTask(index)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="save-actions">
          <button type="button" className="secondary-action" onClick={() => props.setTasks([...props.tasks, emptyTask()])}><Plus size={16} />項目を追加</button>
          <button type="button" disabled={!props.canPrepare} onClick={props.onPrepare}>{props.busyAction === "enrich" ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}検索情報を作る</button>
        </div>
        {props.enrichment ? (
          <section className="review-strip" aria-label="保存前の確認">
            <header><Check size={18} /><span><strong>検索情報を確認</strong><small>明らかな個人情報や不正確な内容がないか確認してください。</small></span></header>
            <label htmlFor="review-domain"><span>分野</span><input id="review-domain" value={props.enrichment.domain} onChange={(event) => props.setEnrichment({ ...props.enrichment!, domain: event.target.value })} /></label>
            <label htmlFor="review-context"><span>利用状況</span><textarea id="review-context" value={props.enrichment.context_text} onChange={(event) => props.setEnrichment({ ...props.enrichment!, context_text: event.target.value })} rows={3} /></label>
            <div className="group-edit-list">
              {props.enrichment.task_groupings.map((group, index) => <div className="group-edit-row" key={index}><input aria-label={`Group label ${index + 1}`} value={group.label} onChange={(event) => updateGrouping(index, "label", event.target.value)} /><input aria-label={`Group task offsets ${index + 1}`} value={group.task_offsets.join(",")} onChange={(event) => updateGrouping(index, "task_offsets", parseOffsets(event.target.value))} /></div>)}
            </div>
            <label className="publish-confirm"><input type="checkbox" checked={publishConfirmed} onChange={(event) => setPublishConfirmed(event.target.checked)} /><span>個人情報が含まれていないことを確認し、検索可能なリストとして公開する</span></label>
            <button className="publish-action" type="submit" disabled={!props.canSave || !publishConfirmed}>{props.busyAction === "save" ? <Loader2 className="spin" size={16} /> : <Check size={16} />}確認して残す</button>
          </section>
        ) : null}
      </form>
    </div>
  );
}

function CueResult({ result, importBusy, onImport }: { result: SearchResult; importBusy: boolean; onImport: () => void }) {
  const previewTasks = result.tasks.slice(0, 5);
  return (
    <article className="cue-result">
      <header className="result-title-row">
        <Circle className="exposure-dot" size={16} /><span><small>{result.domain ?? "未分類"}</small><h2>{result.title}</h2></span>
        <button type="button" className="import-action" onClick={onImport} aria-label={`${result.title}をAndroidに取り込む`}>{importBusy ? <Loader2 className="spin" size={17} /> : <ArrowDownToLine size={17} />}使う</button>
      </header>
      <div className="task-preview">
        {previewTasks.map((task, index) => <div className="task-row" key={`${result.id}-${index}`}><GripVertical size={16} /><Square className="task-square" size={20} /><Circle className="exposure-dot muted-dot" size={9} /><p>{task.text}</p><span className="task-meta"><small>{formatDayRange(task.relative_start_day, task.relative_end_day)}</small><i data-priority={task.default_priority ?? "none"} /></span></div>)}
      </div>
      <details className="context-details">
        <summary><span><Tag size={15} />文脈と全項目</span><ChevronDown size={15} /></summary>
        {result.context_text ? <p>{result.context_text}</p> : null}
        {result.task_groupings?.length ? <div className="group-line">{result.task_groupings.map((group) => <span key={group.label}><Layers3 size={13} />{group.label}</span>)}</div> : null}
        {result.tasks.length > previewTasks.length ? <ol className="all-tasks">{result.tasks.slice(previewTasks.length).map((task, index) => <li key={index}><span>{task.text}</span><small>{formatDayRange(task.relative_start_day, task.relative_end_day)}</small></li>)}</ol> : null}
      </details>
    </article>
  );
}

function nullableNumber(value: string): number | null { return value === "" ? null : Number(value); }
function parseOffsets(value: string): number[] { return value.split(",").map((part) => Number(part.trim())).filter((item) => Number.isInteger(item) && item >= 0); }
function formatDayRange(start: number | null, end: number | null): string { if (start === null && end === null) return "日付なし"; if (start === end) return dayLabel(start); return `${dayLabel(start)}〜${dayLabel(end)}`; }
function dayLabel(value: number | null): string { if (value === null) return "任意"; if (value === 0) return "当日"; return value > 0 ? `+${value}日` : `${value}日`; }
function statusLabel(status: string): string { const count = status.match(/^(\d+) results$/); return count ? `${count[1]}件` : status; }
