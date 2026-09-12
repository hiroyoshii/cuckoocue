"use client";

import { Check, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { RelativeDayField } from "./relative-day-field";
import { relativeScheduleLabel, taskErrors, type TaskDraft } from "./task-values";

export function TaskTextCell({ id, label, value, disabled, onChange, onFocus, onFinish, onCancel, onDelete }: {
  id: string; label: string; value: string; disabled: boolean;
  onChange: (text: string) => void; onFocus: () => void; onFinish: () => void; onCancel: () => void;
  onDelete: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    // Software keyboards can emit beforeinput without a Backspace keydown.
    const beforeInput = (event: InputEvent) => {
      if (!disabled && !composing.current && !event.isComposing && event.cancelable && element.value === "" &&
        (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward")) {
        event.preventDefault();
        onDelete();
      }
    };
    element.addEventListener("beforeinput", beforeInput);
    return () => element.removeEventListener("beforeinput", beforeInput);
  }, [disabled, onDelete]);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    const resize = () => { element.style.height = "0px"; element.style.height = `${element.scrollHeight + 2}px`; };
    resize();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => { if (width !== element.clientWidth) { width = element.clientWidth; resize(); } });
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);
  const error = !value.trim() ? "タスクの内容を入力してください。" : null;
  return <div className="task-text-cell"><textarea ref={input} id={id} aria-label={label} rows={1} maxLength={240} required
    value={value} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
    onFocus={onFocus} onBlur={onFinish} onChange={(event) => onChange(event.target.value)}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onKeyDown={(event) => {
      if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      if ((event.key === "Backspace" || event.key === "Delete") && event.currentTarget.value === "") {
        event.preventDefault();
        if (!event.repeat) onDelete();
        return;
      }
      if (event.key === "Escape") { event.preventDefault(); onCancel(); event.currentTarget.blur(); }
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); }
    }} />{error ? <p className="field-error" id={`${id}-error`}>{error}</p> : null}</div>;
}

export function TaskScheduleCell({ task, disabled, onApply, onClose }: {
  task: TaskDraft; disabled: boolean; onApply: (patch: Partial<TaskDraft>) => void; onClose: () => void;
}) {
  const [start, setStart] = useState(task.relative_start_day);
  const [end, setEnd] = useState(task.relative_end_day);
  const id = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  useLayoutEffect(() => { root.current?.querySelector("input")?.focus(); }, []);
  const draft = { ...task, relative_start_day: start, relative_end_day: end };
  const error = taskErrors(draft).schedule;
  const apply = () => { if (error || disabled) return; onApply({ relative_start_day: start, relative_end_day: end }); onClose(); };
  return <fieldset ref={root} className="task-schedule-editor" disabled={disabled} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); apply(); }
  }}>
    <legend className="sr-only">日程の目安を編集</legend>
    <div className="schedule-editor-heading"><strong>日程の目安</strong><button type="button" className="icon-button" aria-label="日程の編集をやめる" title="キャンセル" onClick={onClose}><X size={18} /></button></div>
    <div className="task-schedule-fields">
      <RelativeDayField label="開始（最終日から）" value={start} onChange={setStart} invalid={!!error} describedBy={error ? id : undefined} />
      <RelativeDayField label="期限（最終日から）" value={end} onChange={setEnd} invalid={!!error} describedBy={error ? id : undefined} />
    </div>
    {error ? <p id={id} className="field-error" role="alert">{error}</p> : <p className="schedule-preview" aria-live="polite">{relativeScheduleLabel(draft) || "日程なし"}</p>}
    <div className="schedule-editor-actions"><button type="button" className="text-action" onClick={() => { setStart(null); setEnd(null); }}>日程をクリア</button>
      <button type="button" className="secondary-action" disabled={!!error} onClick={apply}><Check size={16} />適用</button></div>
  </fieldset>;
}
