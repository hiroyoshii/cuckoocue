// Mock-only editing state; stored domain fields remain task.title and task.day.
state.draftUndo = [];
state.dateUndo = [];
function rememberDraft() { state.draftUndo.push(structuredClone(state.draft)); if (state.draftUndo.length > 30) state.draftUndo.shift(); }
function rememberDates() { state.dateUndo.push({ anchor: state.anchor, dates: [...state.dates] }); }
function markDraft() {
  state.dirty = JSON.stringify(state.draft) !== JSON.stringify(state.savedDraft);
  if ($('.save-state')) $('.save-state').textContent = state.dirty ? '未保存' : '保存済み';
  if ($('[data-action="undo-draft"]')) $('[data-action="undo-draft"]').disabled = !state.draftUndo.length;
}
const shortDate = (value) => value ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '未設定';
const anchorName = () => selectedRevision().id === 'revision-pets-2' ? '出発日' : '引っ越し日';
const changedDate = (index) => state.dates[index] !== addDays(state.anchor, selectedRevision().tasks[index].day);
function revisedSchedule(error) {
  const revision = selectedRevision();
  const dates = state.dates.filter(Boolean).toSorted();
  const changed = revision.tasks.filter((_, index) => changedDate(index)).length;
  return crumbs(`detail/${revision.id}`, 'リストの内容') + pageHead('日程を設定', escapeHtml(revision.title)) + `<form id="schedule-form" class="revised-schedule">
    <div class="schedule-anchor"><label for="anchor">${anchorName()}<span class="meta">基準日</span></label><input type="date" id="anchor" value="${state.anchor}" required><div class="schedule-summary"><strong>${shortDate(dates[0])} ～ ${shortDate(dates.at(-1))}</strong><span>${revision.tasks.length}タスク · 個別変更 ${changed}件</span></div></div>
    <div class="edit-toolbar"><h2>タスクの日程</h2>${tool('undo-dates', '直前の日程変更を取り消す', 'Undo2', !state.dateUndo.length)}</div>
    <div class="schedule-columns"><span>タスク</span><span>期日</span><span class="sr-only">変更を戻す</span></div><ol class="date-edit-list">${revision.tasks.map((task, index) => `<li class="${changedDate(index) ? 'is-changed' : ''}"><div><label for="date-${index}">${escapeHtml(task.title)}</label><p class="date-hint">元の目安：${dayText(task.day)}${changedDate(index) ? '<strong>変更済み</strong>' : ''}</p></div><div class="date-input"><input type="date" id="date-${index}" data-date="${index}" value="${state.dates[index]}" required><span>${shortDate(state.dates[index])}</span></div>${tool(`reset-date:${index}`, `タスク${index + 1}を元の日程に戻す`, 'RotateCcw', !changedDate(index))}</li>`).join('')}</ol>
    ${error ? '<div class="error" role="alert"><strong>同期できませんでした</strong><p>入力した日程は保持しています。</p></div>' : ''}
    <div class="editor-savebar"><small>今回の日程のみ変更 · 公開リストは変更されません</small><button class="button primary-button" type="submit">${error ? 'もう一度同期する' : '日程を確定して同期'}${ico('ArrowRight')}</button></div><p id="operation-status" role="status"></p></form>`;
}
function relativeControl(task, index) {
  const direction = task.day === 0 ? 'same' : task.day < 0 ? 'before' : 'after';
  return `<div class="relative-control"><input type="number" min="0" step="1" value="${Math.abs(task.day)}" data-days="${index}" aria-label="タスク${index + 1}の日数" ${direction === 'same' ? 'disabled' : 'required'}><select data-direction="${index}" aria-label="タスク${index + 1}の基準日との関係"><option value="before" ${direction === 'before' ? 'selected' : ''}>日前</option><option value="same" ${direction === 'same' ? 'selected' : ''}>当日</option><option value="after" ${direction === 'after' ? 'selected' : ''}>日後</option></select></div>`;
}
function revisedEditor() {
  return crumbs('private', '自分のリスト') + pageHead('再利用用リストを編集', '保存先：暮らし · 自分だけ', `<span class="save-state">${state.dirty ? '未保存' : '保存済み'}</span>`) + `<form id="editor-form" class="revised-editor">
    <label class="field">リスト名<input name="title" id="draft-title" value="${escapeHtml(state.draft.title)}" required></label>
    <div class="edit-toolbar"><h2>タスク <span class="meta">${state.draft.tasks.length}件</span></h2>${tool('undo-draft', '直前の編集を取り消す', 'Undo2', !state.draftUndo.length)}</div>
    <div class="draft-columns"><span>順序</span><span>タスク内容</span><span>基準日からの日数</span><span class="sr-only">削除</span></div>
    <div class="draft-edit-list">${state.draft.tasks.map((task, index) => `<div class="draft-edit-row"><div class="reorder-controls">${tool(`move-task-up:${index}`, `タスク${index + 1}を上へ`, 'ArrowUp', index === 0)}${tool(`move-task-down:${index}`, `タスク${index + 1}を下へ`, 'ArrowDown', index === state.draft.tasks.length - 1)}</div><textarea rows="1" data-task="${index}" aria-label="タスク${index + 1}の内容" required>${escapeHtml(task.title)}</textarea>${relativeControl(task, index)}${tool(`remove-task:${index}`, `タスク${index + 1}を削除`, 'Trash2')}</div>`).join('')}</div>
    ${command('add-task', 'タスクを追加', 'Plus', 'plain')}
    <div class="editor-savebar"><small>公開済みの内容は変更されません</small><div>${command('discard-draft', '変更を破棄', '', 'plain')}<button class="button primary-button" type="submit">自分用に保存</button></div></div><p id="operation-status" role="status"></p>
    </form><div class="publish-next"><span>グループに公開</span>${link('publish', '公開内容を確認', 'ArrowRight')}</div>`;
}
