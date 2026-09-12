// Adopted A only. Existing domain objects are simulated in memory, never persisted to a backend.
(() => {
  let serial = 0;
  const id = (kind) => `mock-${kind}-${++serial}`;
  const copy = (value) => structuredClone(value);
  const normalize = (tasks) => tasks.map((task) => ({ ...copy(task), id: id('task'), startDay: task.startDay ?? null, priority: task.priority ?? null }));
  const original = { id: id('cuebook'), title: completed.title, originRevisionId: null, tasks: normalize(completed.tasks) };
  const flow = { library: [original], runs: [], histories: [], prep: null, lastRunId: null, historyId: 'mock-history', detailFrom: 'results', editorFrom: 'private', handoffId: null, expanded: new Set(), undo: [] };
  const dateAt = (anchor, day) => anchor && day != null ? addDays(anchor, day) : '';
  const dayOffset = (date, anchor) => date ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86400000) : null;
  const priorityName = (value) => value == null ? '自動' : ['強', '中', '弱'][value];
  const relative = (day) => day == null ? '未設定' : day === 0 ? '最終日' : `最終日の${Math.abs(day)}日${day < 0 ? '前' : '後'}`;
  const dateLabel = (date) => date ? shortDate(date) : '未設定';
  const currentRun = () => flow.runs.find((run) => run.id === flow.lastRunId);
  const currentHistory = () => flow.histories.find((run) => run.id === flow.historyId) || flow.histories[0];
  const action = (name, label, icon = '', style = '') => `<button type="button" class="button ${style}" data-flow="${name}">${icon ? ico(icon) : ''}${label}</button>`;
  const iconAction = (name, label, icon, disabled = false) => `<button type="button" class="tool" data-flow="${name}" title="${label}" aria-label="${label}" ${disabled ? 'disabled' : ''}>${ico(icon)}</button>`;
  const priorityInput = (value, attributes) => `<select ${attributes}>${[['', '自動'], ['0', '強'], ['1', '中'], ['2', '弱']].map(([v, label]) => `<option value="${v}" ${String(value ?? '') === v ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
  const showError = (message) => { const area = $('#flow-error'); if (area) { area.textContent = message; area.hidden = false; area.focus(); } else notify(message); };
  const errorSlot = () => '<p id="flow-error" class="error" role="alert" tabindex="-1" hidden></p>';

  flow.histories.push({ id: 'mock-history', title: completed.title, anchor: completed.anchor, completedDay: completed.completed,
    tasks: normalize(completed.tasks).map((task) => ({ ...task, date: dateAt(completed.anchor, task.day), startDate: dateAt(completed.anchor, task.startDay) })) });

  function loadOriginal(item, from = 'private') {
    state.draft = copy(item); state.savedDraft = copy(item); state.saved = Boolean(item.id); state.dirty = false;
    state.draftUndo = []; flow.editorFrom = from;
  }
  loadOriginal(original);

  function begin(source, kind = 'revision') {
    if (flow.prep?.sourceId === source.id && !flow.prep.savedId) return;
    const snapshot = { ...copy(source), tasks: source.tasks.map((task) => ({ ...copy(task), id: task.id ?? id('source-task'), startDay: task.startDay ?? null, priority: task.priority ?? null })) };
    flow.prep = { sourceId: source.id, kind, source: snapshot, title: source.title, anchor: '', savedId: null,
      tasks: normalize(snapshot.tasks).map((task,index) => ({ ...task, sourceTaskId: snapshot.tasks[index].id, included: true, date: '', startDate: '' })) };
    flow.expanded.clear(); flow.undo = [];
  }
  function ensurePrep() { if (!flow.prep) begin(selectedRevision()); return flow.prep; }
  function rememberPrep() { flow.undo.push(copy(flow.prep)); if (flow.undo.length > 30) flow.undo.shift(); }
  function applyAnchor(next, keep) {
    const prep = ensurePrep(); rememberPrep();
    prep.tasks.forEach((task) => {
      if (!keep || task.date === dateAt(prep.anchor, task.day)) task.date = dateAt(next, task.day);
      if (!keep || task.startDate === dateAt(prep.anchor, task.startDay)) task.startDate = dateAt(next, task.startDay);
    });
    prep.anchor = next; render();
  }
  function autoDatesChanged() {
    const prep = ensurePrep();
    return prep.tasks.some((task) => task.date !== dateAt(prep.anchor, task.day) || task.startDate !== dateAt(prep.anchor, task.startDay));
  }
  function saveRun() {
    const prep = ensurePrep();
    if (prep.savedId) { flow.lastRunId = prep.savedId; navigate('synced'); return; }
    let cuebook = prep.kind === 'private' ? flow.library.find((item) => item.id === prep.sourceId) : null;
    if (!cuebook) {
      cuebook = { id: id('cuebook'), title: prep.source.title, originRevisionId: prep.source.id, tasks: normalize(prep.source.tasks) };
      flow.library.push(cuebook);
    }
    const sourceIds = new Map(prep.source.tasks.map((task, index) => [task.id ?? prep.tasks[index]?.sourceTaskId, cuebook.tasks[index]?.id]));
    const run = { id: id('run'), sourceCuebookId: cuebook.id, title: prep.title.trim(), anchor: prep.anchor, received: false,
      tasks: prep.tasks.filter((task) => task.included).map((task) => ({ ...copy(task), id: id('run-task'), sourceTaskId: sourceIds.get(task.sourceTaskId) ?? null })) };
    flow.runs.push(run); flow.lastRunId = run.id; prep.savedId = run.id;
    navigate('synced');
  }
  function validPrep() {
    const prep = ensurePrep(), tasks = prep.tasks.filter((task) => task.included);
    if (!prep.title.trim() || !prep.anchor || !tasks.length) return 'リスト名・最終日・使うタスクを確認してください。';
    if (tasks.some((task) => !task.title.trim())) return 'タスクの内容を入力してください。';
    if (tasks.some((task) => task.startDate && task.date && task.startDate > task.date)) return '開始日が期限より後のタスクがあります。日程を確認してください。';
    return null;
  }
  function saveOriginal() {
    $('#toast').textContent = '';
    const index = flow.library.findIndex((item) => item.id === state.draft.id);
    if (!state.draft.id) state.draft.id = id('cuebook');
    if (index < 0) flow.library.push(copy(state.draft)); else flow.library[index] = copy(state.draft);
    state.saved = true; state.dirty = false; state.savedDraft = copy(state.draft); state.draftUndo = [];
    render(); $('#operation-status').textContent = '保存しました';
  }
  function validOriginal() {
    if (!state.draft.title.trim() || !state.draft.tasks.length || state.draft.tasks.some((task) => !task.title.trim())) return 'リスト名とタスクの内容を入力してください。';
    if (state.draft.tasks.some((task) => [task.day, task.startDay].some((value) => value != null && !Number.isInteger(value)))) return '日数は整数で入力してください。';
    if (state.draft.tasks.some((task) => task.startDay != null && task.day != null && task.startDay > task.day)) return '開始の目安が期限より後のタスクがあります。';
    return null;
  }
  function updateOriginalHints() {
    markDraft();
    const undo = $('[data-flow="undo-original"]');
    if (undo) undo.disabled = !state.draftUndo.length;
    document.querySelectorAll('.flow-offset-details summary').forEach((summary,index) => {
      summary.firstChild.textContent = relative(state.draft.tasks[index].day);
      summary.querySelector('span').textContent = `優先度 ${priorityName(state.draft.tasks[index].priority)}`;
    });
  }
  function taskDetails(tasks, absolute = false) {
    return `<ol class="flow-read-list">${tasks.map((task, index) => `<li><span class="flow-number">${index + 1}</span><div><p>${escapeHtml(task.title)}</p><p class="meta">${absolute ? `開始 ${dateLabel(task.startDate)} / 期限 ${dateLabel(task.date)}` : `開始 ${relative(task.startDay)} / 期限 ${relative(task.day)}`}<span class="flow-priority">優先度 ${priorityName(task.priority)}</span></p></div></li>`).join('')}</ol>`;
  }
  function scheduleView(failed = false) {
    const prep = ensurePrep(), included = prep.tasks.filter((task) => task.included);
    return crumbs(prep.kind === 'private' ? 'private' : `detail/${prep.sourceId}`, prep.kind === 'private' ? '自分のリスト' : '公開リスト') + pageHead('今回使う内容', escapeHtml(prep.source.title)) + `
      <form id="flow-schedule-form">
        <div class="flow-anchor"><label class="field" for="flow-anchor">最終日<input type="date" id="flow-anchor" value="${prep.anchor}" required></label><div><strong>${prep.anchor ? `${included.length}タスクの日程` : '日程未設定'}</strong><p class="meta">${prep.anchor ? `${dateLabel(included.map((task) => task.date).filter(Boolean).sort()[0])} 〜 ${dateLabel(included.map((task) => task.date).filter(Boolean).sort().at(-1))}` : `${included.length}タスク`}</p></div></div>
        <label class="field flow-run-name">今回のリスト名<input id="flow-run-title" value="${escapeHtml(prep.title)}" required></label>
        <div class="edit-toolbar"><h2>使うタスク <span class="meta">${included.length} / ${prep.tasks.length}</span></h2>${iconAction('undo-prep', '今回の変更を取り消す', 'Undo2', !flow.undo.length)}</div>
        <ol class="flow-plan-list">${prep.tasks.map((task, index) => `<li class="${task.included ? '' : 'is-excluded'}"><div class="flow-plan-row"><label class="flow-adopt"><input type="checkbox" data-include="${index}" ${task.included ? 'checked' : ''}><span>${escapeHtml(task.title)}</span></label><span class="flow-date-label">${prep.anchor ? dateLabel(task.date) : relative(task.day)}</span>${iconAction(`expand:${index}`, `タスク${index + 1}の内容・日程を編集`, 'Pencil')}</div>
        ${flow.expanded.has(task.id) ? `<div class="flow-task-fields"><label class="field flow-wide">今回の内容<textarea data-prep-title="${index}" rows="2">${escapeHtml(task.title)}</textarea></label><label class="field">開始日<input type="date" data-prep-date="${index}:startDate" value="${task.startDate}" ${!prep.anchor ? 'disabled' : ''}></label><label class="field">期限<input type="date" data-prep-date="${index}:date" value="${task.date}" ${!prep.anchor ? 'disabled' : ''}></label><label class="field">優先度${priorityInput(task.priority, `data-prep-priority="${index}"`)}</label><div class="flow-row-actions">${iconAction(`prep-up:${index}`, `タスク${index + 1}を上へ`, 'ArrowUp', index === 0)}${iconAction(`prep-down:${index}`, `タスク${index + 1}を下へ`, 'ArrowDown', index === prep.tasks.length - 1)}${action(`reset:${index}`, '元の日程', 'RotateCcw', 'plain')}</div></div>` : ''}</li>`).join('')}</ol>
        ${failed ? '<div class="error" role="alert"><strong>リストを保存できませんでした</strong><p>入力した内容は残っています。</p></div>' : ''}${errorSlot()}
        <div class="editor-savebar"><small>今回だけの変更</small><button class="button primary-button" type="submit">${failed ? 'もう一度保存' : 'この内容で保存'}${ico('ArrowRight')}</button></div><p id="operation-status" role="status"></p>
      </form>`;
  }
  function offsetInput(task, index, key, label) {
    const value = task[key], mode = value == null ? 'none' : value === 0 ? 'same' : value < 0 ? 'before' : 'after';
    return `<label class="field">${label}<span class="flow-offset"><input type="number" min="0" step="1" value="${value == null ? '' : Math.abs(value)}" data-relative-number="${index}:${key}" aria-label="タスク${index + 1}の${label}の日数" ${mode === 'none' || mode === 'same' ? 'disabled' : 'required'}><select data-relative-mode="${index}:${key}" aria-label="タスク${index + 1}の${label}と最終日の関係">${[['none','未設定'],['before','日前'],['same','最終日'],['after','日後']].map(([v,t]) => `<option value="${v}" ${v === mode ? 'selected' : ''}>${t}</option>`).join('')}</select></span></label>`;
  }
  function editorView() {
    return crumbs(flow.editorFrom, flow.editorFrom.startsWith('history') ? '完了内容' : '自分のリスト') + pageHead('再利用用リストを編集', '自分のリスト', `<span class="save-state">${state.dirty || !state.saved ? '未保存' : '保存済み'}</span>`) + `
      <form id="flow-editor-form"><label class="field">リスト名<input data-original-title value="${escapeHtml(state.draft.title)}" required></label>
      <div class="edit-toolbar"><h2>タスク <span class="meta">${state.draft.tasks.length}件</span></h2>${iconAction('undo-original', '原本の編集を取り消す', 'Undo2', !state.draftUndo.length)}</div>
      <ol class="flow-original-list">${state.draft.tasks.map((task, index) => `<li><div class="flow-original-row"><span class="flow-number">${index + 1}</span><label class="sr-only" for="original-${index}">タスク${index + 1}の内容</label><textarea id="original-${index}" data-original-task="${index}" rows="1" required>${escapeHtml(task.title)}</textarea>${iconAction(`remove-original:${index}`, `タスク${index + 1}を除外`, 'Trash2')}</div>
      <details class="flow-offset-details"><summary>${relative(task.day)}<span>優先度 ${priorityName(task.priority)}</span>${ico('ChevronDown')}</summary><div class="flow-task-fields">${offsetInput(task,index,'startDay','開始の目安')}${offsetInput(task,index,'day','期限の目安')}<label class="field">優先度${priorityInput(task.priority, `data-original-priority="${index}"`)}</label><div class="flow-row-actions">${iconAction(`original-up:${index}`, `タスク${index + 1}を上へ`, 'ArrowUp',index === 0)}${iconAction(`original-down:${index}`, `タスク${index + 1}を下へ`, 'ArrowDown',index === state.draft.tasks.length - 1)}</div></div></details></li>`).join('')}</ol>
      ${action('add-original', 'タスクを追加', 'Plus', 'plain')}${errorSlot()}
      <div class="editor-savebar"><small>完了履歴・公開済みの内容は変更されません</small><div>${action('discard-original','変更を破棄','','plain')}<button type="submit" class="button primary-button">自分用に保存</button></div></div><p id="operation-status" role="status"></p></form>
      <div class="flow-next">${action('use-saved-original','このリストを使う','ArrowRight')}${link('publish','公開内容を確認','','plain')}</div>`;
  }
  function privateView() {
    return pageHead('自分のリスト', '', link('history','完了履歴から追加','History','plain')) + `<div class="section-label"><span>自分だけ</span><span>${flow.library.length}件</span></div>` + flow.library.map((item) => `<article class="flow-library-item"><h2>${link(`edit-private/${item.id}`,escapeHtml(item.title),'','plain')}</h2><p class="meta">${item.tasks.length}タスク${item.originRevisionId ? ' · 公開リストから保存' : ''}</p><ol class="flow-preview">${item.tasks.slice(0,3).map((task) => `<li>${escapeHtml(task.title)}</li>`).join('')}</ol><div class="item-footer">${link(`edit-private/${item.id}`,'編集','Pencil','plain')}${link(`publish-private/${item.id}`,'公開内容を確認','','plain')}${link(`use-private/${item.id}`,'使う','ArrowRight','primary-button')}</div></article>`).join('') + (state.ownGroups.length ? `<h2 class="section-title">自分の公開グループ</h2>${state.ownGroups.map((shelf) => link(`group/${shelf.id}`,escapeHtml(shelf.title),'Library','plain')).join('')}` : '');
  }
  function historyView(detail = false) {
    const run = currentHistory();
    if (detail) return crumbs('history','完了履歴') + pageHead(escapeHtml(run.title)) + `<dl class="flow-facts"><div><dt>予定の最終日</dt><dd>${run.anchor}</dd></div><div><dt>完了した日</dt><dd>${run.completedDay}</dd></div><div><dt>完了タスク</dt><dd>${run.tasks.length}件</dd></div></dl>${taskDetails(run.tasks,true)}<div class="action-row">${action('history-original','再利用用リストを作る','ArrowRight','primary-button')}</div>`;
    return pageHead('完了履歴') + flow.histories.map((item) => `<article class="history-item"><p class="date-label">${item.completedDay} 完了</p><h2>${link(`history-detail/${item.id}`,escapeHtml(item.title),'','plain')}</h2><p class="meta">最終日 ${item.anchor} · ${item.tasks.length}件完了</p><div class="item-footer">${link(`history-detail/${item.id}`,'完了内容を見る','ArrowRight')}</div></article>`).join('');
  }
  function savedView() {
    const run = currentRun();
    if (!run) return pageHead('保存したリスト') + '<p>まだ保存したリストはありません。</p>' + link('results','探す','Search');
    return pageHead('リストを保存しました') + `<section class="flow-saved"><h2>${escapeHtml(run.title)}</h2><dl class="flow-facts"><div><dt>最終日</dt><dd>${run.anchor}</dd></div><div><dt>使うタスク</dt><dd>${run.tasks.length}件</dd></div><div><dt>Android</dt><dd>${run.received ? '受信済み' : '未受信'}</dd></div></dl>${flow.handoffError ? '<div class="error" role="alert">Androidを開けませんでした。保存したリストは残っています。</div>' : ''}<div class="action-row">${link('private','自分のリスト','','plain')}${action('open-android','Androidで開く','ArrowUpRight','primary-button')}</div><details class="flow-saved-details"><summary>保存した内容 ${ico('ChevronDown')}</summary>${taskDetails(run.tasks,true)}</details></section>`;
  }
  function publishView(failed = false) {
    const originalView = baseViews.publish(failed);
    // Reuse the public destination form; replace only the snapshot preview.
    return originalView.replace(listTasks(state.draft.tasks), taskDetails(state.draft.tasks));
  }
  function detailView() {
    const revision = selectedRevision();
    return crumbs(flow.detailFrom,flow.detailFrom.startsWith('group') ? 'グループ' : '検索結果') + pageHead(escapeHtml(revision.title)) + `<p class="meta">${escapeHtml(revision.author)} · 第${revision.version}版 · ${revision.tasks.length}タスク</p>${taskDetails(revision.tasks)}<div class="action-row">${link(`schedule/${revision.id}`,'このリストを使う','ArrowRight','primary-button')}</div>${relatedBlock(revision)}`;
  }
  const baseViews = { ...views };
  const adoptedViews = {
    detail: detailView, schedule: () => scheduleView(), 'sync-error': () => scheduleView(true),
    private: privateView, editor: editorView, history: () => historyView(), 'history-detail': () => historyView(true),
    synced: savedView,
    publish: () => publishView(), 'publish-error': () => baseViews['publish-error']().replace(listTasks(state.draft.tasks),taskDetails(state.draft.tasks)),
    published: () => {
      const revision = revisions.find((item) => item.id === flow.lastPublishedId);
      return pageHead('公開しました') + `<section class="flow-saved"><h2>${escapeHtml(revision?.title ?? state.draft.title)}</h2><p class="meta">${revision ? `第${revision.version}版 · ` : ''}自分用の原本も保存済み</p><div class="action-row">${link('private','自分のリスト','','plain')}${revision ? link(`detail/${revision.id}`,'公開した内容を見る','ArrowRight') : ''}${link(`group/${state.group}`,'公開グループを見る','Library','primary-button')}</div></section>`;
    },
    apps: () => pageHead('タスクを管理') + `<section class="app-handoff"><img src="../../public/brand/icon-192.png" alt="CuckooCue アプリアイコン"><div><h2>CuckooCue for Android</h2>${currentRun() ? `<p>${escapeHtml(currentRun().title)}</p>${action('open-android','保存したリストを開く','ArrowUpRight','primary-button')}` : '<button class="button" type="button" disabled title="モック: 正式な配布リンクは未接続">Androidアプリ</button>'}</div></section>`,
    results: () => pageHead('探す') + searchForm() + `<p class="section-label">公開されたタスクリスト <span>${revisions.length}件</span></p>` + revisions.map((revision) => `<article class="result-item"><h2>${link(`detail/${revision.id}`,escapeHtml(revision.title),'','plain')}</h2><p class="meta">${escapeHtml(revision.author)} · ${revision.tasks.length}タスク · 第${revision.version}版</p><ol class="flow-preview">${revision.tasks.slice(0,3).map((task) => `<li>${escapeHtml(task.title)}</li>`).join('')}</ol>${revision.tasks.length > 3 ? `<details><summary>全${revision.tasks.length}件を見る</summary>${taskDetails(revision.tasks.slice(3))}</details>` : ''}<div class="item-footer">${link(`detail/${revision.id}`,'内容を見る','','plain')}${link(`schedule/${revision.id}`,'使う','ArrowRight','primary-button')}</div>${relatedBlock(revision)}</article>`).join(''),
  };
  for (const [name, view] of Object.entries(adoptedViews)) views[name] = (...args) => state.concept === 'a' ? view(...args) : baseViews[name](...args);

  function navigateTo(target) {
    if (state.busy) return;
    $('#toast').textContent = '';
    let [screen,key] = target.split('/');
    if (state.screen === 'editor' && state.dirty && target !== 'editor') {
      if (screen === 'publish') { showError('先に自分用のリストを保存してください。'); return; }
      if (!confirm('保存していない編集を破棄して移動しますか？')) return;
      state.draft = copy(state.savedDraft); state.dirty = false;
    }
    const next = () => {
      if (['edit-private','use-private','publish-private'].includes(screen)) {
        const item = flow.library.find((entry) => entry.id === key); if (!item) return;
        if (screen === 'use-private') { begin(item,'private'); screen = 'schedule'; }
        else { loadOriginal(item); screen = screen === 'publish-private' ? 'publish' : 'editor'; }
      }
      if (screen === 'detail') {
        if (state.screen === 'group') flow.detailFrom = `group/${state.group}`;
        else if (state.screen === 'results') flow.detailFrom = 'results';
        if (revisions.some((item) => item.id === key)) state.selected = key;
      }
      if (screen === 'schedule' && key && revisions.some((item) => item.id === key)) { state.selected = key; begin(selectedRevision()); }
      if (screen === 'group') state.group = key || state.group;
      if (screen === 'history-detail') flow.historyId = key || flow.historyId;
      if (screen === 'publish') { if (!state.saved || state.dirty) { notify('先に自分用のリストを保存してください。'); return; } state.pendingPublication = null; }
      if (catalog.screens.some(([name]) => name === screen)) navigate(screen);
    };
    if (['private','history','history-detail','editor','publish','fork','group-edit','edit-private','use-private','publish-private'].includes(screen)) privateGate(next); else next();
  }

  function mutateOriginal(operation) { rememberDraft(); operation(); markDraft(); render(); }
  function move(tasks,index,delta) { const to = index + delta; if (to < 0 || to >= tasks.length) return; [tasks[index],tasks[to]] = [tasks[to],tasks[index]]; }
  function commandFlow(name) {
    const [kind,value] = name.split(':'), index = Number(value), prep = flow.prep;
    if (kind === 'receive' || kind === 'complete') {
      const run = currentRun();
      if (!run) { $('#flow-review-status').textContent = '先にWebでリストを保存してください'; return; }
      if (kind === 'receive') { run.received = true; flow.handoffId = run.id; $('#flow-review-status').textContent = `同じRun IDを受信: ${run.id}`; }
      else {
        if (!run.received) { $('#flow-review-status').textContent = '先にAndroid受信を再現してください'; return; }
        if (!flow.histories.some((item) => item.id === run.id)) flow.histories.unshift({ ...copy(run), completedDay: addDays(run.anchor,3) });
        flow.historyId = run.id; $('#flow-review-status').textContent = `全件完了: ${run.id} / 完了履歴に反映`; navigate('history');
      }
      render(); return;
    }
    if (kind === 'expand') { const key = prep.tasks[index].id; if (flow.expanded.has(key)) flow.expanded.delete(key); else flow.expanded.add(key); render(); }
    if (kind === 'undo-prep' && flow.undo.length) { flow.prep = flow.undo.pop(); render(); }
    if (kind === 'reset') { rememberPrep(); const task = prep.tasks[index]; task.date = dateAt(prep.anchor,task.day); task.startDate = dateAt(prep.anchor,task.startDay); render(); }
    if (kind === 'prep-up' || kind === 'prep-down') { rememberPrep(); move(prep.tasks,index,kind === 'prep-up' ? -1 : 1); render(); }
    if (kind === 'remove-original') mutateOriginal(() => state.draft.tasks.splice(index,1));
    if (kind === 'original-up' || kind === 'original-down') mutateOriginal(() => move(state.draft.tasks,index,kind === 'original-up' ? -1 : 1));
    if (kind === 'add-original') { mutateOriginal(() => state.draft.tasks.push({ id:id('task'),title:'',day:null,startDay:null,priority:null })); $(`#original-${state.draft.tasks.length - 1}`).focus(); }
    if (kind === 'undo-original' && state.draftUndo.length) { state.draft = state.draftUndo.pop(); markDraft(); render(); }
    if (kind === 'discard-original' && confirm('保存していない変更を破棄しますか？')) { state.draft = copy(state.savedDraft); state.dirty = false; state.draftUndo = []; render(); }
    if (kind === 'use-saved-original') { if (state.dirty || !state.saved) return showError('先に自分用のリストを保存してください。'); navigateTo(`use-private/${state.draft.id}`); }
    if (kind === 'history-original') {
      const run = currentHistory();
      loadOriginal({ title:run.title, originRevisionId:null, tasks:run.tasks.map((task) => ({ id:id('task'), title:task.title, day:dayOffset(task.date,run.anchor), startDay:dayOffset(task.startDate,run.anchor), priority:task.priority })) },`history-detail/${run.id}`);
      state.dirty = true; navigate('editor');
    }
    if (kind === 'open-android') {
      const run = currentRun(); if (!run) return;
      flow.handoffError = $('#fail-next').checked; $('#fail-next').checked = false;
      if (!flow.handoffError) { flow.handoffId = run.id; $('#flow-review-status').textContent = `Run IDだけを渡す: ${run.id} / 実機遷移は未接続`; }
      navigate('synced');
    }
    if (kind === 'anchor-keep' || kind === 'anchor-reset') { $('#confirm').close(); applyAnchor(flow.nextAnchor,kind === 'anchor-keep'); }
    if (kind === 'anchor-cancel') { $('#confirm').close(); render(); }
  }
  document.addEventListener('click',(event) => {
    if (state.concept !== 'a') return;
    const button = event.target.closest('[data-flow]');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation(); if (!state.busy) commandFlow(button.dataset.flow);
  },true);
  document.addEventListener('input',(event) => {
    if (state.concept !== 'a') return;
    const input = event.target;
    if (input.id === 'flow-run-title') { rememberPrep(); flow.prep.title = input.value; }
    if (input.hasAttribute('data-prep-title')) {
      rememberPrep(); flow.prep.tasks[Number(input.dataset.prepTitle)].title = input.value;
      input.closest('li').querySelector('.flow-adopt span').textContent = input.value;
    }
    if (input.hasAttribute('data-original-title') || input.hasAttribute('data-original-task')) {
      rememberDraft(); if (input.hasAttribute('data-original-title')) state.draft.title = input.value;
      else state.draft.tasks[Number(input.dataset.originalTask)].title = input.value;
      updateOriginalHints();
    }
    if (input.hasAttribute('data-relative-number')) {
      const [index,key] = input.dataset.relativeNumber.split(':'); const mode = $(`[data-relative-mode="${index}:${key}"]`).value;
      rememberDraft(); state.draft.tasks[index][key] = input.value === '' ? NaN : Number(input.value) * (mode === 'before' ? -1 : 1); updateOriginalHints();
    }
    const undo = $('[data-flow="undo-prep"]'); if (undo) undo.disabled = !flow.undo.length;
  },true);
  document.addEventListener('change',(event) => {
    if (state.concept !== 'a') return;
    const input = event.target;
    if (input.id === 'flow-anchor') {
      if (autoDatesChanged() && input.value) {
        flow.nextAnchor = input.value;
        $('#confirm').innerHTML = `<h2 id="confirm-title">最終日を変更</h2><p>${dateLabel(input.value)}に変更します。個別に修正した日付をどうしますか？</p><div class="action-row">${action('anchor-cancel','キャンセル','','plain')}${action('anchor-keep','変更した日付は保持')}${action('anchor-reset','すべて自動計算','','primary-button')}</div>`;
        $('#confirm').showModal();
      } else applyAnchor(input.value,false);
    }
    if (input.hasAttribute('data-include')) { rememberPrep(); flow.prep.tasks[input.dataset.include].included = input.checked; render(); }
    if (input.hasAttribute('data-prep-date')) { const [index,key] = input.dataset.prepDate.split(':'); rememberPrep(); flow.prep.tasks[index][key] = input.value; render(); }
    if (input.hasAttribute('data-prep-priority')) { rememberPrep(); flow.prep.tasks[input.dataset.prepPriority].priority = input.value === '' ? null : Number(input.value); }
    if (input.hasAttribute('data-original-priority')) { rememberDraft(); state.draft.tasks[input.dataset.originalPriority].priority = input.value === '' ? null : Number(input.value); updateOriginalHints(); }
    if (input.hasAttribute('data-relative-mode')) {
      const [index,key] = input.dataset.relativeMode.split(':'); rememberDraft();
      const magnitude = Math.abs(state.draft.tasks[index][key]) || 1;
      state.draft.tasks[index][key] = input.value === 'none' ? null : input.value === 'same' ? 0 : magnitude * (input.value === 'before' ? -1 : 1); markDraft();
      const opened = [...document.querySelectorAll('.flow-offset-details')].map((el) => el.open); render();
      document.querySelectorAll('.flow-offset-details').forEach((el,i) => el.open = opened[i]);
      $(`[data-relative-mode="${index}:${key}"]`).focus();
    }
  },true);
  document.addEventListener('submit',(event) => {
    if (state.concept !== 'a') return;
    const form = event.target;
    if (!['flow-schedule-form','flow-editor-form','publish-form'].includes(form.id)) return;
    event.preventDefault(); event.stopImmediatePropagation(); if (state.busy) return;
    if (form.id === 'flow-schedule-form') { const error = validPrep(); if (error) return showError(error); privateGate(() => perform(saveRun,'sync-error')); }
    if (form.id === 'flow-editor-form') { const error = validOriginal(); if (error) return showError(error); perform(saveOriginal,null,'保存できませんでした。編集内容は残っています。'); }
    if (form.id === 'publish-form') {
      if (!state.saved || state.dirty) return showError('先に自分用のリストを保存してください。');
      const data = new FormData(form); state.pendingPublication = Object.fromEntries(data);
      const snapshot = copy(state.savedDraft);
      perform(() => {
        let shelf = state.ownGroups.find((item) => item.id === data.get('target'));
        if (!shelf) { shelf = { id:id('shelf'),title:String(data.get('title')).trim(),context:String(data.get('context')).trim(),owner:'Yuki',revisions:[] }; state.ownGroups.push(shelf); }
        const version = revisions.filter((item) => item.sourceCuebookId === snapshot.id).length + 1;
        const revision = { id:id('revision'),sourceCuebookId:snapshot.id,title:snapshot.title,tasks:copy(snapshot.tasks),author:'Yuki',version };
        revisions.push(revision); shelf.revisions.push(revision.id); state.joined.add(shelf.id); state.group = shelf.id; flow.lastPublishedId = revision.id;
        navigate('published');
      },'publish-error');
    }
  },true);

  const oldPreview = preview;
  preview = (screen) => {
    if (state.concept === 'a') {
      if (['schedule','sync-error','synced','apps'].includes(screen)) { ensurePrep(); if (!flow.prep.anchor) applyAnchor('2026-10-30',false); }
      if (screen === 'synced' && !currentRun()) saveRun();
    }
    oldPreview(screen);
  };
  $('#confirm').addEventListener('cancel',() => render());
  new ResizeObserver(() => document.body.style.setProperty('--flow-toolbar-height', `${$('.flow-review').getBoundingClientRect().height}px`)).observe($('.flow-review'));
  window.reuseMock = { route:navigateTo, inspect:() => copy({ library:flow.library,runs:flow.runs,histories:flow.histories,prep:flow.prep,handoffId:flow.handoffId,revisions,joined:[...state.joined] }) };
  preview(state.screen);
})();
