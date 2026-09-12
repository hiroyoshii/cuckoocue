"use client";

import { GripHorizontal, Plus, Undo2, Redo2 } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { TaskTextCell, TaskScheduleCell } from "./task-cells";
import { priorityLabel, relativeScheduleLabel, type TaskDraft } from "./task-values";

type Row = { key: string; task: TaskDraft };

export function TaskEditor({ tasks, taskIds, onChange, onScheduleEditing, disabled = false }: {
  tasks: TaskDraft[];
  taskIds?: string[];
  onChange: (tasks: TaskDraft[], previousIndices: Array<number | null>, taskIds: string[]) => void;
  onScheduleEditing?: (editing: boolean) => void;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => tasks.map((task, i) => ({ key: taskIds?.[i] ?? crypto.randomUUID(), task })));
  const current = useRef(rows);
  const past = useRef<Row[][]>([]);
  const future = useRef<Row[][]>([]);
  const [historyAvailable, setHistoryAvailable] = useState({ undo: false, redo: false });
  const textStart = useRef<Row[] | null>(null);
  const [newText, setNewText] = useState("");
  const [scheduleKey, setScheduleKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const drag = useRef<{ key: string; target: string } | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const locked = disabled || scheduleKey !== null;

  function emit(next: Row[]) {
    const before = current.current;
    current.current = next;
    setRows(next);
    setHistoryAvailable({ undo: past.current.length > 0 || textStart.current !== null, redo: future.current.length > 0 });
    onChange(next.map((row) => row.task), next.map((row) => {
      const index = before.findIndex((item) => item.key === row.key);
      return index < 0 ? null : index;
    }), next.map((row) => row.key));
  }
  function finishText() {
    if (textStart.current && JSON.stringify(textStart.current) !== JSON.stringify(current.current)) {
      past.current = [...past.current.slice(-29), textStart.current];
      future.current = [];
    }
    textStart.current = null;
    setRows([...current.current]);
    setHistoryAvailable({ undo: past.current.length > 0, redo: future.current.length > 0 });
  }
  function apply(next: Row[]) {
    finishText();
    past.current = [...past.current.slice(-29), current.current];
    future.current = [];
    emit(next);
  }
  function update(key: string, patch: Partial<TaskDraft>) {
    apply(current.current.map((row) => row.key === key ? { ...row, task: { ...row.task, ...patch } } : row));
  }
  function remove(key: string) {
    if (locked) return;
    const before = current.current;
    const index = before.findIndex((row) => row.key === key);
    if (index < 0) return;
    // Clearing the title and removing its row are a single undoable operation.
    past.current = [...past.current.slice(-29), textStart.current ?? before];
    textStart.current = null;
    future.current = [];
    emit(before.filter((row) => row.key !== key));
    const neighbour = before[index + 1] ?? before[index - 1];
    if (neighbour) focus(neighbour.key);
    else requestAnimationFrame(() => addInput.current?.focus());
    setNotice("タスクを削除しました。取消で戻せます。");
  }
  function focus(key: string, part = "text") {
    requestAnimationFrame(() => document.getElementById(`${key}-${part}`)?.focus());
  }
  function move(key: string, destination: number) {
    const from = current.current.findIndex((row) => row.key === key);
    if (destination < 0 || destination >= current.current.length || from === destination) return;
    const next = [...current.current];
    next.splice(destination, 0, next.splice(from, 1)[0]);
    apply(next);
    focus(key, "grip");
    setNotice(`${from + 1}件目を${destination + 1}件目へ移動しました。`);
  }
  function undo(redo = false) {
    finishText();
    const from = redo ? future : past;
    const to = redo ? past : future;
    const next = from.current.pop();
    if (!next) return;
    to.current.push(current.current);
    emit(next);
    setNotice(redo ? "変更をやり直しました。" : "変更を取り消しました。");
  }
  function add() {
    if (!newText.trim() || locked || rows.length >= 200) return;
    const key = crypto.randomUUID();
    apply([...current.current, { key, task: { text: newText.trim(), default_priority: null, relative_start_day: null, relative_end_day: null } }]);
    setNewText("");
    setNotice("タスクを追加しました。");
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-editor-key]");
    if (element?.dataset.editorKey && current.current.some((row) => row.key === element.dataset.editorKey)) {
      drag.current.target = element.dataset.editorKey;
      setDragTarget(element.dataset.editorKey);
    }
    if (event.clientY < 72) window.scrollBy(0, -24);
    if (event.clientY > window.innerHeight - 72) window.scrollBy(0, 24);
  }

  return <div className="inline-task-editor">
    <div className="editor-toolbar"><h2>タスク <span>{rows.length}</span></h2><div>
      <button type="button" className="icon-button" title="取り消す" aria-label="取り消す" disabled={locked || !historyAvailable.undo} onClick={() => undo()}><Undo2 size={18} /></button>
      <button type="button" className="icon-button" title="やり直す" aria-label="やり直す" disabled={locked || !historyAvailable.redo} onClick={() => undo(true)}><Redo2 size={18} /></button>
    </div></div>
    <div className="task-add-row">
      <input ref={addInput} aria-label="新しい項目" placeholder="新しい項目" maxLength={240} value={newText} disabled={locked || rows.length >= 200} onChange={(event) => setNewText(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(); } }} />
      <button type="button" className="icon-button" title="タスクを追加" aria-label="タスクを追加" disabled={locked || !newText.trim() || rows.length >= 200} onClick={add}><Plus size={20} /></button>
    </div>
    <div className="task-column-labels" aria-hidden="true"><span /><span>タスク</span><span>日程の目安</span><span>優先度</span></div>
    <ol className="editable-tasks">
      {rows.map((row, index) => <li key={row.key} data-editor-key={row.key} className={dragTarget === row.key ? "task-drop-target" : undefined}>
        <div className="editable-task-row">
          <button id={`${row.key}-grip`} type="button" className="icon-button task-grip" title="並べ替え" aria-label={`${index + 1}件目を並べ替え`} aria-keyshortcuts="ArrowUp ArrowDown" disabled={locked}
            onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); move(row.key, index + (event.key === "ArrowUp" ? -1 : 1)); } }}
            onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { key: row.key, target: row.key }; }}
            onPointerMove={pointerMove} onPointerUp={() => { const value = drag.current; drag.current = null; setDragTarget(null); if (value) move(value.key, current.current.findIndex((r) => r.key === value.target)); }}
            onPointerCancel={() => { drag.current = null; setDragTarget(null); }}><GripHorizontal size={18} /></button>
          <TaskTextCell id={`${row.key}-text`} label={`${index + 1}件目のタスク`} value={row.task.text} disabled={locked}
            onDelete={() => remove(row.key)}
            onFocus={() => { textStart.current = current.current; }} onFinish={finishText}
            onCancel={() => { if (textStart.current) emit(textStart.current); textStart.current = null; }}
            onChange={(text) => emit(current.current.map((item) => item.key === row.key ? { ...item, task: { ...item.task, text } } : item))} />
          <div className="task-meta-cells"><button id={`${row.key}-schedule`} type="button" className="task-schedule-cell" aria-label={`${index + 1}件目の日程: ${relativeScheduleLabel(row.task) || "未設定"}`} aria-expanded={scheduleKey === row.key}
            disabled={disabled || (scheduleKey !== null && scheduleKey !== row.key)} onClick={() => { if (scheduleKey) return; setScheduleKey(row.key); onScheduleEditing?.(true); }}>
            <span className="mobile-cell-label">日程</span>{relativeScheduleLabel(row.task) || "未設定"}
          </button>
          <label className={`task-priority-cell priority-${row.task.default_priority ?? "none"}`}><span className="mobile-cell-label">優先度</span>
            <select aria-label={`${index + 1}件目の優先度`} value={row.task.default_priority ?? ""} disabled={locked} onChange={(event) => update(row.key, { default_priority: event.target.value === "" ? null : Number(event.target.value) })}>
              <option value="">未設定</option>{[2, 1, 0].map((value) => <option key={value} value={value}>{priorityLabel(value)}</option>)}
            </select>
          </label></div>
        </div>
        {scheduleKey === row.key ? <TaskScheduleCell task={row.task} disabled={disabled} onApply={(patch) => update(row.key, patch)} onClose={() => { setScheduleKey(null); onScheduleEditing?.(false); focus(row.key, "schedule"); }} /> : null}
      </li>)}
    </ol>
    <span className="sr-only" role="status">{notice}</span>
  </div>;
}
