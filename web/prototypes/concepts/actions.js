function privateGate(next) {
  if (state.authenticated) return next();
  state.afterLogin = next;
  navigate('account');
}
function route(target) {
  if (state.concept === 'a' && window.reuseMock) return window.reuseMock.route(target);
  if (state.busy) return;
  const [screen, id] = target.split('/');
  if (state.screen === 'editor' && state.dirty && screen !== 'editor') {
    if (screen === 'publish') { notify('先に自分用の内容を保存してください'); return; }
    if (!confirm('未保存の変更を破棄して移動しますか？')) return;
    state.draft = structuredClone(state.savedDraft); state.dirty = false;
  }
  if (screen === 'select') { state.selected = id; render(); return; }
  if (screen === 'detail' || screen === 'schedule') { state.selected = revisions.some((item) => item.id === id) ? id : state.selected; if (screen === 'schedule') { state.dateUndo = []; initializeDates(); } }
  if (screen === 'group') state.group = id || state.group;
  if (['private', 'history', 'history-detail', 'editor', 'publish', 'fork', 'group-edit'].includes(screen)) return privateGate(() => navigate(screen));
  if (catalog.screens.some(([key]) => key === screen)) navigate(screen);
}
async function perform(success, failureScreen, failureText = '操作を完了できませんでした') {
  if (state.busy) return;
  state.busy = true;
  const fail = $('#fail-next').checked;
  $('#fail-next').checked = false;
  const controls = [...document.querySelectorAll('#app button, #app input, #app select, #app textarea')];
  const disabled = controls.map((control) => control.disabled);
  controls.forEach((control) => { control.disabled = true; });
  if ($('#operation-status')) $('#operation-status').textContent = '処理中…';
  try {
    await new Promise((resolve) => setTimeout(resolve, 220));
    if (fail) { if (failureScreen) navigate(failureScreen); else { notify(failureText); if ($('#operation-status')) $('#operation-status').textContent = failureText; } }
    else success();
  } finally { state.busy = false; controls.forEach((control, index) => { control.disabled = disabled[index]; }); }
}
function seedOwnGroup() {
  if (!state.ownGroups.length) state.ownGroups.push({ ...structuredClone(shelves[0]), id: 'sample-owned', owner: 'Yuki', title: '猫2匹と暮らす・自分のまとめ' });
  state.group = state.ownGroups[0].id;
  state.joined.add(state.group);
}
function preview(screen) {
  state.dirty = false;
  if (!['start', 'results', 'detail', 'empty', 'search-error', 'account'].includes(screen)) {
    state.authenticated = true;
    state.joined.add('shelf-cats');
  }
  if (screen === 'group-edit' || screen === 'published') seedOwnGroup();
  if (screen === 'synced') state.synced = true;
  if (screen === 'group' || screen === 'fork') state.group = shelves[0].id;
  navigate(screen);
}
const commands = {
  menu: () => { document.body.classList.add('menu-open'); $('.sidebar a').focus(); },
  'close-menu': () => { document.body.classList.remove('menu-open'); $('[data-action="menu"]').focus(); },
  login: () => { state.authenticated = true; const next = state.afterLogin; state.afterLogin = null; if (next) next(); else navigate('private'); },
  'retry-search': () => perform(() => navigate('results'), 'search-error'),
  'from-history': () => { state.draft = { title: completed.title, tasks: structuredClone(completed.tasks) }; state.draftUndo = []; state.dirty = true; state.saved = false; navigate('editor'); },
  'add-task': () => { if (state.concept === 'a') rememberDraft(); state.draft.tasks.push({ title: '', day: 0 }); state.dirty = true; render(); $(`[data-task="${state.draft.tasks.length - 1}"]`).focus(); },
  'undo-draft': () => { if (!state.draftUndo.length) return; state.draft = state.draftUndo.pop(); markDraft(); render(); },
  'discard-draft': () => { if (!state.dirty || !confirm('保存していない変更を破棄しますか？')) return; state.draft = structuredClone(state.savedDraft); state.draftUndo = []; markDraft(); render(); },
  'undo-dates': () => { if (!state.dateUndo.length) return; const previous = state.dateUndo.pop(); state.anchor = previous.anchor; state.dates = previous.dates; render(); },
  'place-revision': () => { const form = $('#group-form'); const data = new FormData(form); const id = data.get('revision'); if (!id) return; preserveGroupForm(); state.groupDraft.revisions.push(id); render(); },
};
function preserveGroupForm() {
  const form = $('#group-form');
  if (!form) return;
  const data = new FormData(form);
  state.groupDraft.title = data.get('title');
  state.groupDraft.context = data.get('context');
}
document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor && !anchor.classList.contains('skip')) { event.preventDefault(); document.body.classList.remove('menu-open'); route(anchor.getAttribute('href').slice(1)); return; }
  const trigger = event.target.closest('[data-action]');
  if (!trigger || state.busy) return;
  const [action, value] = trigger.dataset.action.split(':');
  if (commands[action]) commands[action]();
  if (action === 'join') { const origin = state.screen; privateGate(() => perform(() => {
    if (state.joined.has(value)) state.joined.delete(value); else state.joined.add(value);
    navigate(origin);
  }, null, '参加状態を変更できませんでした')); }
  if (action === 'remove-task') { if (state.concept === 'a') rememberDraft(); state.draft.tasks.splice(Number(value), 1); state.dirty = true; render(); }
  if (action === 'move-task-up' || action === 'move-task-down') {
    const index = Number(value), target = index + (action === 'move-task-up' ? -1 : 1);
    if (target < 0 || target >= state.draft.tasks.length) return;
    rememberDraft();
    [state.draft.tasks[index], state.draft.tasks[target]] = [state.draft.tasks[target], state.draft.tasks[index]];
    markDraft(); render(); $(`[data-task="${target}"]`).focus();
  }
  if (action === 'reset-date') { rememberDates(); state.dates[Number(value)] = addDays(state.anchor, selectedRevision().tasks[Number(value)].day); render(); }
  if (['up', 'down', 'unplace'].includes(action)) {
    preserveGroupForm();
    const index = Number(value); const items = state.groupDraft.revisions;
    if (action === 'unplace') items.splice(index, 1);
    else { const target = index + (action === 'up' ? -1 : 1); if (target >= 0 && target < items.length) [items[index], items[target]] = [items[target], items[index]]; }
    render();
  }
});
document.addEventListener('focusin', (event) => { if (event.target.matches('#draft-title, [data-task], [data-days]')) state.inputCheckpoint = false; });
document.addEventListener('input', (event) => {
  const input = event.target;
  if (state.concept === 'a' && input.matches('#draft-title, [data-task], [data-days]') && !state.inputCheckpoint) { rememberDraft(); state.inputCheckpoint = true; }
  if (input.id === 'draft-title') state.draft.title = input.value;
  if (input.hasAttribute('data-task')) state.draft.tasks[Number(input.dataset.task)].title = input.value;
  if (input.hasAttribute('data-offset')) state.draft.tasks[Number(input.dataset.offset)].day = input.value === '' ? NaN : Number(input.value);
  if (input.hasAttribute('data-days')) { const index = Number(input.dataset.days); state.draft.tasks[index].day = input.value === '' ? NaN : Number(input.value) * ($(`[data-direction="${index}"]`).value === 'before' ? -1 : 1); }
  if (input.matches('#draft-title, [data-task], [data-offset], [data-days]')) { if (state.concept === 'a') markDraft(); else { state.dirty = true; $('.save-state').textContent = '未保存'; } }
});
document.addEventListener('change', (event) => {
  const input = event.target;
  if (input.id === 'concept-select') { state.concept = input.value; render(); }
  if (input.id === 'screen-select') preview(input.value);
  if (input.id === 'anchor' && input.value) {
    if (state.concept === 'a') {
      if (selectedRevision().tasks.some((_, index) => changedDate(index)) && !confirm('基準日を変更して、全タスクを元の目安から再計算しますか？個別に変更した日付も置き換わります。')) { input.value = state.anchor; return; }
      rememberDates();
    }
    state.anchor = input.value; initializeDates(); render(); $('#anchor').focus();
  }
  if (input.hasAttribute('data-date')) { if (state.concept === 'a') rememberDates(); state.dates[Number(input.dataset.date)] = input.value; if (state.concept === 'a') render(); }
  if (input.hasAttribute('data-direction')) {
    const index = Number(input.dataset.direction); rememberDraft();
    const days = Math.abs(state.draft.tasks[index].day) || 1;
    state.draft.tasks[index].day = input.value === 'same' ? 0 : days * (input.value === 'before' ? -1 : 1);
    markDraft(); render(); $(`[data-direction="${index}"]`).focus();
  }
  if (input.id === 'public-target') { $('#new-group-fields').hidden = input.value !== 'new'; $('#new-group-fields input').required = input.value === 'new'; }
});
document.addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.busy) return;
  const form = event.target; const data = new FormData(form);
  if (form.id === 'search-form') { state.query = data.get('query').trim(); perform(() => navigate(/引っ越|猫|住所|外出/.test(state.query) ? 'results' : 'empty'), 'search-error'); }
  if (form.id === 'schedule-form') privateGate(() => perform(() => { state.synced = true; navigate('synced'); }, 'sync-error'));
  if (form.id === 'editor-form') {
    if (!state.draft.title.trim() || !state.draft.tasks.length || state.draft.tasks.some((task) => !task.title.trim() || !Number.isInteger(task.day))) { notify('リスト名・タスク・整数の日数を確認してください'); return; }
    perform(() => { state.saved = true; state.dirty = false; state.savedDraft = structuredClone(state.draft); state.draftUndo = []; render(); $('#operation-status').textContent = '自分用に保存しました（モック）'; }, null, '保存できませんでした。編集内容は保持しています。');
  }
  if (form.id === 'fork-form') perform(() => {
    const shelf = { ...structuredClone(selectedGroup()), id: `mock-fork-${state.ownGroups.length}`, owner: 'Yuki', title: data.get('title').trim(), context: data.get('context') };
    state.ownGroups.push(shelf); state.group = shelf.id; state.joined.add(shelf.id); state.groupDraft = null; navigate('group-edit');
  }, null, 'コピーできませんでした');
  if (form.id === 'group-form') perform(() => { preserveGroupForm(); const index = state.ownGroups.findIndex((item) => item.id === state.group); state.ownGroups[index] = structuredClone(state.groupDraft); navigate('group'); }, null, 'グループの変更を保存できませんでした');
  if (form.id === 'publish-form') {
    if (!state.saved || state.dirty) { notify('先に自分用の内容を保存してください'); return; }
    state.pendingPublication = Object.fromEntries(data);
    perform(() => {
      let shelf = state.ownGroups.find((item) => item.id === data.get('target'));
      if (!shelf) { shelf = { id: `mock-public-${state.ownGroups.length}`, title: data.get('title').trim(), context: data.get('context'), owner: 'Yuki', revisions: [] }; state.ownGroups.push(shelf); }
      state.publication += 1;
      const revision = { id: `mock-published-${revisions.length}`, title: state.draft.title, tasks: structuredClone(state.draft.tasks), author: 'Yuki', version: state.publication };
      revisions.push(revision); shelf.revisions.push(revision.id); state.joined.add(shelf.id); state.group = shelf.id; navigate('published');
    }, 'publish-error');
  }
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.body.classList.contains('menu-open')) commands['close-menu'](); });
state.savedDraft = structuredClone(state.draft);
preview(state.screen);
