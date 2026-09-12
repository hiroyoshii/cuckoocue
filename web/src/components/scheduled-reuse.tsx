"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { cueAccountId, cueApiFetch } from "@/lib/api-client";
import type { ScheduledReuseInput } from "@/lib/scheduled-run";
import { generateTaskDates, isoDaySchema, taskDateFieldsSchema, taskDatesSchema, scheduledReuseSchema, timeZoneSchema, type ScheduleTask } from "@/lib/schedule-dates";
import { buildAndroidRunUri } from "@/lib/run-transfer";
import { firebaseAuth, hasFirebaseClientConfig } from "@/lib/firebase-client";

type Props = {
  source: ScheduledReuseInput["source"]; title: string; tasks: ScheduleTask[]; devUserId: string;
  onSignIn?: () => void; onSaved?: (input: ScheduledReuseInput, runId: string) => void;
};
const draftSchema = z.object({
  day: z.string(), changes: z.record(z.string(), taskDateFieldsSchema), proposedDay: z.string().nullable(),
  pending: scheduledReuseSchema.nullable(), runId: z.string().nullable(), zone: timeZoneSchema,
});
type Draft = z.infer<typeof draftSchema>;
const resumeKey = "cuckoo-cue:public-schedule-login:v1";
const resumeSchema = z.object({
  id: z.string().min(1).max(128), title: z.string(), draft: draftSchema, owner: z.string().optional(),
  tasks: z.array(z.object({ id: z.string(), text: z.string(), relative_start_day: z.number().int().nullable(), relative_end_day: z.number().int().nullable() })),
});

export function ScheduleLoginRecovery({ owner, registered, onSignIn }: { owner: string; registered: boolean; onSignIn: () => void }) {
  const [resume, setResume] = useState<z.infer<typeof resumeSchema> | null>(null);
  useEffect(() => {
    if (!registered) return;
    const frame = requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem(resumeKey);
        if (!raw) return;
        const value = resumeSchema.parse(JSON.parse(raw));
        if (value.owner && value.owner !== owner) return;
        if (!value.owner) sessionStorage.setItem(`cuckoo-cue:scheduled:${owner}:revision:${value.id}:`, JSON.stringify(value.draft));
        sessionStorage.setItem(resumeKey, JSON.stringify({ ...value, owner }));
        setResume(value);
      } catch { try { sessionStorage.removeItem(resumeKey); } catch { /* Storage can be unavailable. */ } }
    });
    return () => cancelAnimationFrame(frame);
  }, [owner, registered]);
  return resume ? <ScheduleDialog source={{ type: "revision", id: resume.id }} title={resume.title} tasks={resume.tasks} devUserId={owner} onSignIn={onSignIn} onClose={() => { try { sessionStorage.removeItem(resumeKey); } catch { /* Closing must still work without storage. */ } setResume(null); }} /> : null;
}

export function ScheduledReuse(props: Props) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="secondary-action post-save-action" onClick={() => setOpen(true)}>日程を決めて使う</button>
    {open ? <ScheduleDialog {...props} onClose={() => setOpen(false)} /> : null}</>;
}

export function ScheduleDialog(props: Props & { onClose: () => void }) {
  const key = `cuckoo-cue:scheduled:${cueAccountId(props.devUserId)}:${props.source.type}:${props.source.id}:${props.source.type === "cuebook" ? props.source.expected_updated_at : ""}`;
  return <ScheduleDialogContent key={key} {...props} storageKey={key} />;
}

function ScheduleDialogContent({ source, title, tasks, devUserId, onSignIn, onSaved, onClose, storageKey }: Props & { onClose: () => void; storageKey: string }) {
  const empty = (): Draft => ({ day: "", changes: {}, proposedDay: null, pending: null, runId: null, zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [pastConfirmed, setPastConfirmed] = useState(false);
  const [restored, setRestored] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitLock = useRef(false);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const value = draftSchema.parse(JSON.parse(raw));
          setDraft(value);
        }
      } catch { setStorageWarning(true); }
      setRestored(true);
    });
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [storageKey]);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); }
    catch { const frame = requestAnimationFrame(() => setStorageWarning(true)); return () => cancelAnimationFrame(frame); }
  }, [draft, restored, storageKey]);

  const validDay = isoDaySchema.safeParse(draft.day).success;
  const generated = validDay ? generateTaskDates(tasks, draft.day) : [];
  const dates = draft.pending?.task_dates ?? generated.map((task) => draft.changes[task.task_id] ?? task);
  const today = Temporal.Now.plainDateISO(draft.zone).toString();
  const past = validDay && (draft.day < today || dates.some((task) => [task.available_from_day, task.due_day].some((day) => day !== null && day < today)));
  const locked = busy || Boolean(draft.pending) || !restored;
  const valid = validDay && dates.length === tasks.length && dates.length > 0 && dates.every((task) => taskDatesSchema.safeParse(task).success);
  function updateDate(index: number, field: "available_from_day" | "due_day", value: string) {
    setPastConfirmed(false);
    setDraft((current) => ({ ...current, changes: { ...current.changes, [dates[index].task_id]: { ...dates[index], [field]: value || null } } }));
  }
  function setDay(day: string) {
    setPastConfirmed(false);
    if (Object.keys(draft.changes).length) setDraft((current) => ({ ...current, proposedDay: day }));
    else setDraft((current) => ({ ...current, day }));
  }
  async function save() {
    if (submitLock.current || !valid || draft.proposedDay !== null || (past && !pastConfirmed && !draft.pending)) return;
    submitLock.current = true;
    const input: ScheduledReuseInput = draft.pending ?? { operation_id: crypto.randomUUID(), source, target_anchor_day: draft.day, time_zone: draft.zone, task_dates: dates };
    const pendingDraft = { ...draft, pending: input };
    remember(pendingDraft); setBusy(true); setError(null);
    try {
      const response = await cueApiFetch("/api/reuse", devUserId, { method: "POST", body: JSON.stringify(input) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 400) remember({ ...pendingDraft, pending: null });
        setNeedsAuth(response.status === 401 || response.status === 403);
        throw new Error(body.error || "保存できませんでした。");
      }
      remember({ ...pendingDraft, runId: body.runId });
      onSaved?.(input, body.runId);
      if (/Android/i.test(navigator.userAgent)) window.location.assign(buildAndroidRunUri(body.runId));
    } catch (e) { setError(e instanceof Error ? e.message : "保存できませんでした。"); }
    finally { setBusy(false); submitLock.current = false; }
  }
  function remember(value: Draft) {
    setDraft(value);
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { setStorageWarning(true); }
  }
  function signIn() {
    // Only the explicitly selected public content crosses an anonymous login.
    if (source.type === "revision" && hasFirebaseClientConfig() && firebaseAuth().currentUser?.isAnonymous) {
      try {
        sessionStorage.setItem(resumeKey, JSON.stringify({ id: source.id, title, tasks, draft: { ...draft, pending: null } }));
      } catch { setError("日程を保持できません。ログイン後にもう一度日程を選んでください。"); return; }
      onClose();
    }
    onSignIn?.();
  }
  return <dialog ref={dialog} className="run-schedule-dialog" aria-labelledby="schedule-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><h2 id="schedule-title">最終日を選ぶ</h2><p>{title}</p></div><button type="button" className="icon-button" aria-label="閉じる" title="閉じる" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="run-schedule-body">
        {storageWarning ? <p role="alert">このブラウザでは日程の一時保存を使えません。再読込せずに保存してください。</p> : null}
        {draft.runId ? <><p role="status">日程付きのリストを保存しました。</p><a className="text-action" href={`/import?run_id=${encodeURIComponent(draft.runId)}`}>保存したリストを見る</a></> : null}
        <div className="run-anchor-field"><label htmlFor="target-anchor-day">最終日<input id="target-anchor-day" type="date" value={draft.proposedDay ?? draft.day} disabled={locked || Boolean(draft.runId)} onChange={(event) => setDay(event.target.value)} /></label><span>{draft.zone}</span></div>
        {draft.proposedDay !== null ? <section className="schedule-recalculation" aria-label="最終日変更の確認"><h3>個別に修正した{Object.keys(draft.changes).length}件の日程</h3><p>{draft.day} → {draft.proposedDay || "未設定"}</p>
          <button type="button" className="secondary-action" disabled={!isoDaySchema.safeParse(draft.proposedDay).success} onClick={() => setDraft((current) => ({ ...current, day: current.proposedDay!, proposedDay: null }))}>個別の変更を残す</button>
          <button type="button" className="secondary-action" disabled={!isoDaySchema.safeParse(draft.proposedDay).success} onClick={() => setDraft((current) => ({ ...current, day: current.proposedDay!, proposedDay: null, changes: {} }))}>すべて再計算</button>
          <button type="button" className="text-action" onClick={() => setDraft((current) => ({ ...current, proposedDay: null }))}>変更を取り消す</button>
        </section> : null}
        {validDay ? <fieldset className="run-date-rows" disabled={locked || draft.proposedDay !== null || Boolean(draft.runId)}><legend>今回の日程 · {tasks.length}タスク</legend>
          {tasks.map((task, index) => {
            const value = dates[index];
            if (!value) return null;
            const invalid = !taskDatesSchema.safeParse(value).success;
            return <div className="run-date-row" key={task.id}>
              <div className="run-date-task"><strong>{task.text}</strong>{draft.changes[task.id] ? <small>個別に修正</small> : null}</div>
              <label>開始<input type="date" aria-label={`${index + 1}件目の開始日`} aria-invalid={invalid} aria-describedby={invalid ? `date-error-${index}` : undefined} value={value.available_from_day ?? ""} onChange={(event) => updateDate(index, "available_from_day", event.target.value)} /></label>
              <label>期限<input type="date" aria-label={`${index + 1}件目の期限`} aria-invalid={invalid} aria-describedby={invalid ? `date-error-${index}` : undefined} value={value.due_day ?? ""} onChange={(event) => updateDate(index, "due_day", event.target.value)} /></label>
              <button type="button" className="icon-button" aria-label={`${index + 1}件目の日程を自動生成に戻す`} title="自動生成に戻す" disabled={locked || !draft.changes[task.id]} onClick={() => { setPastConfirmed(false); setDraft((current) => { const changes = { ...current.changes }; delete changes[task.id]; return { ...current, changes }; }); }}><RotateCcw size={18} /></button>
              {invalid ? <p className="field-error" id={`date-error-${index}`} role="alert">開始日は期限以前の日付にしてください。</p> : null}
            </div>;
          })}
        </fieldset> : null}
        {past && !draft.runId && !draft.pending ? <label className="past-schedule-confirm"><input type="checkbox" checked={pastConfirmed} onChange={(event) => setPastConfirmed(event.target.checked)} />過去の日付を含む日程で保存する</label> : null}
        {error ? <p role="alert" className="field-error">{error}</p> : null}
      </div>
      <footer>{draft.runId ? <button type="button" className="secondary-action" onClick={() => { setDraft(empty()); setPastConfirmed(false); setError(null); }}>別の日程で使う</button> : needsAuth && onSignIn ? <button type="button" className="primary-action" onClick={signIn}>Googleでログイン</button> : <button type="submit" className="primary-action" disabled={busy || !restored || !valid || draft.proposedDay !== null || (past && !pastConfirmed && !draft.pending)}>{busy ? "保存しています" : draft.pending ? "保存を再試行" : "この日程で保存"}</button>}</footer>
    </form>
  </dialog>;
}
