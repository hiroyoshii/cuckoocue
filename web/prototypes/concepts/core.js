// All mutations are in-memory UI simulations. No production API or schema changes.
const { revisions, shelves, completed } = structuredClone(window.mockFixtures);
const catalog = window.conceptCatalog;
const params = new URLSearchParams(location.search);
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const ico = (name) => window.cueIcons[name] || '';
const state = {
  concept: catalog.concepts.some((item) => item.id === params.get('concept')) ? params.get('concept') : 'a',
  screen: catalog.screens.some(([id]) => id === params.get('screen')) ? params.get('screen') : 'start',
  query: '猫2匹と東京から名古屋へ引っ越す', selected: revisions[0].id,
  joined: new Set(), group: shelves[0].id, ownGroups: [], authenticated: false,
  anchor: '2026-10-30', dates: [], draft: { title: '猫と暮らす家の引っ越し', tasks: structuredClone(completed.tasks) },
  saved: true, dirty: false, busy: false, returnTo: 'private', publication: 0,
};
const selectedRevision = () => revisions.find((item) => item.id === state.selected) || revisions[0];
const allShelves = () => [...shelves, ...state.ownGroups];
const selectedGroup = () => allShelves().find((item) => item.id === state.group) || shelves[0];
const relatedShelves = (id) => allShelves().filter((item) => item.revisions.includes(id));
const dayText = (day) => day === 0 ? '当日' : `${Math.abs(day)}日${day < 0 ? '前' : '後'}`;
function addDays(anchor, day) { const date = new Date(`${anchor}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + day); return date.toISOString().slice(0, 10); }
function initializeDates() { state.dates = selectedRevision().tasks.map((task) => addDays(state.anchor, task.day)); }
initializeDates();
const plainCopy = {
  '自分のCuebook': '自分のリスト', '再利用用に整える': '再利用用リストを編集',
  '完了履歴から整える': '完了履歴から追加', '内容を整える': '編集',
  '日程を決める': '日程を設定', 'みんなが残した、再利用できるタスクリスト': '公開されたタスクリスト',
  'アプリで使う準備ができました': '日程を保存しました',
  'この内容を、他の人も再利用できるようにします': '公開するタスクとグループを確認',
  '今は探すだけ': 'ログインせずに探す',
};
const displayText = (text) => state.concept === 'a' ? (plainCopy[text] || text) : text;
const link = (route, label, icon = '', style = '') => `<a href="#${route}" class="button ${style}">${icon ? ico(icon) : ''}${displayText(label)}</a>`;
const command = (action, label, icon = '', style = '') => `<button type="button" data-action="${action}" class="button ${style}">${icon ? ico(icon) : ''}${displayText(label)}</button>`;
const tool = (action, label, icon, disabled = false) => `<button type="button" class="tool" data-action="${action}" aria-label="${label}" title="${label}" ${disabled ? 'disabled' : ''}>${ico(icon)}</button>`;
const pageHead = (title, subtitle = '', action = '') => `<header class="page-head"><div><h1>${displayText(title)}</h1>${subtitle ? `<p>${displayText(subtitle)}</p>` : ''}</div>${action}</header>`;
const crumbs = (route, label) => `<a href="#${route}" class="crumb">${ico('ArrowLeft')}${displayText(label)}</a>`;
const listTasks = (tasks, finished = false) => `<ul class="task-list ${finished ? 'finished' : ''}">${tasks.map((task) => `<li><span class="task-symbol" aria-hidden="true">${finished ? ico('Check') : ''}</span><span>${escapeHtml(task.title)}</span></li>`).join('')}</ul>`;
function relatedBlock(revision) {
  if (state.concept === 'a') {
    return relatedShelves(revision.id)
      .filter((shelf) => state.screen !== 'group' || shelf.id !== state.group)
      .map((shelf) => `<a class="related related-link" href="#group/${shelf.id}"><span class="shelf-icon">${ico(shelf.id === 'shelf-cats' ? 'Cat' : 'Library')}</span><span class="related-label"><small>このリストがあるグループ</small><span>${escapeHtml(shelf.title)}</span></span>${ico('ArrowRight')}</a>`).join('');
  }
  return relatedShelves(revision.id).map((shelf) => `<div class="related"><span class="shelf-icon">${ico(shelf.id === 'shelf-cats' ? 'Cat' : 'Library')}</span><div><small>このリストがあるグループ</small><a href="#group/${shelf.id}">${escapeHtml(shelf.title)}</a></div>${command(`join:${shelf.id}`, state.joined.has(shelf.id) ? '参加済み' : '参加', state.joined.has(shelf.id) ? 'Check' : 'Plus')}</div>`).join('');
}
function shelfSummary(shelf = selectedGroup()) {
  return `<aside class="support"><span class="shelf-icon large">${ico(shelf.id === 'shelf-cats' ? 'Cat' : 'Library')}</span><h2>${escapeHtml(shelf.title)}</h2><p>${escapeHtml(shelf.context)}</p><small>${shelf.revisions.length}件のリスト · ${escapeHtml(shelf.owner)}</small>${link(`group/${shelf.id}`, 'グループを開く', 'ArrowRight')}</aside>`;
}
function split(primary, secondary, extra = '') { return `<div class="workspace ${extra}"><section class="primary-content">${primary}</section>${secondary}</div>`; }
function resultItem(revision, compact = false) {
  const shelf = relatedShelves(revision.id)[0];
  const route = state.concept === 'c' ? `select/${revision.id}` : `detail/${revision.id}`;
  return `<article class="result-item ${compact ? 'compact' : ''} ${state.selected === revision.id ? 'selected' : ''}">
    <div class="book-symbol" aria-hidden="true">${ico('BookOpen')}<span>${revision.tasks.length}</span></div>
    <h2><a href="#${route}">${escapeHtml(revision.title)}</a></h2><p class="meta">${escapeHtml(revision.author)} · ${revision.tasks.length}タスク · 第${revision.version}版</p>
    ${!compact ? `<p class="context">${escapeHtml(shelf?.context || '')}</p>${listTasks(revision.tasks.slice(0, state.concept === 'b' ? 2 : 3))}<div class="item-footer">${link(`detail/${revision.id}`, '内容を見る', 'ArrowRight')}${link(`schedule/${revision.id}`, '使う', '', 'primary-button')}</div>${relatedBlock(revision)}` : ''}</article>`;
}
function navigation() {
  const routes = [['start', 'Search', '探す'], ['history', 'History', '完了履歴'], ['private', 'BookOpen', '自分のCuebook']];
  const family = state.concept === 'a' && state.screen === 'group' ? (state.joined.has(state.group) ? null : 'start') : ['start', 'results', 'detail', 'schedule', 'synced', 'empty', 'search-error', 'sync-error'].includes(state.screen) ? 'start' : ['history', 'history-detail'].includes(state.screen) ? 'history' : 'private';
  return `<button class="veil" data-action="close-menu" aria-label="メニューを閉じる"></button><aside class="sidebar"><a class="brand" href="#start"><img src="../../public/brand/lockup-header.png" alt="CuckooCue"></a><nav aria-label="メイン">${routes.map(([route, icon, title]) => `<a href="#${route}" ${family === route ? 'aria-current="page"' : ''}>${ico(icon)}${displayText(title)}</a>`).join('')}</nav>
    ${state.joined.size ? `<h2 class="nav-caption">参加グループ</h2><nav aria-label="参加グループ">${[...state.joined].map((id) => `<a href="#group/${id}" ${state.screen === 'group' && state.group === id ? 'aria-current="page"' : ''}>${ico('Library')}${escapeHtml(allShelves().find((shelf) => shelf.id === id).title)}</a>`).join('')}</nav>` : ''}
    <div class="nav-bottom">${link('apps', 'タスクを管理', 'Smartphone', 'plain')}<a class="account-link" href="#account">${state.authenticated ? '<span class="avatar">Y</span>Yuki' : `${ico('ArrowRight')}ログイン`}</a></div></aside>
    <header class="mobile-header">${tool('menu', 'メニューを開く', 'Menu')}<a href="#start"><img src="../../public/brand/lockup-header.png" alt="CuckooCue"></a>${link('apps', '<span class="sr-only">タスクを管理</span>', 'Smartphone', 'plain')}</header>`;
}
function notify(text) { $('#toast').textContent = text; clearTimeout(notify.timer); notify.timer = setTimeout(() => { $('#toast').textContent = ''; }, 4000); }
function navigate(screen, focus = true) {
  state.screen = screen;
  render(focus);
}
function render(focus = false) {
  document.body.dataset.concept = state.concept;
  document.body.dataset.screen = state.screen;
  $('#concept-select').innerHTML = catalog.concepts.map((item) => `<option value="${item.id}" ${item.id === state.concept ? 'selected' : ''}>${item.name}</option>`).join('');
  $('#screen-select').innerHTML = catalog.screens.map(([id, title]) => `<option value="${id}" ${id === state.screen ? 'selected' : ''}>${title}</option>`).join('');
  $('#app').innerHTML = `${navigation()}<main id="main" tabindex="-1"><div class="page-content">${views[state.screen]()}</div></main>`;
  if (state.pendingPublication && $('#publish-form')) {
    const form = $('#publish-form');
    for (const [name, value] of Object.entries(state.pendingPublication)) form.elements.namedItem(name).value = value;
    $('#new-group-fields').hidden = form.elements.namedItem('target').value !== 'new';
    form.elements.namedItem('title').required = !$('#new-group-fields').hidden;
  }
  document.title = `${catalog.concepts.find((item) => item.id === state.concept).name} / ${catalog.screens.find(([id]) => id === state.screen)[1]} | CuckooCue`;
  if (focus) { $('#main').focus({ preventScroll: true }); scrollTo(0, 0); }
}
