"use client";

import {
  AlertCircle, ArrowDown, ArrowDownToLine, ArrowUp, CalendarCheck2,
  CalendarDays, Check, ChevronDown, Circle, Layers3, ListChecks, Loader2,
  LogIn, LogOut, MoreHorizontal, Plus, RotateCcw, Search, Smartphone, Tag,
  Trash2, User, WandSparkles,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { cueApiFetch } from "@/lib/api-client";
import { firebaseAuth, hasFirebaseClientConfig } from "@/lib/firebase-client";
import {
  buildAndroidImportUri,
  type AndroidImportTransfer,
} from "@/lib/run-transfer";
import { BrandLockup, BrandMark } from "./brand-mark";

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
type ImportPayload = AndroidImportTransfer;

type PersistedWorkspace = {
  version: 1;
  view: "search" | "save";
  searchMessage: string;
  targetAnchorDay: string;
  results: SearchResult[];
  searchDomain: string | null;
  nextCursor: string | null;
  hasSearched: boolean;
  saveTitle: string;
  saveAnchorDay: string;
  tasks: TaskDraft[];
  enrichment: EnrichmentDraft | null;
  preparedImport: ImportPayload | null;
  androidImportUri: string | null;
  saveOperationId: string;
  savedTitle: string | null;
};

const WorkspaceStorageKey = "cuckoo-cue:web-workspace:v1";

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
  const [saveAnchorDay, setSaveAnchorDay] = useState(localIsoDay());
  const [tasks, setTasks] = useState<TaskDraft[]>([emptyTask(), emptyTask(), emptyTask()]);
  const [enrichment, setEnrichment] = useState<EnrichmentDraft | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchDomain, setSearchDomain] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [preparedImport, setPreparedImport] = useState<ImportPayload | null>(null);
  const [androidImportUri, setAndroidImportUri] = useState<string | null>(null);
  const [targetAnchorDay, setTargetAnchorDay] = useState(localIsoDay());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchRetry, setSearchRetry] = useState<"search" | "more" | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    "search" | "more" | "enrich" | "save" | "import" | null
  >(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [busySeconds, setBusySeconds] = useState(0);
  const [workspaceRestored, setWorkspaceRestored] = useState(false);
  const [isAndroidDevice] = useState(() => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent));
  const [saveOperationId, setSaveOperationId] = useState(() => crypto.randomUUID());
  const loadedRunId = useRef<string | null>(null);

  useEffect(() => {
    if (!hasFirebaseClientConfig()) return;
    const auth = firebaseAuth();
    let startingAnonymousSession = false;
    return onAuthStateChanged(auth, (nextUser) => {
      if (nextUser) {
        setUser(nextUser);
        setAuthReady(true);
        return;
      }
      setUser(null);
      setAuthReady(false);
      if (startingAnonymousSession) return;
      startingAnonymousSession = true;
      void signInAnonymously(auth)
        .catch(() => {
          setErrorMessage("検索を始めるための接続を確立できませんでした。");
          setAuthReady(true);
        })
        .finally(() => {
          startingAnonymousSession = false;
        });
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = sessionStorage.getItem(WorkspaceStorageKey);
        if (stored) {
          const restored = JSON.parse(stored) as Partial<PersistedWorkspace>;
          if (restored.version === 1) {
            if (restored.view === "search" || restored.view === "save") setView(restored.view);
            if (typeof restored.searchMessage === "string") setSearchMessage(restored.searchMessage);
            if (isIsoDay(restored.targetAnchorDay)) setTargetAnchorDay(restored.targetAnchorDay);
            if (Array.isArray(restored.results)) setResults(restored.results);
            if (typeof restored.searchDomain === "string" || restored.searchDomain === null) setSearchDomain(restored.searchDomain);
            if (typeof restored.nextCursor === "string" || restored.nextCursor === null) setNextCursor(restored.nextCursor);
            if (typeof restored.hasSearched === "boolean") setHasSearched(restored.hasSearched);
            if (typeof restored.saveTitle === "string") setSaveTitle(restored.saveTitle);
            if (isIsoDay(restored.saveAnchorDay)) setSaveAnchorDay(restored.saveAnchorDay);
            if (Array.isArray(restored.tasks) && restored.tasks.length > 0) setTasks(restored.tasks);
            if (restored.enrichment) setEnrichment(restored.enrichment);
            if (restored.preparedImport) setPreparedImport(restored.preparedImport);
            if (typeof restored.androidImportUri === "string" || restored.androidImportUri === null) setAndroidImportUri(restored.androidImportUri);
            if (typeof restored.saveOperationId === "string") setSaveOperationId(restored.saveOperationId);
            if (typeof restored.savedTitle === "string" || restored.savedTitle === null) setSavedTitle(restored.savedTitle);
          }
        }
      } catch {
        sessionStorage.removeItem(WorkspaceStorageKey);
      } finally {
        setWorkspaceRestored(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!workspaceRestored) return;
    const workspace: PersistedWorkspace = {
      version: 1,
      view,
      searchMessage,
      targetAnchorDay,
      results,
      searchDomain,
      nextCursor,
      hasSearched,
      saveTitle,
      saveAnchorDay,
      tasks,
      enrichment,
      preparedImport,
      androidImportUri,
      saveOperationId,
      savedTitle,
    };
    sessionStorage.setItem(WorkspaceStorageKey, JSON.stringify(workspace));
  }, [
    androidImportUri, enrichment, hasSearched, nextCursor, preparedImport,
    results, saveAnchorDay, saveOperationId, savedTitle, saveTitle, searchDomain, searchMessage, targetAnchorDay,
    tasks, view, workspaceRestored,
  ]);

  useEffect(() => {
    if (busyAction === null) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setBusySeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busyAction]);

  useEffect(() => {
    if (!authReady || (hasFirebaseClientConfig() && !user)) return;
    const url = new URL(window.location.href);
    const runId = url.searchParams.get("run_id");
    if (!runId || loadedRunId.current === runId) return;
    if (user?.isAnonymous) {
      const frame = window.requestAnimationFrame(() => setView("save"));
      return () => window.cancelAnimationFrame(frame);
    }
    loadedRunId.current = runId;
    let cancelled = false;

    void cueApiFetch(`/api/runs/${encodeURIComponent(runId)}`, devUserId)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "完了したリストを読み込めませんでした。"));
        if (cancelled) return;
        setSaveTitle(body.run.title);
        setSaveAnchorDay(body.run.source_anchor_day);
        setTasks(body.run.tasks);
        setEnrichment(null);
        setSavedTitle(null);
        setSaveOperationId(crypto.randomUUID());
        setView("save");
        url.searchParams.delete("run_id");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      })
      .catch((error) => {
        if (cancelled) return;
        loadedRunId.current = null;
        setErrorMessage(error instanceof Error ? error.message : "完了したリストを読み込めませんでした。");
      });

    return () => {
      cancelled = true;
      if (loadedRunId.current === runId) loadedRunId.current = null;
    };
  }, [authReady, devUserId, user]);

  const cleanedTasks = useMemo(
    () => tasks.filter((task) => task.text.trim().length > 0),
    [tasks],
  );
  const canSearch = searchMessage.trim().length > 0 && busyAction === null;
  const canPrepareSave = saveTitle.trim().length > 0 && cleanedTasks.length > 0 && busyAction === null;
  const canSave = canPrepareSave && isReviewableEnrichment(enrichment, cleanedTasks.length);

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

  async function retryAnonymousSession() {
    setAuthReady(false);
    setErrorMessage(null);
    try {
      const credential = await signInAnonymously(firebaseAuth());
      setUser(credential.user);
    } catch {
      setErrorMessage("検索を始めるための接続を確立できませんでした。");
    } finally {
      setAuthReady(true);
    }
  }

  async function signOutCurrentUser() {
    sessionStorage.removeItem(WorkspaceStorageKey);
    await signOut(firebaseAuth());
  }

  async function searchTaskLists(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!searchMessage.trim()) return;
    setBusySeconds(0);
    setBusyAction("search");
    setErrorMessage(null);
    setSearchRetry(null);
    setPreparedImport(null);
    setAndroidImportUri(null);
    setHasSearched(true);
    try {
      const response = await cueApiFetch("/api/search", devUserId, {
        method: "POST",
        body: JSON.stringify({ message: searchMessage, page_size: 20 }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "検索に失敗しました。"));
      setResults(body.results ?? []);
      setSearchDomain(body.searchDomain ?? null);
      setNextCursor(body.nextCursor ?? null);
    } catch (error) {
      setResults([]);
      setSearchDomain(null);
      setNextCursor(null);
      setSearchRetry("search");
      setErrorMessage(error instanceof Error ? error.message : "検索に失敗しました。");
    } finally {
      setBusyAction(null);
    }
  }

  async function loadMoreResults() {
    if (!nextCursor) return;
    setBusySeconds(0);
    setBusyAction("more");
    setErrorMessage(null);
    setSearchRetry(null);
    try {
      const response = await cueApiFetch("/api/search", devUserId, {
        method: "POST",
        body: JSON.stringify({ cursor: nextCursor, page_size: 20 }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "続きを読み込めませんでした。"));
      const nextResults = body.results ?? [];
      setResults((current) => [...current, ...nextResults]);
      setNextCursor(body.nextCursor ?? null);
    } catch (error) {
      setSearchRetry("more");
      setErrorMessage(error instanceof Error ? error.message : "続きを読み込めませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function prepareSave() {
    setBusySeconds(0);
    setBusyAction("enrich");
    setErrorMessage(null);
    setSearchRetry(null);
    try {
      const response = await cueApiFetch("/api/task-list-enrichment", devUserId, {
        method: "POST",
        body: JSON.stringify({ title: saveTitle, tasks: cleanedTasks }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "確認内容を作れませんでした。"));
      setEnrichment(body.enrichment);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "確認内容を作れませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveTaskList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrichment) return;
    setBusySeconds(0);
    setBusyAction("save");
    setErrorMessage(null);
    setSearchRetry(null);
    try {
      const response = await cueApiFetch("/api/task-list-entries", devUserId, {
        method: "POST",
        body: JSON.stringify({
          operation_id: saveOperationId,
          title: saveTitle,
          tasks: cleanedTasks,
          domain: enrichment.domain,
          context_text: enrichment.context_text,
          task_groupings: enrichment.task_groupings,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "保存できませんでした。"));
      setSavedTitle(body.entry.title);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function prepareAndroidImport(id: string) {
    setBusySeconds(0);
    setBusyAction("import");
    setImportingId(id);
    setErrorMessage(null);
    setSearchRetry(null);
    try {
      const params = new URLSearchParams({ target_anchor_day: targetAnchorDay });
      const response = await cueApiFetch(`/api/import-payload/${id}?${params}`, devUserId);
      const body = await response.json();
      if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "Android 用の内容を準備できませんでした。"));
      const payload = body.importPayload as ImportPayload;
      const uri = buildAndroidImportUri(id, targetAnchorDay);
      setPreparedImport(payload);
      setAndroidImportUri(uri);
      if (isAndroidDevice) window.location.assign(uri);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Android 用の内容を準備できませんでした。");
    } finally {
      setBusyAction(null);
      setImportingId(null);
    }
  }

  function resetSave() {
    setSaveTitle("");
    setSaveAnchorDay(localIsoDay());
    setTasks([emptyTask(), emptyTask(), emptyTask()]);
    setEnrichment(null);
    setSavedTitle(null);
    setErrorMessage(null);
    setSaveOperationId(crypto.randomUUID());
  }

  function changeView(nextView: "search" | "save") {
    setErrorMessage(null);
    setView(nextView);
  }

  if (!authReady) {
    return <AuthWorkspace loading />;
  }

  if (hasFirebaseClientConfig() && !user) {
    return <AuthWorkspace errorMessage={errorMessage} onRetry={retryAnonymousSession} />;
  }

  return (
    <main className="product-shell">
      <aside className="product-rail">
        <a className="brand-lockup" href="#top" aria-label="Cuckoo Cue">
          <BrandLockup priority />
          <small>次の自分へ渡す</small>
        </a>
        <nav aria-label="主な操作">
          <button className={view === "search" ? "active" : ""} onClick={() => changeView("search")}>
            <Search size={18} aria-hidden="true" />探す
          </button>
          <button className={view === "save" ? "active" : ""} onClick={() => changeView("save")}>
            <ListChecks size={18} aria-hidden="true" />残す
          </button>
        </nav>
        <details className="connection-panel">
          <summary><User size={17} aria-hidden="true" />{user?.isAnonymous ? "ゲスト利用中" : user?.displayName ?? "接続"}</summary>
          {user?.isAnonymous ? (
            <button type="button" onClick={signInWithGoogle}><LogIn size={15} />Googleでログイン</button>
          ) : user ? (
            <button type="button" onClick={signOutCurrentUser}><LogOut size={15} />ログアウト</button>
          ) : (
            <label>Dev user<input value={devUserId} onChange={(event) => setDevUserId(event.target.value)} /></label>
          )}
        </details>
      </aside>

      <section className="product-main" id="top">
        <MobileHeader view={view} onChange={changeView} />
        {errorMessage ? (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span><strong>処理を完了できませんでした</strong><small>{errorMessage}</small></span>
            {view === "search" && searchRetry ? (
              <button type="button" onClick={() => searchRetry === "more" ? loadMoreResults() : searchTaskLists()} disabled={busyAction !== null}>
                <RotateCcw size={16} aria-hidden="true" />{searchRetry === "more" ? "続きを再読込" : "再検索"}
              </button>
            ) : null}
          </div>
        ) : null}

        {view === "search" ? (
          <SearchWorkspace
            searchMessage={searchMessage} setSearchMessage={setSearchMessage}
            targetAnchorDay={targetAnchorDay} setTargetAnchorDay={setTargetAnchorDay}
            canSearch={canSearch} busyAction={busyAction} onSearch={searchTaskLists}
            searchDomain={searchDomain} hasSearched={hasSearched}
            results={results} onImport={prepareAndroidImport}
            preparedImport={preparedImport} androidImportUri={androidImportUri}
            nextCursor={nextCursor} onMore={loadMoreResults}
            importingId={importingId} busySeconds={busySeconds}
            isAndroidDevice={isAndroidDevice}
          />
        ) : hasFirebaseClientConfig() && user?.isAnonymous ? (
          <SignInRequired onBack={() => changeView("search")} onSignIn={signInWithGoogle} />
        ) : (
          <SaveWorkspace
            key={saveOperationId}
            title={saveTitle} setTitle={(value) => { setSaveTitle(value); setEnrichment(null); }}
            anchorDay={saveAnchorDay}
            tasks={tasks} setTasks={setTasks} enrichment={enrichment} setEnrichment={setEnrichment}
            busyAction={busyAction} canPrepare={canPrepareSave} canSave={canSave}
            busySeconds={busySeconds}
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
  onRetry,
}: {
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-workspace">
        <BrandMark size={184} priority />
        <BrandLockup priority />
        <span><strong>できた手順を、次に渡す。</strong><small>完了したリストを見つけて、自分の日程で使えます。</small></span>
        {loading ? (
          <Loader2 className="spin" size={22} aria-label="接続状態を確認中" />
        ) : (
          <button type="button" onClick={onRetry}><RotateCcw size={18} />もう一度接続</button>
        )}
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      </section>
    </main>
  );
}

function SignInRequired({ onBack, onSignIn }: { onBack: () => void; onSignIn: () => void }) {
  return (
    <div className="workspace sign-in-required">
      <p>次へ渡す</p>
      <h1>完了した内容を残す</h1>
      <span>Androidで完了した内容を確認するため、同じGoogleアカウントでログインしてください。</span>
      <button type="button" onClick={onSignIn}><LogIn size={18} />Googleでログイン</button>
      <button type="button" className="text-action" onClick={onBack}>検索に戻る</button>
    </div>
  );
}

function MobileHeader({ view, onChange }: { view: "search" | "save"; onChange: (view: "search" | "save") => void }) {
  return (
    <header className="mobile-header">
      <a className="brand-lockup" href="#top" aria-label="Cuckoo Cue"><BrandLockup priority /></a>
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
  searchDomain: string | null; hasSearched: boolean;
  results: SearchResult[]; onImport: (id: string) => void;
  preparedImport: ImportPayload | null; androidImportUri: string | null;
  nextCursor: string | null; onMore: () => void;
  importingId: string | null; busySeconds: number; isAndroidDevice: boolean;
};

function SearchWorkspace(props: SearchWorkspaceProps) {
  const pagingSentinel = useRef<HTMLDivElement>(null);
  const handoffPanel = useRef<HTMLElement>(null);
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

  useEffect(() => {
    if (!props.preparedImport || !handoffPanel.current) return;
    handoffPanel.current.focus({ preventScroll: true });
    handoffPanel.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [props.preparedImport]);

  return (
    <div className="workspace">
      <header className="workspace-heading">
        <p>受け取る</p><h1>やることを探す</h1>
        <span>完了して残されたリストを、自分の日程に合わせて使えます。</span>
      </header>
      <form className="search-composer" onSubmit={props.onSearch} autoComplete="off">
        <label><span>これからすること</span><textarea aria-label="Search query" value={props.searchMessage} onChange={(event) => props.setSearchMessage(event.target.value)} placeholder="東京から名古屋へ引っ越す。役所、ライフライン、住所変更を整理したい。" rows={3} /></label>
        <div>
          <label className="anchor-field" htmlFor="target-anchor-day"><CalendarDays size={17} /><span>基準日</span><input id="target-anchor-day" type="date" value={props.targetAnchorDay} onChange={(event) => props.setTargetAnchorDay(event.target.value)} /></label>
          <button className="primary-action" type="submit" disabled={!props.canSearch}>{props.busyAction === "search" ? <Loader2 className="spin" size={18} /> : <Search size={18} />}探す</button>
        </div>
      </form>
      {props.busyAction === "search" ? (
        <ProgressNotice label={progressLabel("search", props.busySeconds)} />
      ) : null}
      {props.preparedImport ? (
        <section className="handoff-panel" aria-live="polite" ref={handoffPanel} tabIndex={-1}>
          <header>
            <span><small>取り込み内容</small><strong>{props.preparedImport.title}</strong></span>
            {props.isAndroidDevice && props.androidImportUri ? <a href={props.androidImportUri}><Smartphone size={17} />Androidで開く</a> : null}
          </header>
          <div className="handoff-summary">
            <span><CalendarCheck2 size={15} />{formatIsoDay(props.preparedImport.target_anchor_day)}を基準</span>
            <span><ListChecks size={15} />{props.preparedImport.tasks.length}件</span>
          </div>
          <ol>
            {props.preparedImport.tasks.slice(0, 3).map((task, index) => (
              <li key={`${task.title}-${index}`}>
                <span>{task.title}</span>
                <small>{formatAbsoluteRange(props.preparedImport!.target_anchor_day, task.relative_start_day, task.relative_end_day)}</small>
              </li>
            ))}
          </ol>
          {props.preparedImport.tasks.length > 3 ? <small className="handoff-rest">ほか{props.preparedImport.tasks.length - 3}件</small> : null}
        </section>
      ) : null}
      {props.results.length > 0 ? (
        <div className="result-heading"><span>{props.results.length}件</span>{props.searchDomain ? <span>{props.searchDomain}</span> : null}</div>
      ) : null}
      <section className="cue-surface" aria-label="検索結果">
        {props.results.length === 0 ? <EmptySearch hasSearched={props.hasSearched} /> : (
          <div className="cue-stack">
            {props.results.map((result) => <CueResult key={result.id} result={result} importBusy={props.importingId === result.id} importDisabled={props.busyAction !== null} onImport={() => props.onImport(result.id)} />)}
            {props.nextCursor ? <div ref={pagingSentinel}><button className="more-button" type="button" disabled={props.busyAction !== null} onClick={props.onMore}>{props.busyAction === "more" ? <Loader2 className="spin" size={16} /> : <MoreHorizontal size={16} />}続きを読み込む</button></div> : null}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptySearch({ hasSearched }: { hasSearched: boolean }) {
  return (
    <div className={`empty-state ${hasSearched ? "" : "brand-empty"}`}>
      {hasSearched ? <Search size={28} /> : <BrandMark size={168} priority />}
      <span className="empty-copy"><strong>{hasSearched ? "一致するリストがありません" : "どんなことを始めますか？"}</strong><span>{hasSearched ? "言葉を変えて、もう一度検索してください。" : "場所や制度、状況まで自然な文章で書くと、近いカードから並びます。"}</span></span>
    </div>
  );
}

type SaveWorkspaceProps = {
  title: string; setTitle: (value: string) => void;
  anchorDay: string;
  tasks: TaskDraft[]; setTasks: (tasks: TaskDraft[]) => void;
  enrichment: EnrichmentDraft | null; setEnrichment: (value: EnrichmentDraft | null) => void;
  busyAction: string | null; canPrepare: boolean; canSave: boolean; savedTitle: string | null;
  busySeconds: number;
  onPrepare: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onReset: () => void;
};

function SaveWorkspace(props: SaveWorkspaceProps) {
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const reviewTasks = props.tasks.filter((task) => task.text.trim().length > 0);
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
  function moveTask(index: number, delta: number) {
    const destination = index + delta;
    if (destination < 0 || destination >= props.tasks.length) return;
    const next = [...props.tasks];
    [next[index], next[destination]] = [next[destination], next[index]];
    props.setTasks(next);
    props.setEnrichment(null);
  }
  function addTask() {
    props.setTasks([...props.tasks, emptyTask()]);
    props.setEnrichment(null);
  }
  function updateGroupingLabel(index: number, value: string) {
    if (!props.enrichment) return;
    const groups = [...props.enrichment.task_groupings];
    groups[index] = { ...groups[index], label: value };
    props.setEnrichment({ ...props.enrichment, task_groupings: groups });
  }
  function moveGroupingTask(taskOffset: number, targetGroupIndex: number) {
    if (!props.enrichment) return;
    let groups = props.enrichment.task_groupings.map((group) => ({
      ...group,
      task_offsets: group.task_offsets.filter((offset) => offset !== taskOffset),
    }));
    groups[targetGroupIndex].task_offsets = [...groups[targetGroupIndex].task_offsets, taskOffset].sort((a, b) => a - b);
    groups = groups.filter((group) => group.task_offsets.length > 0);
    props.setEnrichment({ ...props.enrichment, task_groupings: groups });
  }
  if (props.savedTitle) {
    return <div className="workspace save-success"><p>公開完了</p><h1>残しました</h1><span>「{props.savedTitle}」は、次の検索から見つけて使えます。</span><button onClick={props.onReset}><Plus size={17} />別のリストを残す</button></div>;
  }
  return (
    <div className="workspace">
      <header className="workspace-heading"><p>次へ渡す</p><h1>完了した内容を残す</h1><span>Android から受け取った内容を確認し、次に使えるカードとして公開します。</span></header>
      <form className="save-form" onSubmit={props.onSave} autoComplete="off">
        <label className="save-title-field" htmlFor="save-title"><span>タイトル</span><input id="save-title" value={props.title} onChange={(event) => props.setTitle(event.target.value)} placeholder="完了したことの名前" /></label>
        <div className="completion-anchor"><CalendarCheck2 size={17} /><span><strong>{formatIsoDay(props.anchorDay)}</strong><small>この完了日を基準に、次回の日程へ置き換えます</small></span></div>
        <div className="task-edit-list" aria-label="残す項目">
          {props.tasks.map((task, index) => (
            <div className="task-edit-row" key={index}>
              <div className="row-order" aria-label={`${index + 1}件目の順序`}>
                <button type="button" aria-label={`${index + 1}件目を上へ`} disabled={index === 0} onClick={() => moveTask(index, -1)}><ArrowUp size={15} /></button>
                <button type="button" aria-label={`${index + 1}件目を下へ`} disabled={index === props.tasks.length - 1} onClick={() => moveTask(index, 1)}><ArrowDown size={15} /></button>
              </div>
              <label><span>項目</span><input aria-label={`Task ${index + 1}`} value={task.text} onChange={(event) => updateTask(index, { text: event.target.value })} placeholder="手続きや確認事項" /></label>
              <label><span>強さ</span><select aria-label={`Priority ${index + 1}`} value={task.default_priority ?? ""} onChange={(event) => updateTask(index, { default_priority: nullableNumber(event.target.value) })}><option value="">なし</option><option value="0">強</option><option value="1">中</option><option value="2">弱</option></select></label>
              <label><span>開始日</span><input aria-label={`Start date ${index + 1}`} type="date" value={relativeToIsoDay(props.anchorDay, task.relative_start_day)} onChange={(event) => updateTask(index, { relative_start_day: isoDayToRelative(props.anchorDay, event.target.value) })} /></label>
              <label><span>終了日</span><input aria-label={`End date ${index + 1}`} type="date" value={relativeToIsoDay(props.anchorDay, task.relative_end_day)} onChange={(event) => updateTask(index, { relative_end_day: isoDayToRelative(props.anchorDay, event.target.value) })} /></label>
              <button type="button" className="icon-button" aria-label={`${index + 1}件目を削除`} onClick={() => removeTask(index)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="save-actions">
          <button type="button" className="secondary-action" onClick={addTask}><Plus size={16} />項目を追加</button>
          <button type="button" disabled={!props.canPrepare} onClick={props.onPrepare}>{props.busyAction === "enrich" ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}検索情報を準備</button>
        </div>
        {props.busyAction === "enrich" ? <ProgressNotice label={progressLabel("enrich", props.busySeconds)} /> : null}
        {props.enrichment ? (
          <section className="review-strip" aria-label="保存前の確認">
            <header><Check size={18} /><span><strong>検索情報を確認</strong><small>明らかな個人情報や不正確な内容がないか確認してください。</small></span></header>
            <label htmlFor="review-domain"><span>分野</span><input id="review-domain" value={props.enrichment.domain} onChange={(event) => props.setEnrichment({ ...props.enrichment!, domain: event.target.value })} /></label>
            <label htmlFor="review-context"><span>利用状況</span><textarea id="review-context" value={props.enrichment.context_text} onChange={(event) => props.setEnrichment({ ...props.enrichment!, context_text: event.target.value })} rows={3} /></label>
            <div className="group-edit-list" aria-label="項目のまとまり">
              <span className="field-label">項目のまとまり</span>
              {props.enrichment.task_groupings.map((group, groupIndex) => (
                <fieldset className="group-edit-card" key={`${group.label}-${groupIndex}`}>
                  <legend className="sr-only">まとまり {groupIndex + 1}</legend>
                  <input aria-label={`Group label ${groupIndex + 1}`} value={group.label} onChange={(event) => updateGroupingLabel(groupIndex, event.target.value)} />
                  <ol>
                    {group.task_offsets.map((taskOffset) => (
                      <li key={`${taskOffset}-${props.tasks[taskOffset]?.text}`}>
                        <span>{reviewTasks[taskOffset]?.text || `項目 ${taskOffset + 1}`}</span>
                        <label>
                          <span className="sr-only">{reviewTasks[taskOffset]?.text}のまとまり</span>
                          <select aria-label={`${reviewTasks[taskOffset]?.text}のまとまり`} value={groupIndex} onChange={(event) => moveGroupingTask(taskOffset, Number(event.target.value))}>
                            {props.enrichment!.task_groupings.map((candidate, candidateIndex) => <option key={`${candidate.label}-${candidateIndex}`} value={candidateIndex}>{candidate.label}</option>)}
                          </select>
                        </label>
                      </li>
                    ))}
                  </ol>
                </fieldset>
              ))}
            </div>
            <label className="publish-confirm"><input type="checkbox" checked={publishConfirmed} onChange={(event) => setPublishConfirmed(event.target.checked)} /><span>個人情報が含まれていないことを確認し、検索可能なリストとして公開する</span></label>
            <button className="publish-action" type="submit" disabled={!props.canSave || !publishConfirmed}>{props.busyAction === "save" ? <Loader2 className="spin" size={16} /> : <Check size={16} />}{props.busyAction === "save" ? "公開しています" : "確認して残す"}</button>
            {props.busyAction === "save" ? <ProgressNotice label={progressLabel("save", props.busySeconds)} /> : null}
          </section>
        ) : null}
      </form>
    </div>
  );
}

function CueResult({ result, importBusy, importDisabled, onImport }: { result: SearchResult; importBusy: boolean; importDisabled: boolean; onImport: () => void }) {
  const previewTasks = result.tasks.slice(0, 3);
  return (
    <article className="cue-result">
      <header className="result-title-row">
        <span className="cue-card-mark" aria-hidden="true" /><span><small>{result.domain ?? "未分類"}</small><h2>{result.title}</h2></span>
        <button type="button" className="import-action" disabled={importDisabled} onClick={onImport} aria-label={`${result.title}をAndroidに取り込む`}>{importBusy ? <Loader2 className="spin" size={17} /> : <ArrowDownToLine size={17} />}使う</button>
      </header>
      <div className="fit-summary">
        <strong>このリストが向いている状況</strong>
        {result.context_text ? <p>{result.context_text}</p> : null}
        <div><span><ListChecks size={14} />{result.tasks.length}件</span><span><CalendarDays size={14} />{resultRangeLabel(result.tasks)}</span></div>
      </div>
      <div className="task-preview">
        {previewTasks.map((task, index) => <div className="task-row" key={`${result.id}-${index}`}><span className="task-index">{index + 1}</span><Circle className="exposure-dot muted-dot" size={9} /><p>{task.text}</p><span className="task-meta"><small>{formatDayRange(task.relative_start_day, task.relative_end_day)}</small><i data-priority={task.default_priority ?? "none"} /></span></div>)}
      </div>
      <details className="context-details">
        <summary><span><Tag size={15} />グループと全項目</span><ChevronDown size={15} /></summary>
        {result.task_groupings?.length ? <div className="group-line">{result.task_groupings.map((group) => <span key={group.label}><Layers3 size={13} />{group.label}</span>)}</div> : null}
        {result.tasks.length > previewTasks.length ? <ol className="all-tasks">{result.tasks.slice(previewTasks.length).map((task, index) => <li key={index}><span>{task.text}</span><small>{formatDayRange(task.relative_start_day, task.relative_end_day)}</small></li>)}</ol> : null}
      </details>
    </article>
  );
}

function ProgressNotice({ label }: { label: string }) {
  return <div className="progress-notice" role="status" aria-live="polite"><Loader2 className="spin" size={17} /><span>{label}</span></div>;
}

function nullableNumber(value: string): number | null { return value === "" ? null : Number(value); }
function formatDayRange(start: number | null, end: number | null): string { if (start === null && end === null) return "日付なし"; if (start === end) return dayLabel(start); return `${dayLabel(start)}〜${dayLabel(end)}`; }
function dayLabel(value: number | null): string { if (value === null) return "任意"; if (value === 0) return "当日"; return value > 0 ? `+${value}日` : `${value}日`; }

function localIsoDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isoDayMillis(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function relativeToIsoDay(anchorDay: string, relativeDay: number | null): string {
  if (relativeDay === null || !isIsoDay(anchorDay)) return "";
  return new Date(isoDayMillis(anchorDay) + relativeDay * 86_400_000).toISOString().slice(0, 10);
}

function isoDayToRelative(anchorDay: string, value: string): number | null {
  if (!value || !isIsoDay(anchorDay) || !isIsoDay(value)) return null;
  return Math.round((isoDayMillis(value) - isoDayMillis(anchorDay)) / 86_400_000);
}

function formatIsoDay(value: string): string {
  if (!isIsoDay(value)) return value;
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
}

function formatAbsoluteRange(anchorDay: string, start: number | null, end: number | null): string {
  const startDay = relativeToIsoDay(anchorDay, start);
  const endDay = relativeToIsoDay(anchorDay, end);
  if (!startDay && !endDay) return "日付指定なし";
  if (startDay === endDay) return formatIsoDay(startDay);
  return `${startDay ? formatIsoDay(startDay) : "任意"}〜${endDay ? formatIsoDay(endDay) : "任意"}`;
}

function resultRangeLabel(tasks: TaskDraft[]): string {
  const values = tasks.flatMap((task) => [task.relative_start_day, task.relative_end_day]).filter((value): value is number => value !== null);
  if (values.length === 0) return "日付指定なし";
  return formatDayRange(Math.min(...values), Math.max(...values));
}

function progressLabel(action: "search" | "enrich" | "save", seconds: number): string {
  if (action === "search") return seconds < 2 ? "検索対象を絞り込んでいます" : "文脈に近い順に並べています";
  if (action === "enrich") return seconds < 4 ? "分野と利用状況を整理しています" : "項目のまとまりを作っています";
  if (seconds < 4) return "公開内容を検証しています";
  return seconds < 8 ? "検索できる形で保存しています" : "公開処理を完了しています";
}

function isReviewableEnrichment(enrichment: EnrichmentDraft | null, taskCount: number): enrichment is EnrichmentDraft {
  if (!enrichment || !enrichment.domain.trim() || !enrichment.context_text.trim() || enrichment.task_groupings.length === 0) return false;
  const used = new Set<number>();
  const groupsAreValid = enrichment.task_groupings.every((group) =>
    group.label.trim().length > 0 && group.task_offsets.length > 0 && group.task_offsets.every((offset) => {
      if (offset < 0 || offset >= taskCount || used.has(offset)) return false;
      used.add(offset);
      return true;
    }),
  );
  return groupsAreValid && used.size === taskCount;
}

function humanizeApiError(status: number, detail: unknown, fallback: string): string {
  if (typeof detail === "string" && /[ぁ-んァ-ヶ一-龠]/u.test(detail)) return detail;
  if (status === 401) return "Google アカウントでログインし直してください。";
  if (status === 403) return "この操作を行う権限がありません。";
  if (status === 404) return "対象の内容が見つかりませんでした。";
  if (status === 409) return "内容が更新されています。読み込み直して確認してください。";
  if (status === 422) return "公開できない情報が含まれています。内容を確認してください。";
  if (status === 429) return "処理が混み合っています。少し待ってから再試行してください。";
  return fallback;
}
