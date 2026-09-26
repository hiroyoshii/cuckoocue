"use client";

import { completedEditorSelection } from "@/lib/completed-editor-handoff";

import {
  AlertCircle, CalendarCheck2,
  History, Library,
  ListChecks, Loader2, LogIn, MoreHorizontal, Plus, RotateCcw, Search,
  Smartphone, User, WandSparkles,
} from "lucide-react";
import { FormEvent, type RefObject, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  deleteUser,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  reauthenticateWithPopup,
  revokeAccessToken,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { cueApiFetch } from "@/lib/api-client";
import { firebaseAuth, hasFirebaseClientConfig } from "@/lib/firebase-client";
import { buildAndroidRunUri, type AndroidImportTransfer } from "@/lib/run-transfer";
import { TaskManagement } from "./task-management";
import { BrandLockup } from "./brand-mark";
import { AccountControl } from "./account-control";
import { SearchResultItem } from "./search/search-result";
import { SearchIntroduction } from "./search/search-introduction";
import { TaskEditor } from "./tasks/task-editor";
import { CompletedRunReview, type CompletedReviewState } from "./tasks/completed-run-review";
import { RunHandoff } from "./run-handoff";
import { taskErrors } from "./tasks/task-values";
import { OwnerLists } from "./owner-lists";
import { PublishCuebook } from "./publish-cuebook";
import { PublicationLinks } from "./publication-links";
import { PublicRevision } from "./public-revision";
import { ShelfDetailView } from "./shelf-detail";
import type { EditorialProvenance, ShelfDetail } from "@/lib/shelves";
import { ScheduledReuse, ScheduleDialog, ScheduleLoginRecovery } from "./scheduled-reuse";
import type { ScheduledReuseInput } from "@/lib/scheduled-run";
import { relativeDays } from "@/lib/schedule-dates";
import type { Cuebook, SaveCuebookInput } from "@/lib/cuebook-schema";

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
  tasks: (TaskDraft & { id: string })[];
  task_groupings: TaskGrouping[] | null;
  text_matched: boolean;
  shelves?: Array<{ id: string; title: string }>;
};
type EnrichmentDraft = { domain: string; context_text: string; task_groupings: TaskGrouping[] };
type ImportPayload = AndroidImportTransfer;
type View = "explore" | "publish" | "history" | "library" | "apps";
type ShelfRevision = {
  id: string;
  title: string;
  tasks: Array<{
    id: string;
    title: string;
    default_priority: number | null;
    relative_start_day: number | null;
    relative_end_day: number | null;
  }>;
  published_at: string;
  withdrawn_at: string | null;
  provenance?: EditorialProvenance | null;
};
type Shelf = {
  id: string;
  title: string;
  context: string;
  forked_from_shelf_id: string | null;
  is_owned: boolean;
  created_at: string;
  updated_at: string;
  item_count: number;
  curation?: { is_default: boolean; curator_label: string; reviewed_at: string } | null;
  items?: Array<{
    revision_id: string;
    position: number;
    revision: ShelfRevision;
  }>;
};

type PersistedWorkspace = {
  version: 1;
  view: View | "search" | "save" | "shelves" | "do" | "create";
  searchMessage: string;
  targetAnchorDay: string;
  results: SearchResult[];
  searchDomain: string | null;
  nextCursor: string | null;
  hasSearched: boolean;
  saveTitle: string;
  tasks: TaskDraft[];
  enrichment: EnrichmentDraft | null;
  preparedImport: ImportPayload | null;
  androidImportUri: string | null;
  saveOperationId: string;
  savedTitle: string | null;
  saveSource: "new" | "completed";
  completedReview: CompletedReviewState | null;
  reviewingCompleted: boolean;
  cuebookId: string;
  cuebookTaskIds: string[];
  savedCuebook: Cuebook | null;
  pendingPrivateSave: SaveCuebookInput | null;
  shelfCreation?: { operation: string; title: string; context: string; open: boolean; submitted: boolean };
};

const WorkspaceStorageKey = "cuckoo-cue:web-workspace:v1";

const emptyTask = (): TaskDraft => ({
  text: "", default_priority: null, relative_start_day: null, relative_end_day: null,
});

export function CuckooCueWebApp({ importRunId }: { importRunId?: string } = {}) {
  const [devUserId, setDevUserId] = useState("local-user");
  const [authReady, setAuthReady] = useState(!hasFirebaseClientConfig());
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState("");
  const editedSearch = useRef(false);
  const searchFocus = useRef<{ start: number; end: number } | null>(null);
  const [queuedSearch, setQueuedSearch] = useState(false);
  const [accountMenu, setAccountMenu] = useState<"desktop" | "mobile" | null>(null);
  const [accountBusy, setAccountBusy] = useState<"login" | "logout" | "delete" | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const connecting = useRef<Promise<void> | null>(null);
  const previousUser = useRef<FirebaseUser | null>(null);
  const connect = useCallback(() => {
    if (connecting.current) return connecting.current;
    setError(null);
    connecting.current = (async () => {
      const auth = firebaseAuth();
      await auth.authStateReady();
      if (!auth.currentUser) await signInAnonymously(auth);
    })().catch(() => {
      setError("接続できませんでした。もう一度操作してください。"); setQueuedSearch(false);
    }).finally(() => { connecting.current = null; });
    return connecting.current;
  }, []);
  useEffect(() => {
    if (!hasFirebaseClientConfig()) return;
    return onAuthStateChanged(firebaseAuth(), (next) => {
      const field = document.activeElement;
      if (field instanceof HTMLTextAreaElement && field.getAttribute("aria-label") === "Search query") {
        searchFocus.current = { start: field.selectionStart, end: field.selectionEnd };
      }
      if (previousUser.current && !previousUser.current.isAnonymous && previousUser.current.uid !== next?.uid) {
        setSearchMessage(""); editedSearch.current = false; setQueuedSearch(false); searchFocus.current = null;
      }
      previousUser.current = next;
      setUser(next); setAuthReady(true);
    });
  }, []);
  const signIn = async (kind: "google" | "apple" = "google") => {
    if (accountBusy) return false;
    setAccountBusy("login"); setAccountError(null);
    try {
      const provider = kind === "google" ? new GoogleAuthProvider() : new OAuthProvider("apple.com");
      if (provider instanceof GoogleAuthProvider) provider.setCustomParameters({ prompt: "select_account" });
      else { provider.addScope("email"); provider.addScope("name"); }
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) await signInWithRedirect(firebaseAuth(), provider);
      else await signInWithPopup(firebaseAuth(), provider);
      return true;
    } catch (error) {
      setAccountError(loginError(error));
      setAccountMenu(window.matchMedia("(max-width: 680px)").matches ? "mobile" : "desktop");
      return false;
    } finally { setAccountBusy(null); }
  };
  const deleteAccount = async () => {
    if (accountBusy || !user || user.isAnonymous) return;
    if (!window.confirm("アカウントとすべての本人データを削除します。他の利用者が取り込んだRunは残ります。この操作は取り消せません。")) return;
    setAccountBusy("delete"); setAccountError(null);
    try {
      const providers = new Set(user.providerData.map(item => item.providerId));
      if (providers.has("apple.com")) {
        const provider = new OAuthProvider("apple.com"); provider.addScope("email"); provider.addScope("name");
        const result = await reauthenticateWithPopup(user, provider);
        const token = OAuthProvider.credentialFromResult(result)?.accessToken;
        if (token) await revokeAccessToken(firebaseAuth(), token);
      } else if (providers.has("google.com")) {
        const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
        await reauthenticateWithPopup(user, provider);
      }
      const response = await cueApiFetch("/api/account", user.uid, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "アカウントを削除できませんでした。");
      sessionStorage.removeItem(`${WorkspaceStorageKey}:${user.uid}`);
      await deleteUser(user);
      setAccountMenu(null);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "アカウントを削除できませんでした。");
    } finally { setAccountBusy(null); }
  };
  const logOut = async () => {
    if (accountBusy) return;
    setAccountBusy("logout"); setAccountError(null);
    try {
      await signOut(firebaseAuth());
      if (user) sessionStorage.removeItem(`${WorkspaceStorageKey}:${user.uid}`);
    } catch { setAccountError("ログアウトできませんでした。"); }
    finally { setAccountBusy(null); }
  };
  const closeMenu = useCallback(() => setAccountMenu(null), []);
  const accountControl = (location: "desktop" | "mobile") => <AccountControl user={user} ready={authReady} busy={accountBusy} error={accountError}
    compact={location === "mobile"} open={accountMenu === location} onToggle={() => setAccountMenu(current => current === location ? null : location)}
    onClose={closeMenu} onGoogleLogin={() => void signIn("google")} onAppleLogin={() => void signIn("apple")} onLogout={() => void logOut()} onDelete={() => void deleteAccount()} />;
  return <AccountWorkspace key={user?.uid ?? devUserId} user={user} authReady={authReady}
    devUserId={user?.uid ?? devUserId} setDevUserId={(id) => { editedSearch.current = false; setSearchMessage(""); setDevUserId(id); }} importRunId={importRunId}
    searchMessage={searchMessage} setSearchMessage={value => { editedSearch.current = true; setSearchMessage(value); }}
    restoreSearch={value => { if (!editedSearch.current) setSearchMessage(value); }} searchFocus={searchFocus}
    onConnect={connect} onSignIn={() => signIn("google")} sessionError={error} queuedSearch={queuedSearch}
    onQueueSearch={() => { setQueuedSearch(true); if (hasFirebaseClientConfig()) void connect(); }} onConsumeSearch={() => setQueuedSearch(false)}
    desktopAccount={accountControl("desktop")} mobileAccount={accountControl("mobile")} />;
}

function AccountWorkspace({ user, authReady, devUserId, setDevUserId, importRunId, searchMessage, setSearchMessage, restoreSearch, searchFocus,
  onConnect, onSignIn: signInWithGoogle, sessionError, queuedSearch, onQueueSearch, onConsumeSearch, desktopAccount, mobileAccount }: {
  user: FirebaseUser | null; devUserId: string; setDevUserId: (value: string) => void; importRunId?: string;
  authReady: boolean; searchMessage: string; setSearchMessage: (value: string) => void; restoreSearch: (value: string) => void;
  searchFocus: RefObject<{ start: number; end: number } | null>;
  onConnect: () => Promise<void>; onSignIn: () => Promise<boolean>; sessionError: string | null; queuedSearch: boolean;
  onQueueSearch: () => void; onConsumeSearch: () => void; desktopAccount: ReactNode; mobileAccount: ReactNode;
}) {
  const [view, setView] = useState<View>("explore");
  const registered = !hasFirebaseClientConfig() || Boolean(user && !user.isAnonymous);
  const canRequest = authReady && (!hasFirebaseClientConfig() || !!user);
  const identity = user?.uid ?? devUserId;
  const [workspaceOwner, setWorkspaceOwner] = useState<string | null>(null);
  const [cuebookId, setCuebookId] = useState(() => crypto.randomUUID());
  const [cuebookTaskIds, setCuebookTaskIds] = useState<string[]>([]);
  const [savedCuebook, setSavedCuebook] = useState<Cuebook | null>(null);
  const [pendingPrivateSave, setPendingPrivateSave] = useState<SaveCuebookInput | null>(null);
  const [cuebookConflict, setCuebookConflict] = useState<Cuebook | null>(null);
  const [memberships, setMemberships] = useState<string[]>([]);
  const [membershipReady, setMembershipReady] = useState(false);
  const [membershipError, setMembershipError] = useState(false);
  const [membershipAttempt, setMembershipAttempt] = useState(0);
  const [saveTitle, setSaveTitle] = useState("");
  const [tasks, setTasks] = useState<TaskDraft[]>([emptyTask(), emptyTask(), emptyTask()]);
  const [enrichment, setEnrichment] = useState<EnrichmentDraft | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchDomain, setSearchDomain] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [preparedImport, setPreparedImport] = useState<ImportPayload | null>(null);
  const [androidImportUri, setAndroidImportUri] = useState<string | null>(null);
  const [targetAnchorDay, setTargetAnchorDay] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchRetry, setSearchRetry] = useState<"search" | "more" | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [saveSource, setSaveSource] = useState<"new" | "completed">("new");
  const [completedReview, setCompletedReview] = useState<CompletedReviewState | null>(null);
  const [reviewingCompleted, setReviewingCompleted] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "search" | "more" | "enrich" | "save" | "import" | "shelves" | "fork" | "createShelf" | "updateShelf" | null
  >(null);
  const [busySeconds, setBusySeconds] = useState(0);
  const [workspaceRestored, setWorkspaceRestored] = useState(false);
  const [isAndroidDevice] = useState(() => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent));
  const [saveOperationId, setSaveOperationId] = useState(() => crypto.randomUUID());
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [selectedShelf, setSelectedShelf] = useState<Shelf | null>(null);
  const [shelfReadVersion, setShelfReadVersion] = useState(0);
  const [newShelfTitle, setNewShelfTitle] = useState("");
  const [newShelfContext, setNewShelfContext] = useState("");
  const [showShelfCreateForm, setShowShelfCreateForm] = useState(false);
  const [shelfCreateOperation, setShelfCreateOperation] = useState(() => crypto.randomUUID());
  const [shelfCreateSubmitted, setShelfCreateSubmitted] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [navigationAttempt, setNavigationAttempt] = useState(0);
  const [shelvesLoaded, setShelvesLoaded] = useState(false);
  const [shelvesLoading, setShelvesLoading] = useState(false);
  const [shelvesFailed, setShelvesFailed] = useState(false);
  const [failedShelfId, setFailedShelfId] = useState<string | null>(null);
  const loadedRunId = useRef<string | null>(null);
  const [runReadAttempt, setRunReadAttempt] = useState(0);
  const [failedRunRead, setFailedRunRead] = useState(false);
  const pendingSearch = useRef<AbortController | null>(null);
  const pendingShelfRead = useRef<AbortController | null>(null);
  const restoreSearchRef = useRef(restoreSearch);
  useEffect(() => { restoreSearchRef.current = restoreSearch; }, [restoreSearch]);

  useEffect(() => () => { pendingSearch.current?.abort(); pendingShelfRead.current?.abort(); }, []);

  useEffect(() => {
    if (!authReady) return;
    const frame = window.requestAnimationFrame(() => {
      setView("explore"); setSaveTitle(""); setTasks([emptyTask()]); setEnrichment(null);
      setSavedTitle(null); setCompletedReview(null); setReviewingCompleted(false);
      setSavedCuebook(null); setPendingPrivateSave(null); setCuebookConflict(null); setCuebookId(crypto.randomUUID()); setCuebookTaskIds([]);
      setMemberships([]); setMembershipReady(false); setSelectedShelf(null); loadedRunId.current = null;
      pendingShelfRead.current?.abort();
      setFailedRunRead(false);
      try {
        const stored = hasFirebaseClientConfig() && !user ? null : sessionStorage.getItem(`${WorkspaceStorageKey}:${identity}`);
        if (stored) {
          const restored = JSON.parse(stored) as Partial<PersistedWorkspace>;
          if (restored.version === 1) {
            if (restored.view === "history" || restored.view === "library" || restored.view === "apps") setView(restored.view);
            else if (restored.view === "publish" && Array.isArray(restored.tasks)) setView("publish");
            else setView("explore");
            if (typeof restored.searchMessage === "string") restoreSearchRef.current(restored.searchMessage);
            if (isIsoDay(restored.targetAnchorDay)) setTargetAnchorDay(restored.targetAnchorDay);
            if (Array.isArray(restored.results)) setResults(restored.results);
            if (typeof restored.searchDomain === "string" || restored.searchDomain === null) setSearchDomain(restored.searchDomain);
            if (typeof restored.nextCursor === "string" || restored.nextCursor === null) setNextCursor(restored.nextCursor);
            if (typeof restored.hasSearched === "boolean") setHasSearched(restored.hasSearched);
            if (typeof restored.saveTitle === "string") setSaveTitle(restored.saveTitle);
            if (Array.isArray(restored.tasks)) setTasks(restored.tasks);
            if (restored.enrichment) setEnrichment(restored.enrichment);
            if (restored.preparedImport) setPreparedImport(restored.preparedImport);
            if (typeof restored.androidImportUri === "string" || restored.androidImportUri === null) setAndroidImportUri(restored.androidImportUri);
            if (typeof restored.saveOperationId === "string") setSaveOperationId(restored.saveOperationId);
            if (typeof restored.savedTitle === "string" || restored.savedTitle === null) setSavedTitle(restored.savedTitle);
            if (restored.saveSource === "new" || restored.saveSource === "completed") setSaveSource(restored.saveSource);
            if (restored.completedReview) setCompletedReview(restored.completedReview);
            if (restored.reviewingCompleted === true) setReviewingCompleted(true);
            if (restored.cuebookId) setCuebookId(restored.cuebookId);
            if (restored.cuebookTaskIds) setCuebookTaskIds(restored.cuebookTaskIds);
            if (restored.savedCuebook) setSavedCuebook(restored.savedCuebook);
            if (restored.pendingPrivateSave) setPendingPrivateSave(restored.pendingPrivateSave);
            if (restored.shelfCreation) {
              setShelfCreateOperation(restored.shelfCreation.operation); setNewShelfTitle(restored.shelfCreation.title);
              setNewShelfContext(restored.shelfCreation.context); setShowShelfCreateForm(restored.shelfCreation.open);
              setShelfCreateSubmitted(restored.shelfCreation.submitted);
            }
          }
        }
      } catch {
        try { sessionStorage.removeItem(`${WorkspaceStorageKey}:${identity}`); } catch { /* Storage may be disabled. */ }
      } finally {
        const entryUrl = new URL(window.location.href);
        const entryView = entryUrl.searchParams.get("view");
        if (entryView === "history" || entryView === "library" || entryView === "apps") setView(entryView);
        setWorkspaceRestored(true);
        setWorkspaceOwner(identity);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [authReady, identity, user]);

  useEffect(() => {
    if (workspaceOwner !== identity || !searchFocus.current) return;
    const frame = requestAnimationFrame(() => {
      const selection = searchFocus.current;
      const field = document.querySelector<HTMLTextAreaElement>('[aria-label="Search query"]');
      if (selection && field) { field.focus({ preventScroll: true }); field.setSelectionRange(selection.start, selection.end); }
      searchFocus.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [workspaceOwner, identity, searchFocus]);

  useEffect(() => {
    if (!workspaceRestored || workspaceOwner !== identity || (hasFirebaseClientConfig() && !user)) return;
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
      tasks,
      enrichment,
      preparedImport,
      androidImportUri,
      saveOperationId,
      savedTitle,
      saveSource,
      completedReview,
      reviewingCompleted,
      cuebookId, cuebookTaskIds, savedCuebook, pendingPrivateSave,
      shelfCreation: { operation: shelfCreateOperation, title: newShelfTitle, context: newShelfContext, open: showShelfCreateForm, submitted: shelfCreateSubmitted },
    };
    try {
      sessionStorage.setItem(`${WorkspaceStorageKey}:${identity}`, JSON.stringify(workspace));
    } catch {
      // An unavailable browser store must not discard the in-memory edit.
      const notice = window.setTimeout(() => setErrorMessage("このブラウザには一時保存できません。ページを閉じる前に操作を完了してください。"), 0);
      return () => window.clearTimeout(notice);
    }
  }, [
    androidImportUri, enrichment, hasSearched, nextCursor, preparedImport,
    results, saveOperationId, savedTitle, saveSource, saveTitle, searchDomain, searchMessage, targetAnchorDay,
    tasks, view, workspaceRestored, completedReview, reviewingCompleted,
    cuebookId, cuebookTaskIds, savedCuebook, pendingPrivateSave, workspaceOwner, identity, user,
    shelfCreateOperation, newShelfTitle, newShelfContext, showShelfCreateForm, shelfCreateSubmitted,
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
    if (importRunId || !authReady || workspaceOwner !== identity) return;
    const url = new URL(window.location.href);
    const runId = url.searchParams.get("run_id");
    const editingFromAndroid = new URLSearchParams(url.hash.slice(1)).has("edit_tasks");
    if (!runId || loadedRunId.current === runId) return;
    if (!registered) {
      const frame = window.requestAnimationFrame(() => setView("publish"));
      return () => window.cancelAnimationFrame(frame);
    }
    loadedRunId.current = runId;
    let cancelled = false;

    void cueApiFetch(`/api/runs/${encodeURIComponent(runId)}${editingFromAndroid ? "?completed_tasks=true" : ""}`, devUserId)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "完了したリストを読み込めませんでした。"));
        if (cancelled) return;
        const selectedIds = completedEditorSelection(url.hash, body.run.task_ids) ?? [...body.run.task_ids];
        const selectedTasks = body.run.tasks.filter((_: unknown, index: number) => selectedIds.includes(body.run.task_ids[index]));
        setFailedRunRead(false);
        setSaveTitle(body.run.title);
        setTasks(selectedTasks);
        setCuebookId(crypto.randomUUID()); setCuebookTaskIds(selectedTasks.map(() => crypto.randomUUID())); setSavedCuebook(null); setPendingPrivateSave(null);
        setEnrichment(null);
        setSavedTitle(null);
        setSaveOperationId(crypto.randomUUID());
        setSaveSource("completed");
        setCompletedReview({ run: body.run, selectedIds, operationId: crypto.randomUUID(), submitted: false, savedRunId: null });
        setReviewingCompleted(!editingFromAndroid);
        setView("publish");
        url.searchParams.delete("run_id");
        if (editingFromAndroid) url.hash = "";
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      })
      .catch((error) => {
        if (cancelled) return;
        loadedRunId.current = null;
        setFailedRunRead(true);
        setErrorMessage(error instanceof Error ? error.message : "完了したリストを読み込めませんでした。");
      });

    return () => {
      cancelled = true;
      if (loadedRunId.current === runId) loadedRunId.current = null;
    };
  }, [authReady, devUserId, registered, workspaceOwner, identity, importRunId, runReadAttempt]);

  const cleanedTasks = useMemo(
    () => tasks.filter((task) => task.text.trim().length > 0),
    [tasks],
  );
  const canSearch = searchMessage.trim().length > 0 && (busyAction === null || busyAction === "shelves");
  const canPrepareSave = saveTitle.trim().length > 0 && tasks.length > 0 && tasks.every((task) => !Object.values(taskErrors(task)).some(Boolean)) && busyAction === null;
  const canSave = canPrepareSave && isReviewableEnrichment(enrichment, cleanedTasks.length);
  const currentUserId = user?.uid ?? devUserId;

  useEffect(() => {
    if (!authReady || workspaceOwner !== identity || !registered) return;
    let cancelled = false;
    void cueApiFetch("/api/memberships", devUserId).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "参加グループを読み込めませんでした。");
      if (!cancelled) { setMemberships(body.shelf_ids); setMembershipReady(true); setMembershipError(false); }
    }).catch((error) => { if (!cancelled) { setErrorMessage(error.message); setMembershipError(true); } });
    return () => { cancelled = true; };
  }, [authReady, workspaceOwner, identity, registered, devUserId, shelvesLoaded, membershipAttempt]);

  async function toggleMembership() {
    if (!selectedShelf) return;
    if (user?.isAnonymous) { await signInWithGoogle(); return; }
    if (!membershipReady || busyAction) return;
    const id = selectedShelf.id;
    const joined = !memberships.includes(id);
    setBusyAction("shelves"); setErrorMessage(null);
    try {
      const response = await cueApiFetch(`/api/memberships/${encodeURIComponent(id)}`, devUserId, { method: "PUT", body: JSON.stringify({ joined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "参加状態を変更できませんでした。");
      setMemberships((current) => joined ? [...new Set([...current, id])] : current.filter((value) => value !== id));
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "参加状態を変更できませんでした。"); }
    finally { setBusyAction(null); }
  }

  async function searchTaskLists(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!searchMessage.trim()) return;
    if (!canRequest || workspaceOwner !== identity) { onQueueSearch(); return; }
    pendingSearch.current?.abort();
    const controller = new AbortController();
    pendingSearch.current = controller;
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
        signal: controller.signal,
        body: JSON.stringify({ message: searchMessage, page_size: 20 }),
      });
      const body = await response.json();
      if (pendingSearch.current !== controller) return;
      if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "検索に失敗しました。"));
      setResults(body.results ?? []);
      setSearchDomain(body.searchDomain ?? null);
      setNextCursor(body.nextCursor ?? null);
    } catch (error) {
      if (pendingSearch.current !== controller || controller.signal.aborted) return;
      setResults([]);
      setSearchDomain(null);
      setNextCursor(null);
      setSearchRetry("search");
      setErrorMessage(error instanceof Error ? error.message : "検索に失敗しました。");
    } finally {
      if (pendingSearch.current === controller) {
        pendingSearch.current = null;
        setBusyAction(null);
      }
    }
  }

  async function loadMoreResults() {
    if (!nextCursor || pendingSearch.current) return;
    const controller = new AbortController();
    pendingSearch.current = controller;
    setBusySeconds(0);
    setBusyAction("more");
    setErrorMessage(null);
    setSearchRetry(null);
    try {
      const response = await cueApiFetch("/api/search", devUserId, {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ cursor: nextCursor, page_size: 20 }),
      });
      const body = await response.json();
      if (pendingSearch.current !== controller) return;
      if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "続きを読み込めませんでした。"));
      const nextResults = body.results ?? [];
      setResults((current) => [...current, ...nextResults.filter((result: SearchResult) => !current.some((item) => item.id === result.id))]);
      setNextCursor(body.nextCursor ?? null);
    } catch (error) {
      if (pendingSearch.current !== controller || controller.signal.aborted) return;
      setSearchRetry("more");
      setErrorMessage(error instanceof Error ? error.message : "続きを読み込めませんでした。");
    } finally {
      if (pendingSearch.current === controller) {
        pendingSearch.current = null;
        setBusyAction(null);
      }
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

  async function saveTaskList(event?: FormEvent<HTMLFormElement>, acceptedBase?: Cuebook) {
    event?.preventDefault();
    setBusySeconds(0);
    setBusyAction("save");
    setErrorMessage(null);
    setSearchRetry(null);
    try {
      const request = (!acceptedBase && pendingPrivateSave) || {
        operation_id: crypto.randomUUID(), expected_updated_at: acceptedBase?.updated_at ?? savedCuebook?.updated_at ?? null,
        content: { title: saveTitle, tasks: cleanedTasks.map((task, index) => ({ ...task, id: cuebookTaskIds[index] ?? crypto.randomUUID() })), enrichment },
      };
      setPendingPrivateSave(request);
      setCuebookTaskIds(request.content.tasks.map((task) => task.id));
      const response = await cueApiFetch(`/api/cuebooks/${cuebookId}`, devUserId, {
        method: "PUT",
        body: JSON.stringify(request),
      });
      const body = await response.json();
      if (response.status === 409) {
        const latestResponse = await cueApiFetch(`/api/cuebooks/${cuebookId}`, devUserId);
        if (latestResponse.ok) setCuebookConflict((await latestResponse.json()).cuebook);
      }
      if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "保存できませんでした。"));
      setSavedCuebook(body.cuebook);
      setPendingPrivateSave(null);
      setCuebookConflict(null);
      setSavedTitle(body.cuebook.title);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  async function openOwnedList(id: string, history = view === "history", record = true) {
    if (record) {
      const url = new URL(window.location.href);
      url.search = new URLSearchParams({ [history ? "completed_run_id" : "cuebook_id"]: id }).toString();
      window.history.pushState({}, "", `${url.pathname}${url.search}`);
    }
    setBusyAction("save"); setErrorMessage(null);
    try {
      const response = await cueApiFetch(history ? `/api/runs/${encodeURIComponent(id)}` : `/api/cuebooks/${encodeURIComponent(id)}`, devUserId);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "リストを開けませんでした。");
      setSavedTitle(null); setPendingPrivateSave(null); setSaveOperationId(crypto.randomUUID());
      if (history) {
        setSaveTitle(body.run.title); setTasks(body.run.tasks); setEnrichment(null);
        setCuebookId(crypto.randomUUID()); setCuebookTaskIds(body.run.tasks.map(() => crypto.randomUUID())); setSavedCuebook(null);
        setSaveSource("completed"); setCompletedReview({ run: body.run, selectedIds: [...body.run.task_ids], operationId: crypto.randomUUID(), submitted: false, savedRunId: null }); setReviewingCompleted(true);
      } else {
        const cuebook: Cuebook = body.cuebook;
        setCuebookId(cuebook.id); setSavedCuebook(cuebook); setSaveTitle(cuebook.title);
        setTasks(cuebook.tasks.map((task) => ({ text: task.text, default_priority: task.default_priority ?? null, relative_start_day: task.relative_start_day ?? null, relative_end_day: task.relative_end_day ?? null })));
        setCuebookTaskIds(cuebook.tasks.map((task) => task.id)); setEnrichment(cuebook.enrichment);
        setCompletedReview(null); setReviewingCompleted(false);
      }
      setView("publish");
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "開けませんでした。"); }
    finally { setBusyAction(null); }
  }

  function finishScheduledImport(id: string, input: ScheduledReuseInput, runId: string) {
    const result = results.find((item) => item.id === id)!;
    const dates = new Map(input.task_dates?.map((task) => [task.task_id, task]));
    const payload: ImportPayload = { version: 1, title: result.title, target_anchor_day: input.target_anchor_day,
      tasks: result.tasks.map((task) => ({ title: task.text, default_priority: task.default_priority,
        relative_start_day: relativeDays(input.target_anchor_day, dates.get(task.id)!.available_from_day),
        relative_end_day: relativeDays(input.target_anchor_day, dates.get(task.id)!.due_day) })) };
    setPreparedImport(payload);
    setTargetAnchorDay(input.target_anchor_day);
    setAndroidImportUri(buildAndroidRunUri(runId));
  }

  const queuedAction = useRef<() => void>(() => {});
  useEffect(() => { queuedAction.current = () => { onConsumeSearch(); void searchTaskLists(); }; });
  useEffect(() => {
    if (!queuedSearch || !canRequest || workspaceOwner !== identity) return;
    const frame = requestAnimationFrame(() => queuedAction.current());
    return () => cancelAnimationFrame(frame);
  }, [queuedSearch, canRequest, workspaceOwner, identity]);

  const loadShelves = useCallback(async () => {
    setBusySeconds(0);
    setShelvesLoading(true);
    setShelvesFailed(false);
    setErrorMessage(null);
    try {
      const response = await cueApiFetch("/api/shelves", devUserId);
      const body = await response.json();
      if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "状況を読み込めませんでした。"));
      setShelves(body.shelves ?? []);
      setShelvesLoaded(true);
    } catch (error) {
      setShelvesFailed(true);
      setErrorMessage(error instanceof Error ? error.message : "状況を読み込めませんでした。");
    } finally {
      setShelvesLoading(false);
    }
  }, [devUserId]);

  useEffect(() => {
    if (!authReady || workspaceOwner !== identity || !registered || shelvesLoaded || shelvesLoading || shelvesFailed) return;
    const frame = window.requestAnimationFrame(() => void loadShelves());
    return () => window.cancelAnimationFrame(frame);
  }, [view, shelvesLoaded, shelvesLoading, shelvesFailed, loadShelves, authReady, workspaceOwner, identity, registered]);

  const openShelf = useCallback(async (id: string) => {
    pendingShelfRead.current?.abort();
    const controller = new AbortController();
    pendingShelfRead.current = controller;
    const url = new URL(window.location.href);
    if (url.searchParams.get("shelf_id") !== id) {
      url.search = new URLSearchParams({ shelf_id: id }).toString();
      window.history.pushState({}, "", `${url.pathname}${url.search}`);
    }
    setSelectedRevisionId(null);
    setFailedShelfId(null);
    setBusySeconds(0);
    setBusyAction("shelves");
    setErrorMessage(null);
    try {
      const response = await cueApiFetch(`/api/shelves/${encodeURIComponent(id)}`, devUserId, { signal: controller.signal });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(humanizeApiError(response.status, body.error, "状況を開けませんでした。"));
      setSelectedShelf(body.shelf);
      setShelfReadVersion((value) => value + 1);
      setView("explore");
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailedShelfId(id);
      setErrorMessage(error instanceof Error ? error.message : "状況を開けませんでした。");
    } finally {
      if (pendingShelfRead.current === controller) { pendingShelfRead.current = null; setBusyAction(null); }
    }
  }, [devUserId]);

  const readLocation = useRef<() => void>(() => {});
  useEffect(() => {
    readLocation.current = () => {
      const params = new URL(window.location.href).searchParams;
      const shelf = params.get("shelf_id");
      const revision = params.get("revision_id");
      const original = params.get("cuebook_id");
      const completed = params.get("completed_run_id");
      if ((shelf || revision) && !canRequest) { void onConnect(); return; }
      if (shelf) { void openShelf(shelf); return; }
      pendingShelfRead.current?.abort(); setSelectedShelf(null); setSelectedRevisionId(revision);
      if (revision) { setView("explore"); return; }
      if (original || completed) {
        if (!registered) setView("publish");
        else if (navigationAttempt === 0 && ((original && savedCuebook?.id === original) || (completed && completedReview?.run.run_id === completed))) setView("publish");
        else void openOwnedList((original ?? completed)!, !!completed, false);
        return;
      }
      if (params.get("view") === "history" || params.get("view") === "library" || params.get("view") === "apps") setView(params.get("view") as View);
      else if (navigationAttempt > 0) setView("explore");
    };
  });
  useEffect(() => {
    const changed = () => setNavigationAttempt(value => value + 1);
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  useEffect(() => {
    if (workspaceOwner !== identity || importRunId) return;
    const frame = window.requestAnimationFrame(() => readLocation.current());
    return () => window.cancelAnimationFrame(frame);
  }, [workspaceOwner, identity, importRunId, navigationAttempt]);

  function shelfSaved(shelf: ShelfDetail, joined = false) {
    setSelectedShelf(shelf);
    setShelves((current) => [shelf, ...current.filter((item) => item.id !== shelf.id)]);
    if (joined) setMemberships((current) => [...new Set([...current, shelf.id])]);
    const url = new URL(window.location.href);
    url.searchParams.set("shelf_id", shelf.id);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  async function createShelfFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newShelfTitle.trim() || !newShelfContext.trim()) return;
    setBusySeconds(0);
    setBusyAction("createShelf");
    setShelfCreateSubmitted(true);
    setErrorMessage(null);
    try {
      const response = await cueApiFetch("/api/shelves", devUserId, {
        method: "POST",
        body: JSON.stringify({
          operation_id: shelfCreateOperation,
          title: newShelfTitle,
          context: newShelfContext,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 400 || response.status === 422) setShelfCreateSubmitted(false);
        throw new Error(humanizeApiError(response.status, body.error, "まとまりを作成できませんでした。"));
      }
      setNewShelfTitle("");
      setNewShelfContext("");
      setShowShelfCreateForm(false);
      setSelectedShelf(body.shelf);
      setShelfCreateOperation(crypto.randomUUID());
      setShelfCreateSubmitted(false);
      setMemberships((current) => [...new Set([...current, body.shelf.id])]);
      setShelvesLoaded(false);
      await openShelf(body.shelf.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "まとまりを作成できませんでした。");
    } finally {
      setBusyAction(null);
    }
  }

  function resetSave() {
    setSaveTitle("");
    setTasks([emptyTask(), emptyTask(), emptyTask()]);
    setEnrichment(null);
    setSavedTitle(null);
    setSaveSource("new");
    setErrorMessage(null);
    setSaveOperationId(crypto.randomUUID());
    setView("explore");
  }

  function changeView(nextView: View) {
    if (importRunId) { window.location.assign(nextView === "explore" ? "/" : `/?view=${nextView}`); return; }
    setErrorMessage(null);
    pendingShelfRead.current?.abort();
    const url = new URL(window.location.href);
    url.search = nextView === "explore" ? "" : new URLSearchParams({ view: nextView }).toString();
    if (`${url.pathname}${url.search}` !== `${window.location.pathname}${window.location.search}`) window.history.pushState({}, "", `${url.pathname}${url.search}`);
    setSelectedRevisionId(null);
    if (nextView === "explore") setSelectedShelf(null);
    setView(nextView);
  }

  return (
    <main className="product-shell">
      <ScheduleLoginRecovery key={identity} owner={identity} registered={!hasFirebaseClientConfig() || Boolean(user && !user.isAnonymous)} onSignIn={signInWithGoogle} />
      <aside className="product-rail">
        <a className="brand-lockup" href="#top" aria-label="Cuckoo Cue">
          <BrandLockup priority />
        </a>
        <nav aria-label="主な操作">
          <button className={view === "explore" ? "active" : ""} onClick={() => changeView("explore")}>
            <Search size={18} aria-hidden="true" />探す
          </button>
          <button className={view === "history" || view === "library" || view === "publish" ? "active" : ""} onClick={() => changeView("history")}><History size={18} aria-hidden="true" />完了履歴</button>
          <button className={view === "apps" ? "active" : ""} aria-current={view === "apps" ? "page" : undefined} onClick={() => changeView("apps")}><Smartphone size={18} aria-hidden="true" />タスク管理</button>
          {memberships.length ? <section className="joined-groups"><h2>参加グループ</h2>{shelves.filter((shelf) => memberships.includes(shelf.id)).map((shelf) => <button key={shelf.id} onClick={() => { setView("explore"); void openShelf(shelf.id); }}><Library size={18} aria-hidden="true" />{shelf.title}</button>)}</section> : null}
        </nav>
        <div className="rail-account">{hasFirebaseClientConfig() ? desktopAccount : <details className="connection-panel">
          <summary><User size={17} aria-hidden="true" />接続</summary><label>Dev user<input value={devUserId} onChange={event => setDevUserId(event.target.value)} /></label>
        </details>}</div>
      </aside>

      <section className="product-main" id="top">
        <MobileHeader account={hasFirebaseClientConfig() ? mobileAccount : null} />
        <nav className="mobile-navigation" aria-label="モバイルの主な操作">
          <button type="button" aria-current={view === "explore" ? "page" : undefined} onClick={() => changeView("explore")}><Search size={17} />探す</button>
          <button type="button" aria-current={view === "history" || view === "library" ? "page" : undefined} onClick={() => changeView("history")}><History size={17} />完了履歴</button>
          <button type="button" aria-current={view === "apps" ? "page" : undefined} onClick={() => changeView("apps")}><Smartphone size={17} aria-hidden="true" />タスク管理</button>
          {memberships.length ? <details><summary>参加グループ</summary>{shelves.filter((shelf) => memberships.includes(shelf.id)).map((shelf) => <button type="button" key={shelf.id} onClick={() => { setView("explore"); void openShelf(shelf.id); }}>{shelf.title}</button>)}</details> : null}
        </nav>
        {errorMessage || sessionError ? (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span><strong>処理を完了できませんでした</strong><small>{errorMessage || sessionError}</small></span>
            {view === "explore" && (searchRetry || sessionError) ? (
              <button type="button" onClick={() => {
                const params = new URLSearchParams(window.location.search);
                if (sessionError && (params.has("shelf_id") || params.has("revision_id"))) void onConnect();
                else if (searchRetry === "more") void loadMoreResults();
                else void searchTaskLists();
              }} disabled={busyAction !== null}>
                <RotateCcw size={16} aria-hidden="true" />{searchRetry === "more" ? "続きを再読込" : sessionError && !searchMessage.trim() ? "再接続" : "再検索"}
              </button>
            ) : null}
          </div>
        ) : null}

        {view === "publish" && cuebookConflict ? <section className="publication-panel" aria-label="保存の競合">
          <h2>別の変更が保存されています</h2>
          <details><summary>最新の保存内容を見る</summary><h3>{cuebookConflict.title}</h3><ol>{cuebookConflict.tasks.map((task) => <li key={task.id}>{task.text}</li>)}</ol></details>
          <button type="button" className="secondary-action" disabled={busyAction !== null} onClick={() => void saveTaskList(undefined, cuebookConflict)}>最新の内容を確認し、自分の編集で更新する</button>
        </section> : null}
        {failedRunRead ? <button type="button" className="secondary-action" onClick={() => { setFailedRunRead(false); setErrorMessage(null); setRunReadAttempt((value) => value + 1); }}>完了したリストの読込を再試行</button> : null}
        {membershipError ? <button className="secondary-action" onClick={() => setMembershipAttempt((value) => value + 1)}>参加状態を再取得</button> : null}
        {shelvesFailed ? <button className="secondary-action" onClick={() => void loadShelves()}>グループ一覧を再取得</button> : null}
        {failedShelfId ? <button className="secondary-action" onClick={() => void openShelf(failedShelfId)}>グループを再取得</button> : null}
        {importRunId ? <RunHandoff key={`${identity}:${importRunId}`} runId={importRunId} devUserId={devUserId} registered={!hasFirebaseClientConfig() || Boolean(user && !user.isAnonymous)} onSignIn={signInWithGoogle} /> : view === "apps" ? <TaskManagement /> : view === "explore" ? (
          selectedRevisionId ? <PublicRevision key={selectedRevisionId} id={selectedRevisionId} userId={currentUserId} onSignIn={signInWithGoogle} onBack={() => changeView("explore")} onOpenShelf={(id) => void openShelf(id)} /> : selectedShelf ? (
            <ShelfDetailView key={`${identity}:${selectedShelf.id}:${shelfReadVersion}`} shelf={{ ...selectedShelf, items: selectedShelf.items ?? [] }} userId={currentUserId}
              registered={!hasFirebaseClientConfig() || Boolean(user && !user.isAnonymous)} onSignIn={signInWithGoogle}
              joined={memberships.includes(selectedShelf.id)} membershipReady={membershipReady || !!user?.isAnonymous}
              busy={busyAction !== null} onJoin={toggleMembership} onSaved={shelfSaved} onBack={() => changeView("explore")} />
          ) : (
            <ExploreWorkspace
              searchMessage={searchMessage} setSearchMessage={setSearchMessage}
              targetAnchorDay={targetAnchorDay} setTargetAnchorDay={setTargetAnchorDay}
              canSearch={canSearch && !queuedSearch} busyAction={queuedSearch ? "search" : busyAction} onSearch={searchTaskLists}
              searchRetry={searchRetry}
              searchDomain={searchDomain} hasSearched={hasSearched}
              results={results} onImport={finishScheduledImport}
              preparedImport={preparedImport} androidImportUri={androidImportUri}
              nextCursor={nextCursor} onMore={loadMoreResults}
              busySeconds={busySeconds}
              isAndroidDevice={isAndroidDevice}
              shelves={shelves.filter((shelf) => results.some((result) => result.shelves?.some((related) => related.id === shelf.id)))}
              currentUserId={currentUserId}
              onOpenShelf={openShelf}
              newShelfTitle={newShelfTitle}
              setNewShelfTitle={setNewShelfTitle}
              newShelfContext={newShelfContext}
              setNewShelfContext={setNewShelfContext}
              showCreateForm={showShelfCreateForm}
              setShowCreateForm={setShowShelfCreateForm}
              onCreateShelf={createShelfFromForm}
              createSubmitted={shelfCreateSubmitted}
              canManage={!hasFirebaseClientConfig() || Boolean(user && !user.isAnonymous)}
              onSignIn={signInWithGoogle}
            />
          )
        ) : !authReady || workspaceOwner !== identity ? (
          <section className="workspace" aria-busy="true"><h1>{view === "history" ? "完了履歴" : "自分のリスト"}</h1></section>
        ) : !registered ? (
          <SignInRequired title={view === "history" ? "完了履歴" : view === "library" ? "自分のリスト" : "再利用用に整える"} onBack={() => changeView("explore")} onSignIn={signInWithGoogle} />
        ) : view === "history" || view === "library" ? (
          <OwnerLists key={`${identity}:${view}`} kind={view} devUserId={devUserId} onOpen={(id) => void openOwnedList(id)} onSwitch={() => changeView(view === "history" ? "library" : "history")}
            ownedShelves={shelves.filter(shelf => shelf.is_owned)} onShelf={id => void openShelf(id)} />
        ) : reviewingCompleted && completedReview ? (
          <CompletedRunReview state={completedReview} onChange={setCompletedReview} devUserId={devUserId}
            onBack={() => changeView("history")} onEdit={(selected) => { setTasks(selected); setCuebookTaskIds(selected.map(() => crypto.randomUUID())); setEnrichment(null); setReviewingCompleted(false); }} />
        ) : (
          <SaveWorkspace
            key={saveOperationId}
            title={saveTitle} setTitle={setSaveTitle}
            tasks={tasks} setTasks={setTasks} taskIds={cuebookTaskIds} onTaskIds={setCuebookTaskIds} enrichment={enrichment} setEnrichment={setEnrichment}
            busyAction={busyAction} canPrepare={canPrepareSave} canSave={canSave}
            busySeconds={busySeconds}
            source={saveSource}
            scheduleUnavailable={completedReview?.run.source_anchor_day === null}
            savedTitle={savedTitle} onPrepare={prepareSave} onSave={saveTaskList} onReset={resetSave}
            savedCuebook={savedCuebook} devUserId={devUserId} ownedShelves={shelves.filter((shelf) => shelf.is_owned)}
            onPublished={() => { setShelvesLoaded(false); }}
            onReloadOriginal={() => void openOwnedList(cuebookId, false)}
            onLibrary={() => changeView("library")}
          />
        )}
      </section>
    </main>
  );
}

function loginError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "ログイン画面が閉じられました。";
  if (code === "auth/popup-blocked") return "ログイン画面を開けませんでした。もう一度ログインを押してください。";
  if (code === "auth/network-request-failed") return "接続できませんでした。もう一度ログインを押してください。";
  return "ログインできませんでした。もう一度お試しください。";
}

function SignInRequired({ title, onBack, onSignIn }: { title: string; onBack: () => void; onSignIn: () => void }) {
  return (
    <div className="workspace sign-in-required">
      <h1>{title}</h1>
      <span>Googleアカウントでログインしてください。</span>
      <button type="button" onClick={onSignIn}><LogIn size={18} />ログイン</button>
      <button type="button" className="text-action" onClick={onBack}>探すに戻る</button>
    </div>
  );
}

function MobileHeader({ account }: { account: ReactNode }) {
  return (
    <header className="mobile-header">
      <a className="brand-lockup" href="#top" aria-label="Cuckoo Cue"><BrandLockup priority /></a>
      {account}
    </header>
  );
}

type ExploreWorkspaceProps = SearchWorkspaceProps & ShelfWorkspaceProps;

function ExploreWorkspace(props: ExploreWorkspaceProps) {
  return (
    <div className="explore-stack">
      <SearchWorkspace
        searchMessage={props.searchMessage}
        setSearchMessage={props.setSearchMessage}
        targetAnchorDay={props.targetAnchorDay}
        setTargetAnchorDay={props.setTargetAnchorDay}
        canSearch={props.canSearch}
        searchRetry={props.searchRetry}
        busyAction={props.busyAction}
        onSearch={props.onSearch}
        searchDomain={props.searchDomain}
        hasSearched={props.hasSearched}
        results={props.results}
        onImport={props.onImport}
        preparedImport={props.preparedImport}
        androidImportUri={props.androidImportUri}
        nextCursor={props.nextCursor}
        onMore={props.onMore}
        busySeconds={props.busySeconds}
        isAndroidDevice={props.isAndroidDevice}
        currentUserId={props.currentUserId} onSignIn={props.onSignIn}
        onOpenShelf={props.onOpenShelf}
      />
      {props.shelves.length || props.showCreateForm ? <ShelfWorkspace
        shelves={props.shelves}
        busyAction={props.busyAction}
        busySeconds={props.busySeconds}
        onOpenShelf={props.onOpenShelf}
        newShelfTitle={props.newShelfTitle}
        setNewShelfTitle={props.setNewShelfTitle}
        newShelfContext={props.newShelfContext}
        setNewShelfContext={props.setNewShelfContext}
        showCreateForm={props.showCreateForm}
        setShowCreateForm={props.setShowCreateForm}
        onCreateShelf={props.onCreateShelf}
        createSubmitted={props.createSubmitted}
        canManage={props.canManage}
        onSignIn={props.onSignIn}
        embedded
      /> : null}
    </div>
  );
}

type SearchWorkspaceProps = {
  searchMessage: string; setSearchMessage: (value: string) => void;
  targetAnchorDay: string; setTargetAnchorDay: (value: string) => void;
  canSearch: boolean; busyAction: string | null;
  searchRetry: "search" | "more" | null;
  onSearch: (event?: FormEvent<HTMLFormElement>) => void;
  searchDomain: string | null; hasSearched: boolean;
  results: SearchResult[]; onImport: (id: string, input: ScheduledReuseInput, runId: string) => void;
  currentUserId: string; onSignIn: () => void;
  onOpenShelf: (id: string) => void;
  preparedImport: ImportPayload | null; androidImportUri: string | null;
  nextCursor: string | null; onMore: () => void;
  busySeconds: number; isAndroidDevice: boolean;
};

function SearchWorkspace(props: SearchWorkspaceProps) {
  const inputMounted = useRef(false);
  const mountQuery = (field: HTMLTextAreaElement | null) => {
    if (!field || inputMounted.current) return;
    inputMounted.current = true;
    // Preserve text entered into the server-rendered field before hydration.
    if (field.value && !props.searchMessage) props.setSearchMessage(field.value);
  };
  const pagingSentinel = useRef<HTMLDivElement>(null);
  const handoffPanel = useRef<HTMLElement>(null);
  const [selectedImport, setSelectedImport] = useState<SearchResult | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const searchPositionKey = `cuckoo-cue:search-position:${props.currentUserId}:${props.searchMessage}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = JSON.parse(sessionStorage.getItem(searchPositionKey) ?? "null");
        setExpandedResults(new Set(stored?.expanded ?? []));
        requestAnimationFrame(() => { if (stored?.scroll != null) window.scrollTo(0, stored.scroll); });
      } catch { /* Search remains usable without browser storage. */ }
    });
    const trackScroll = () => {
      try {
        const stored = JSON.parse(sessionStorage.getItem(searchPositionKey) ?? "{}");
        sessionStorage.setItem(searchPositionKey, JSON.stringify({ ...stored, scroll: window.scrollY }));
      } catch { /* Do not interrupt search for a storage failure. */ }
    };
    window.addEventListener("scroll", trackScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", trackScroll); };
  }, [searchPositionKey]);
  function expandResult(id: string, expanded: boolean) {
    setExpandedResults(current => {
      const next = new Set(current); if (expanded) next.add(id); else next.delete(id);
      try { sessionStorage.setItem(searchPositionKey, JSON.stringify({ expanded: [...next], scroll: window.scrollY })); } catch { /* In-memory expansion remains available. */ }
      return next;
    });
  }
  const { busyAction, nextCursor, onMore } = props;

  useEffect(() => {
    const node = pagingSentinel.current;
    if (!node || !nextCursor || busyAction !== null || props.searchRetry) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onMore();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [nextCursor, busyAction, onMore, props.searchRetry]);

  useEffect(() => {
    if (!props.preparedImport || !handoffPanel.current) return;
    handoffPanel.current.focus({ preventScroll: true });
    handoffPanel.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [props.preparedImport]);

  return (
    <div className={`workspace${!props.hasSearched ? " search-landing" : ""}`}>
      {!props.hasSearched ? (
        <section className="search-welcome" aria-labelledby="search-welcome-title">
          <header>
            <p className="search-welcome-eyebrow">暮らしのやることリスト</p>
            <h1 id="search-welcome-title">探して、選んで、<br />スマホで管理する。</h1>
          </header>
          <SearchIntroduction />
        </section>
      ) : <header className="workspace-heading"><h1>探す</h1></header>}
      <form className="search-composer" onSubmit={props.onSearch} autoComplete="off">
        <label><span>{!props.hasSearched ? "どんなことの準備をしますか？" : "目的や条件"}</span><textarea ref={mountQuery} aria-label="Search query" value={props.searchMessage} onChange={(event) => props.setSearchMessage(event.target.value)} placeholder="猫と一緒に引っ越す" rows={2} /></label>
        <div>
          <button className="primary-action" type="submit" disabled={!props.canSearch}>{props.busyAction === "search" ? <Loader2 className="spin" size={18} /> : <Search size={18} />}検索</button>
        </div>
      </form>
      {props.busyAction === "search" ? (
        <ProgressNotice label={progressLabel("search")} />
      ) : null}
      {props.preparedImport ? (
        <section className="handoff-panel" aria-live="polite" ref={handoffPanel} tabIndex={-1}>
          <header>
            <span><small>日程付きのリストを保存しました</small><strong>{props.preparedImport.title}</strong></span>
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
      <section className="cue-surface" aria-label="検索結果" hidden={!props.hasSearched} aria-busy={props.busyAction === "search"}>
        {props.busyAction === "search" ? <div className="search-skeleton" aria-hidden="true"><span /><span /><span /></div> : props.results.length === 0 ? (props.searchRetry ? null : <EmptySearch hasSearched={props.hasSearched} />) : (
          <div className="cue-stack">
            {props.results.map((result) => <SearchResultItem key={result.id} result={result} disabled={props.busyAction !== null} onImport={() => setSelectedImport(result)} onOpenShelf={props.onOpenShelf} expanded={expandedResults.has(result.id)} onExpand={(expanded) => expandResult(result.id, expanded)} />)}
            {props.nextCursor ? <div ref={pagingSentinel}>{props.searchRetry !== "more" ? <button className="more-button" type="button" disabled={props.busyAction !== null} onClick={props.onMore}>{props.busyAction === "more" ? <Loader2 className="spin" size={16} /> : <MoreHorizontal size={16} />}続きを読み込む</button> : <p className="page-error-note">読み込み済みのリストは表示しています。</p>}</div> : null}
          </div>
        )}
      </section>
      {selectedImport ? <ScheduleDialog source={{ type: "revision", id: selectedImport.id }} title={selectedImport.title} tasks={selectedImport.tasks}
        devUserId={props.currentUserId} onSignIn={props.onSignIn}
        onClose={() => setSelectedImport(null)}
        onSaved={(input, runId) => { props.onImport(selectedImport.id, input, runId); setSelectedImport(null); }}
      /> : null}
    </div>
  );
}

function EmptySearch({ hasSearched }: { hasSearched: boolean }) {
  if (!hasSearched) return null;
  return (
    <div className="empty-state">
      <Search size={22} aria-hidden="true" />
      <span className="empty-copy"><strong>条件に合うリストはありません</strong><span>条件を変えて検索</span></span>
    </div>
  );
}

type ShelfWorkspaceProps = {
  createSubmitted: boolean;
  shelves: Shelf[];
  busyAction: string | null;
  busySeconds: number;
  onOpenShelf: (id: string) => void;
  newShelfTitle: string;
  setNewShelfTitle: (value: string) => void;
  newShelfContext: string;
  setNewShelfContext: (value: string) => void;
  showCreateForm: boolean;
  setShowCreateForm: (value: boolean) => void;
  onCreateShelf: (event: FormEvent<HTMLFormElement>) => void;
  canManage: boolean;
  onSignIn: () => void;
  embedded?: boolean;
};

function ShelfWorkspace(props: ShelfWorkspaceProps) {
  return (
    <div className="workspace related-contexts" id="related-contexts">
      <header className={`workspace-heading shelf-list-heading${props.embedded ? " embedded" : ""}`}>
        <span>
          {props.embedded ? <h2>状況から探す</h2> : <h1>状況から段取りを探す</h1>}
        </span>
        <button type="button" className="text-action" onClick={() => props.canManage ? props.setShowCreateForm(!props.showCreateForm) : props.onSignIn()}>
          <Plus size={16} />新しい状況
        </button>
      </header>
      {props.showCreateForm && props.canManage ? (
        <form className="shelf-create-form" onSubmit={props.onCreateShelf}>
          <label><span>状況名</span><input disabled={props.createSubmitted} value={props.newShelfTitle} onChange={(event) => props.setNewShelfTitle(event.target.value)} required /></label>
          <label><span>どんな状況か</span><textarea disabled={props.createSubmitted} value={props.newShelfContext} onChange={(event) => props.setNewShelfContext(event.target.value)} required rows={2} /></label>
          <div>{!props.createSubmitted ? <button type="button" className="secondary-action" onClick={() => props.setShowCreateForm(false)}>キャンセル</button> : null}<button type="submit" className="primary-action" disabled={props.busyAction !== null}>{props.createSubmitted ? "作成を再試行" : "作成"}</button></div>
        </form>
      ) : null}
      {props.busyAction === "shelves" ? <ProgressNotice label={`状況を読み込んでいます${props.busySeconds > 1 ? "" : ""}`} /> : null}
      <section className="cue-surface" aria-label="状況一覧">
        {props.shelves.length ? (
          <div className="shelf-list">
            {props.shelves.map((shelf) => (
              <button type="button" className="shelf-row" key={shelf.id} onClick={() => props.onOpenShelf(shelf.id)} disabled={props.busyAction !== null}>
                <span><Library size={18} /><strong>{shelf.title}</strong></span>
                <small>{shelf.context}</small>
                <em>{shelf.item_count}件</em>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state related-empty">
            <Library size={24} />
            <span className="empty-copy"><strong>公開されている状況はありません</strong></span>
          </div>
        )}
      </section>
    </div>
  );
}

type SaveWorkspaceProps = {
  onReloadOriginal: () => void;
  title: string; setTitle: (value: string) => void;
  tasks: TaskDraft[]; setTasks: (tasks: TaskDraft[]) => void;
  taskIds: string[]; onTaskIds: (ids: string[]) => void;
  enrichment: EnrichmentDraft | null; setEnrichment: (value: EnrichmentDraft | null) => void;
  busyAction: string | null; canPrepare: boolean; canSave: boolean; savedTitle: string | null;
  source: "new" | "completed";
  scheduleUnavailable: boolean;
  busySeconds: number;
  onPrepare: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onReset: () => void;
  savedCuebook: Cuebook | null; devUserId: string; ownedShelves: Shelf[]; onPublished: () => void; onLibrary: () => void;
};

function SaveWorkspace(props: SaveWorkspaceProps) {
  const [scheduleEditing, setScheduleEditing] = useState(false);
  const [editorView, setEditorView] = useState<"tasks" | "review">("tasks");
  const savedMatches = props.savedCuebook && JSON.stringify([props.title, props.tasks.map((task) => [task.text, task.default_priority, task.relative_start_day, task.relative_end_day]), props.enrichment]) ===
    JSON.stringify([props.savedCuebook.title, props.savedCuebook.tasks.map((task) => [task.text, task.default_priority ?? null, task.relative_start_day ?? null, task.relative_end_day ?? null]), props.savedCuebook.enrichment]);
  const ungroupedOffsets = props.tasks.flatMap((_, index) => props.enrichment && !props.enrichment.task_groupings.some((group) => group.task_offsets.includes(index)) ? [index] : []);
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
  return (
    <div className="workspace task-edit-workspace">
      <header className="workspace-heading create-heading">
        <h1>再利用用に整える</h1>
        <button type="button" className="text-action" onClick={props.onLibrary}>自分のリスト</button>
      </header>
      {props.savedCuebook?.origin_revision_id ? <a className="text-action source-reference" href={`/?revision_id=${encodeURIComponent(props.savedCuebook.origin_revision_id)}`}>借りた公開リストを見る</a> : null}
      <form className="save-form" onSubmit={(event) => { if (!props.canPrepare || (props.enrichment && !props.canSave) || scheduleEditing) { event.preventDefault(); return; } props.onSave(event); }} autoComplete="off">
        <label className="save-title-field" htmlFor="save-title"><span>タイトル</span><input id="save-title" required maxLength={240} disabled={props.busyAction !== null} value={props.title} onChange={(event) => props.setTitle(event.target.value)} placeholder="リストの名前" /></label>
        <div className="editor-view-tabs" role="tablist" aria-label="編集する内容">
          {(["tasks", "review"] as const).map((view, index) => <button key={view} type="button" role="tab" id={`editor-tab-${view}`} aria-controls={`editor-panel-${view}`} aria-selected={editorView === view} tabIndex={editorView === view ? 0 : -1} disabled={scheduleEditing || props.busyAction !== null} onClick={() => setEditorView(view)} onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? "tasks" : event.key === "End" ? "review" : index === 0 ? "review" : "tasks";
            setEditorView(next);
            document.getElementById(`editor-tab-${next}`)?.focus();
          }}>{view === "tasks" ? `タスク ${props.tasks.length}件` : "再利用情報"}</button>)}
        </div>
        <div id="editor-panel-tasks" role="tabpanel" aria-labelledby="editor-tab-tasks" hidden={editorView !== "tasks"}>
        {props.scheduleUnavailable ? <p className="field-error" role="status">元の最終日が同期されていないため、日程の目安は未設定です。</p> : null}
        <TaskEditor tasks={props.tasks} taskIds={props.taskIds} disabled={props.busyAction !== null} onScheduleEditing={setScheduleEditing} onChange={(next, previousIndices, ids) => {
          props.setTasks(next);
          props.onTaskIds(ids);
          if (!props.enrichment) return;
          const groups = props.enrichment.task_groupings.map((group) => ({ ...group,
            task_offsets: previousIndices.flatMap((previous, index) => previous !== null && group.task_offsets.includes(previous) ? [index] : []),
          })).filter((group) => group.task_offsets.length > 0);
          props.setEnrichment({ ...props.enrichment, task_groupings: groups });
        }} />
        </div>
        <div className="save-actions">
          <button type="button" disabled={!props.canPrepare || scheduleEditing} onClick={() => { setEditorView("review"); props.onPrepare(); }}>{props.busyAction === "enrich" ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}再利用情報を準備</button>
        </div>
        {props.busyAction === "enrich" ? <ProgressNotice label={progressLabel("enrich")} /> : null}
        <div id="editor-panel-review" role="tabpanel" aria-labelledby="editor-tab-review" hidden={editorView !== "review"}>
        {!props.enrichment && props.busyAction !== "enrich" ? <p className="result-facts">再利用情報は未設定</p> : null}
        {props.enrichment ? (
          <section className="review-strip" aria-label="保存前の確認">
            <header><span><strong>再利用情報</strong></span></header>
            <label htmlFor="review-domain"><span>分野</span><input id="review-domain" maxLength={40} disabled={props.busyAction !== null} value={props.enrichment.domain} onChange={(event) => props.setEnrichment({ ...props.enrichment!, domain: event.target.value })} /></label>
            <label htmlFor="review-context"><span>対象となる状況</span><textarea id="review-context" aria-label="対象となる状況" maxLength={1200} disabled={props.busyAction !== null} value={props.enrichment.context_text} onChange={(event) => props.setEnrichment({ ...props.enrichment!, context_text: event.target.value })} rows={3} /></label>
            <div className="group-edit-list" aria-label="項目のまとまり">
              <span className="field-label">項目のまとまり</span>
              {ungroupedOffsets.length ? <div className="ungrouped-tasks"><strong>まとまり未設定</strong>{ungroupedOffsets.map((offset) => <label key={offset}>
                <span>{props.tasks[offset].text}</span><select disabled={props.busyAction !== null} aria-label={`${props.tasks[offset].text}のまとまり`} value="" onChange={(event) => moveGroupingTask(offset, Number(event.target.value))}>
                  <option value="" disabled>選択</option>{props.enrichment!.task_groupings.map((group, index) => <option key={index} value={index}>{group.label}</option>)}
                </select></label>)}</div> : null}
              {props.enrichment.task_groupings.map((group, groupIndex) => (
                <fieldset className="group-edit-card" key={groupIndex} disabled={props.busyAction !== null}>
                  <legend className="sr-only">まとまり {groupIndex + 1}</legend>
                  <input aria-label={`Group label ${groupIndex + 1}`} value={group.label} onChange={(event) => updateGroupingLabel(groupIndex, event.target.value)} />
                  <ol>
                    {group.task_offsets.map((taskOffset) => (
                      <li key={`${taskOffset}-${props.tasks[taskOffset]?.text}`}>
                        <span>{props.tasks[taskOffset]?.text || `項目 ${taskOffset + 1}`}</span>
                        <label>
                          <span className="sr-only">{props.tasks[taskOffset]?.text}のまとまり</span>
                          <select aria-label={`${props.tasks[taskOffset]?.text}のまとまり`} value={groupIndex} onChange={(event) => moveGroupingTask(taskOffset, Number(event.target.value))}>
                            {props.enrichment!.task_groupings.map((candidate, candidateIndex) => <option key={`${candidate.label}-${candidateIndex}`} value={candidateIndex}>{candidate.label}</option>)}
                          </select>
                        </label>
                      </li>
                    ))}
                  </ol>
                </fieldset>
              ))}
            </div>
          </section>
        ) : null}
        </div>
        <div className="save-actions"><button type="submit" disabled={!props.canPrepare || Boolean(props.enrichment && !props.canSave) || scheduleEditing}>{props.busyAction === "save" ? "保存しています" : "自分用に保存"}</button>
          {savedMatches ? <span role="status">保存済み・自分だけ</span> : props.savedCuebook ? <span>未保存の変更</span> : null}
        </div>
      </form>
      {savedMatches && props.savedCuebook ? <PublishCuebook key={`${props.savedCuebook.id}:${props.savedCuebook.updated_at}`} cuebook={props.savedCuebook} devUserId={props.devUserId} shelves={props.ownedShelves} onPublished={props.onPublished} onReloadOriginal={props.onReloadOriginal} /> : null}
      {props.savedCuebook ? <PublicationLinks key={props.savedCuebook.updated_at} id={props.savedCuebook.id} userId={props.devUserId} /> : null}
      {savedMatches && props.savedCuebook ? <ScheduledReuse key={`schedule:${props.savedCuebook.id}:${props.savedCuebook.updated_at}`} source={{ type: "cuebook", id: props.savedCuebook.id, expected_updated_at: props.savedCuebook.updated_at }} title={props.savedCuebook.title} tasks={props.savedCuebook.tasks.map((task) => ({ ...task, relative_start_day: task.relative_start_day ?? null, relative_end_day: task.relative_end_day ?? null }))} devUserId={props.devUserId} /> : null}
    </div>
  );
}


function ProgressNotice({ label }: { label: string }) {
  return <div className="progress-notice" role="status" aria-live="polite"><Loader2 className="spin" size={17} /><span>{label}</span></div>;
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

function progressLabel(action: "search" | "enrich" | "save"): string {
  return action === "search" ? "検索しています" : action === "enrich" ? "確認内容を準備しています" : "公開しています";
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
