/* Standalone interaction prototype. No API calls, durable storage, or real handoff. */
const { revisions, shelves, completed } = structuredClone(window.mockFixtures);
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name) => window.cueIcons[name] || '';
const button = (action, text, name, style = '') => `<button class="btn ${style}" data-action="${action}">${name ? icon(name) : ''}${text}</button>`;
const state = {
  screen: 'search', joined: new Set(), query: '猫2匹と東京から名古屋へ引っ越す',
  revision: revisions[0], anchor: '2026-10-30', dates: [], synced: false,
  cuebook: { title: '猫と暮らす家の引っ越し', tasks: structuredClone(completed.tasks) },
  saved: true, dirty: false, publicShelves: [], busy: false,
};
const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const relative = (day) => day === 0 ? '当日' : `${Math.abs(day)}日${day < 0 ? '前' : '後'}`;
const resetDates = () => { state.dates = state.revision.tasks.map((task) => addDays(state.anchor, task.day)); state.synced = false; };
resetDates();

function sidebar() {
  const links = [['search', 'Search', '探す'], ['history', 'History', '完了履歴'], ['library', 'BookOpen', '自分のCuebook']];
  return `<button class="drawer-shade" aria-label="メニューを閉じる" data-action="close-menu"></button><aside class="sidebar" aria-label="サイドバー">
    <a href="#search" class="brand" aria-label="CuckooCue 探す"><img src="../../public/brand/lockup-header.png" alt="CuckooCue"></a>
    <nav class="nav" aria-label="メイン">${links.map(([route, name, label]) => `<a href="#${route}" ${state.screen === route ? 'aria-current="page"' : ''}>${icon(name)}${label}</a>`).join('')}</nav>
    ${state.joined.size ? `<h2 class="nav-label">参加グループ</h2><nav class="nav" aria-label="参加グループ">${[...state.joined].map((id) => {
      const shelf = [...shelves, ...state.publicShelves].find((item) => item.id === id);
      return `<a class="group-link" href="#shelf/${id}">${icon('Library')}${esc(shelf.title)}</a>`;
    }).join('')}</nav>` : ''}
    <div class="sidebar-bottom"><a class="manage-link" href="#apps">${icon('Smartphone')}タスクを管理${icon('ArrowUpRight')}</a><div class="account"><span class="avatar">Y</span><span>Yuki <small>サンプル</small></span></div></div>
    </aside><header class="mobile-bar"><button class="icon-btn" data-action="menu" aria-label="メニューを開く">${icon('Menu')}</button><a href="#search"><img src="../../public/brand/lockup-header.png" alt="CuckooCue"></a><a class="icon-btn" href="#apps" aria-label="タスクを管理">${icon('Smartphone')}</a></header>`;
}
function taskPreview(tasks) {
  return `<ul class="preview-tasks">${tasks.map((task, i) => `<li><span class="task-mark ${i === 1 ? 'gold' : ''}" aria-hidden="true"></span><span>${esc(task.title)}</span></li>`).join('')}</ul>`;
}
function resultCard(revision) {
  const shelf = shelves.find((item) => item.revisions.includes(revision.id));
  return `<article class="result"><div class="result-heading"><div><h2><a href="#schedule/${revision.id}">${esc(revision.title)}</a></h2><div class="byline">${esc(revision.author)} <span>·</span> ${revision.tasks.length}タスク <span>·</span> 第${revision.version}版</div></div><a class="btn" href="#schedule/${revision.id}">使う${icon('ArrowRight')}</a></div>
    ${shelf ? `<p class="context">${esc(shelf.context)}</p>` : ''}${taskPreview(revision.tasks.slice(0, 3))}
    ${revision.tasks.length > 3 ? `<details class="preview-more"><summary>残り${revision.tasks.length - 3}件を表示</summary>${taskPreview(revision.tasks.slice(3))}</details>` : ''}
    ${shelf ? `<div class="shelf-line"><span class="shelf-symbol">${icon(shelf.id === 'shelf-cats' ? 'Cat' : 'Library')}</span><div class="shelf-name"><small>このリストがあるグループ</small><a href="#shelf/${shelf.id}">${esc(shelf.title)}</a></div>${button(`join:${shelf.id}`, state.joined.has(shelf.id) ? '参加済み' : '参加', state.joined.has(shelf.id) ? 'Check' : 'Plus')}</div>` : ''}</article>`;
}
function searchScreen() {
  const matches = state.query.includes('引っ越') ? revisions.slice(0, 2) : state.query.includes('住所') ? [revisions[1]] : state.query.includes('猫') ? [revisions[0], revisions[2]] : [];
  return `<div class="page-heading"><div><h1>探す</h1><p class="muted">みんなが残した、再利用できるタスクリスト</p></div></div>
    <form class="search-form" id="search-form">${icon('Search')}<input name="query" aria-label="目的や状況" placeholder="何をする？ どんな状況？" value="${esc(state.query)}" required><button class="btn primary" type="submit">検索</button></form>
    <div class="results-header"><span>公開されたタスクリスト</span><span>${matches.length}件</span></div>
    <div id="search-results">${matches.length ? matches.map(resultCard).join('') : '<p class="empty">一致するリストがありません</p>'}</div>`;
}
function scheduleScreen() {
  return `<a class="breadcrumb" href="#search">${icon('ArrowLeft')}検索結果</a><div class="step-line"><span>リストを選ぶ</span><span class="active">日程を設定</span><span>アプリで使う</span></div>
    <div class="page-heading"><div><h1>日程を決める</h1><p class="muted">${esc(state.revision.title)}</p></div></div>
    <div class="anchor-band"><div><label class="field-label" for="anchor">${state.revision.id === 'revision-pets-2' ? '出発日' : '引っ越し日'}</label><input id="anchor" type="date" value="${state.anchor}" required></div><div class="anchor-caption">${state.revision.tasks.length}タスク<br><span id="date-range">${esc(state.dates[0])} から</span></div></div>
    <div class="section-heading"><h2>今回の日程</h2><small>期日</small></div><ul class="schedule-list">${state.revision.tasks.map((task, i) => `<li class="schedule-task"><span class="task-mark" aria-hidden="true"></span><div class="task-title">${esc(task.title)}<span class="task-relative">元の目安：${relative(task.day)}</span></div><input type="date" data-date="${i}" value="${state.dates[i]}" aria-label="${esc(task.title)}の期日" required></li>`).join('')}</ul>
    <div class="action-bar"><small>自分用 · ${esc(state.revision.author)}の第${state.revision.version}版から</small>${button('sync', '日程を確定して同期', 'ArrowRight', 'primary')}</div><p id="schedule-status" class="status-inline" role="status"></p>`;
}
function libraryScreen() {
  return `<div class="page-heading"><h1>自分のCuebook</h1><a href="#history" class="btn quiet">${icon('History')}完了履歴</a></div>
    <div class="library-layout"><nav class="shelf-tree" aria-label="自分の棚"><a href="#library" aria-current="page">${icon('FolderClosed')}暮らし</a><small>1件</small></nav><section aria-label="Cuebook編集">
    <div class="library-top"><div><h2>暮らし</h2><div class="private-heading">${icon('LockKeyhole')}自分だけ</div></div><span class="muted" id="save-state">${state.dirty ? '未保存' : '保存済み'}</span></div>
    <p class="editor-meta"><small>完了履歴「${completed.title}」から</small></p>
    <label class="editor-label" for="cuebook-title">リスト名</label><input id="cuebook-title" class="text-input title-input" value="${esc(state.cuebook.title)}" required>
    <div class="editor-columns"><span>再利用するタスク</span><span>基準日からの日数</span></div>
    <div id="edit-tasks">${state.cuebook.tasks.map((task, i) => `<div class="task-edit">${icon('ListMinus')}<textarea rows="1" data-title="${i}" aria-label="タスク${i + 1}の内容" required>${esc(task.title)}</textarea><input class="offset" type="number" step="1" min="-3650" max="3650" data-offset="${i}" value="${task.day}" aria-label="タスク${i + 1}の相対日"><button class="icon-btn" data-action="remove:${i}" aria-label="タスク${i + 1}を除外" title="除外">${icon('X')}</button></div>`).join('')}</div>
    <div class="editor-footer">${button('add-task', 'タスクを追加', 'Plus', 'quiet')}${button('save-cuebook', '自分用に保存', 'Save', 'primary')}</div>
    <div class="publication"><div><h3>グループに公開</h3><p>${state.published ? '公開済み。原本は自分用として保持しています。' : '公開する内容と公開先を確認'}</p></div>${button('publish-review', '公開内容を確認', 'ArrowRight')}</div>
    <p class="status-inline" id="library-status" role="status"></p></section></div>`;
}
function historyScreen() {
  return `<div class="page-heading"><h1>完了履歴</h1></div><article class="history-entry"><div class="result-heading"><div><p class="eyebrow">2026年9月2日 完了</p><h2>${completed.title}</h2><p class="context">${completed.tasks.length}件の完了タスク</p></div>${button('from-history', '再利用用に整える', 'ArrowRight')}</div>${taskPreview(completed.tasks)}</article>`;
}
function render(focus = false) {
  const views = { search: searchScreen, schedule: scheduleScreen, library: libraryScreen, history: historyScreen };
  $('#app').innerHTML = `${sidebar()}<main id="main" tabindex="-1"><div class="content">${views[state.screen]()}</div></main>`;
  $('#review-screen').value = state.screen === 'history' ? 'library' : state.screen;
  document.title = `${{ search: '探す', schedule: '日程を決める', library: '自分のCuebook', history: '完了履歴' }[state.screen]} | CuckooCue モック`;
  if (focus) { $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0); }
}
function toast(message) { $('#notice').textContent = message; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('#notice').textContent = ''; }, 4500); }
function modal(title, body) { $('#dialog').innerHTML = `<button class="icon-btn dialog-close" data-action="close-dialog" aria-label="閉じる">${icon('X')}</button><h2 id="dialog-title">${title}</h2>${body}`; if (!$('#dialog').open) $('#dialog').showModal(); }
function openShelf(id) {
  const shelf = [...shelves, ...state.publicShelves].find((item) => item.id === id);
  if (!shelf) return;
  modal(esc(shelf.title), `<p>${esc(shelf.context)}</p><small>${esc(shelf.owner)} · 公開グループ</small>${shelf.revisions.map((rid) => {
    const revision = revisions.find((item) => item.id === rid);
    return `<div class="shelf-item"><h3><a href="#schedule/${rid}">${esc(revision.title)}</a></h3><small>第${revision.version}版 · ${revision.tasks.length}タスク</small></div>`;
  }).join('')}<div class="dialog-actions">${button(`fork:${shelf.id}`, 'グループ全体をコピー', 'Copy')}${button(`join:${shelf.id}`, state.joined.has(id) ? '参加を解除' : '参加', state.joined.has(id) ? null : 'Plus', 'primary')}</div>`);
}
function go(route) {
  const [screen, id] = route.split('/');
  if (state.busy) { toast('処理中です'); return; }
  if (state.dirty && state.screen === 'library' && screen !== 'library' && !window.confirm('未保存の変更があります。変更を破棄して移動しますか？')) return;
  if (state.dirty && screen !== 'library') { state.cuebook = structuredClone(state.lastSaved || state.initialCuebook); state.dirty = false; }
  $('#dialog').close();
  if (screen === 'shelf') { openShelf(id); return; }
  if (screen === 'apps') { modal('タスクを管理', `<p>Android / iOS</p><div class="summary-line">アプリの配布先は未確認</div><p class="mock-label">モックではストアURL・App Linkを仮作成していません。</p>`); return; }
  if (!['search', 'schedule', 'library', 'history'].includes(screen)) return;
  if (screen === 'schedule') { state.revision = revisions.find((item) => item.id === id) || revisions[0]; resetDates(); }
  state.screen = screen; render(true);
}
async function operation(work, failure) {
  if (state.busy) return;
  state.busy = true;
  const fail = $('#simulate-error').checked;
  $('#simulate-error').checked = false;
  const controls = [...document.querySelectorAll('button:not(.dialog-close), input:not(#simulate-error), select, textarea')];
  const before = controls.map((control) => control.disabled);
  controls.forEach((control) => { control.disabled = true; });
  try { await new Promise((resolve) => setTimeout(resolve, 450)); if (fail) failure(); else work(); }
  finally { state.busy = false; controls.forEach((control, i) => { control.disabled = before[i]; }); }
}
function setDirty() { state.dirty = true; const label = $('#save-state'); if (label) label.textContent = '未保存'; }
function validCuebook() { return state.cuebook.title.trim() && state.cuebook.tasks.length && state.cuebook.tasks.every((task) => task.title.trim() && Number.isInteger(task.day) && Math.abs(task.day) <= 3650); }
function sync() {
  if (!$('#anchor').value || state.dates.some((date) => !date)) { $('#schedule-status').textContent = 'すべての日付を入力してください'; return; }
  $('#schedule-status').classList.remove('error');
  $('#schedule-status').textContent = '保存・同期中…';
  operation(() => {
    state.synced = true;
    $('#schedule-status').textContent = '同期しました';
    modal('アプリで使う準備ができました', `<p>${esc(state.revision.title)}</p><div class="summary-line">${state.revision.tasks.length}タスク · 日程設定済み<br><small>自分のアカウントに同期</small></div>${button('handoff', 'アプリで開く', 'ArrowUpRight', 'primary')}<p class="mock-label">同期成功時の表示サンプルです。実際の保存・端末同期は行っていません。</p>`);
  }, () => { $('#schedule-status').classList.add('error'); $('#schedule-status').textContent = '同期できませんでした。日程は保持しています。もう一度お試しください。'; });
}
function reviewPublish() {
  if (state.dirty || !state.saved) { $('#library-status').textContent = '先に自分用の内容を保存してください'; return; }
  modal('公開内容を確認', `<p>公開後は、他の人もこの内容を再利用できます。</p><div class="summary-line"><strong>${esc(state.cuebook.title)}</strong><br><small>${state.cuebook.tasks.length}タスク</small></div><details><summary>公開するタスクを確認</summary>${taskPreview(state.cuebook.tasks)}</details><label class="editor-label" for="publish-shelf">公開先</label><select class="text-input" id="publish-shelf"><option value="new">新しいグループを作る</option>${state.publicShelves.map((shelf) => `<option value="${shelf.id}">${esc(shelf.title)}</option>`).join('')}</select><div id="new-shelf-fields"><label class="editor-label" for="shelf-title">グループ名</label><input class="text-input" id="shelf-title" value="猫と暮らす家の準備"><label class="editor-label" for="shelf-context">状況</label><input class="text-input" id="shelf-context" value="猫2匹と暮らす家の、引っ越しや外出の準備"></div><p id="publish-status" role="status"></p><div class="dialog-actions">${button('close-dialog', '戻る')}${button('publish', 'この内容を公開', null, 'primary')}</div>`);
}
function publish() {
  const selected = $('#publish-shelf').value;
  if (selected === 'new' && !$('#shelf-title').value.trim()) { $('#publish-status').textContent = 'グループ名を入力してください'; return; }
  operation(() => {
    let shelf = state.publicShelves.find((item) => item.id === selected);
    if (!shelf) { shelf = { id: `mock-shelf-${state.publicShelves.length}`, title: $('#shelf-title').value.trim(), context: $('#shelf-context').value, owner: 'Yuki', revisions: [] }; state.publicShelves.push(shelf); }
    state.publicationCount = (state.publicationCount || 0) + 1;
    const revision = { id: `mock-revision-${revisions.length}`, title: state.cuebook.title, author: 'Yuki', version: state.publicationCount, tasks: structuredClone(state.cuebook.tasks) };
    revisions.push(revision); shelf.revisions.push(revision.id); state.joined.add(shelf.id); state.published = true;
    $('#dialog').close(); render(); toast('公開しました（モック）。自分用の原本も残っています。');
  }, () => { $('#publish-status').textContent = '公開できませんでした。自分用の保存内容は残っています。'; });
}
const actions = {
  menu: () => { $('.sidebar').classList.add('open'); $('.drawer-shade').classList.add('open'); $('.sidebar a').focus(); },
  'close-menu': () => { $('.sidebar').classList.remove('open'); $('.drawer-shade').classList.remove('open'); $('[data-action="menu"]').focus(); },
  'close-dialog': () => $('#dialog').close(), sync, 'publish-review': reviewPublish, publish,
  handoff: () => modal('モバイルへの引き渡し', '<p>同期済みの同じタスクリストを、アプリで開く地点です。</p><p class="mock-label">ここまでがモックの確認範囲です。実App Link・端末反映は未接続のため、実機遷移はしません。</p>'),
  'from-history': () => { state.cuebook = { title: completed.title, tasks: structuredClone(completed.tasks) }; state.publicationCount = 0; state.published = false; state.saved = false; state.dirty = true; state.screen = 'library'; render(true); },
  'add-task': () => { state.cuebook.tasks.push({ title: '', day: 0 }); setDirty(); render(); $(`[data-title="${state.cuebook.tasks.length - 1}"]`).focus(); },
  'save-cuebook': () => {
    if (!validCuebook()) { $('#library-status').textContent = 'リスト名・1件以上のタスク・整数の日数を入力してください'; return; }
    operation(() => { state.saved = true; state.dirty = false; state.lastSaved = structuredClone(state.cuebook); render(); $('#library-status').textContent = '自分用に保存しました（モック）'; }, () => { $('#library-status').textContent = '保存できませんでした。編集内容は保持しています。'; });
  },
};
document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor && !anchor.classList.contains('skip')) { event.preventDefault(); go(anchor.getAttribute('href').slice(1)); return; }
  const trigger = event.target.closest('[data-action]');
  if (!trigger || state.busy) return;
  const [action, id] = trigger.dataset.action.split(':');
  if (actions[action]) actions[action]();
  if (action === 'remove') { state.cuebook.tasks.splice(Number(id), 1); setDirty(); render(); }
  if (action === 'join') operation(() => { const joined = state.joined.has(id); if (joined) state.joined.delete(id); else state.joined.add(id); const dialogOpen = $('#dialog').open; render(); if (dialogOpen) openShelf(id); toast(joined ? '参加を解除しました（モック）' : '参加グループに追加しました（モック）'); }, () => toast('参加状態を変更できませんでした'));
  if (action === 'fork') {
    const shelf = [...shelves, ...state.publicShelves].find((item) => item.id === id);
    modal('グループ全体をコピー', `<p>全${shelf.revisions.length}件を、現在配置されている版で引き継ぎます。</p><label class="editor-label" for="fork-title">グループ名</label><input class="text-input" id="fork-title" value="${esc(shelf.title)}・自分のまとめ"><p>元グループの更新には自動追従しません。</p><div class="dialog-actions">${button(`confirm-fork:${id}`, 'コピーして作成', 'Copy', 'primary')}</div>`);
  }
  if (action === 'confirm-fork') {
    if (!$('#fork-title').value.trim()) { $('#fork-title').focus(); return; }
    operation(() => { const source = [...shelves, ...state.publicShelves].find((item) => item.id === id); const shelf = { ...source, id: `mock-fork-${state.publicShelves.length}`, title: $('#fork-title').value.trim(), owner: 'Yuki', revisions: [...source.revisions] }; state.publicShelves.push(shelf); state.joined.add(shelf.id); render(); openShelf(shelf.id); }, () => toast('コピーできませんでした'));
  }
});
document.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'cuebook-title') { state.cuebook.title = target.value; setDirty(); }
  if (target.hasAttribute('data-title')) { state.cuebook.tasks[Number(target.dataset.title)].title = target.value; setDirty(); }
  if (target.hasAttribute('data-offset')) { state.cuebook.tasks[Number(target.dataset.offset)].day = target.value === '' ? NaN : Number(target.value); setDirty(); }
});
document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.id === 'review-screen') go(target.value);
  if (target.id === 'anchor') { if (!target.value) return; state.anchor = target.value; resetDates(); render(); $('#anchor').focus(); }
  if (target.hasAttribute('data-date')) { state.dates[Number(target.dataset.date)] = target.value; state.synced = false; $('#date-range').textContent = `${state.dates.filter(Boolean).sort()[0] || ''} から`; }
  if (target.id === 'publish-shelf') $('#new-shelf-fields').hidden = target.value !== 'new';
});
document.addEventListener('submit', (event) => {
  if (event.target.id !== 'search-form') return;
  event.preventDefault();
  state.query = new FormData(event.target).get('query').trim();
  $('#search-results').innerHTML = '<p class="empty" role="status">検索中…</p>';
  operation(() => render(), () => { $('#search-results').innerHTML = '<p class="empty" role="alert">検索できませんでした。もう一度検索してください。</p>'; });
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && $('.sidebar.open')) actions['close-menu'](); });
state.initialCuebook = structuredClone(state.cuebook);
render();
const initial = new URLSearchParams(location.search).get('screen');
if (initial) go(initial);
