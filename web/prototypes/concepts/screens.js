function searchForm(initial = false) {
  return `<form id="search-form" class="search-form"><label class="sr-only" for="query">目的や状況</label>${ico('Search')}<textarea rows="1" id="query" name="query" placeholder="${state.concept === 'a' ? '目的や条件' : '何をする？ どんな状況？'}" required>${initial ? '' : escapeHtml(state.query)}</textarea><button class="button primary-button" type="submit">検索</button></form>`;
}
function detailContent(revision, embedded = false) {
  return `${embedded ? `<h2>${escapeHtml(revision.title)}</h2>` : pageHead(escapeHtml(revision.title))}<p class="meta">${escapeHtml(revision.author)} · 第${revision.version}版 · ${revision.tasks.length}タスク</p>${listTasks(revision.tasks)}<div class="action-row">${link(`schedule/${revision.id}`, 'このリストを使う', 'ArrowRight', 'primary-button')}</div>${relatedBlock(revision)}`;
}
function resultsScreen() {
  const results = state.query.includes('住所') && !state.query.includes('引っ越') ? [revisions[1]] : state.query.includes('外出') ? [revisions[2]] : revisions.slice(0, 2);
  const head = pageHead('探す') + searchForm() + `<p class="section-label">公開されたタスクリスト <span>${results.length}件</span></p>`;
  if (state.concept === 'c') return head + `<div class="browser-layout"><section class="result-index" aria-label="検索結果">${results.map((item) => resultItem(item, true)).join('')}</section><section class="selection-detail" aria-label="選んだリスト">${detailContent(selectedRevision(), true)}</section></div>`;
  return head + `<div class="results">${results.map((item) => resultItem(item)).join('')}</div>`;
}
function scheduleScreen(error = false) {
  if (state.concept === 'a') return revisedSchedule(error);
  const revision = selectedRevision();
  const form = `<form id="schedule-form"><div class="date-anchor"><label for="anchor">${revision.id === 'revision-pets-2' ? '出発日' : '引っ越し日'}</label><input id="anchor" type="date" value="${state.anchor}" required></div>
    <div class="section-label">今回の日程 <span>期日</span></div><ol class="schedule-tasks">${revision.tasks.map((task, index) => `<li><span class="timeline-date">${dayText(task.day)}</span><label for="date-${index}">${escapeHtml(task.title)}</label><input type="date" id="date-${index}" data-date="${index}" value="${state.dates[index]}" required></li>`).join('')}</ol>
    ${error ? '<div class="error" role="alert"><strong>同期できませんでした</strong><p>入力した日程は保持しています。</p></div>' : ''}<div class="action-row"><button class="button primary-button" type="submit">${error ? 'もう一度同期する' : '日程を確定して同期'}${ico('ArrowRight')}</button></div><p id="operation-status" role="status"></p></form>`;
  return crumbs(`detail/${revision.id}`, 'リストの内容') + pageHead('日程を決める', escapeHtml(revision.title)) + split(form, `<aside class="support"><h2>今回使うリスト</h2><p>${escapeHtml(revision.title)}</p><small>${revision.tasks.length}タスク · 第${revision.version}版から</small><p class="private-label">${ico('LockKeyhole')}自分用</p></aside>`, 'schedule-workspace');
}
function groupScreen() {
  const shelf = selectedGroup();
  const own = shelf.owner === 'Yuki';
  return crumbs('results', '探す') + `<div class="group-heading"><span class="shelf-icon large">${ico('Library')}</span>${pageHead(escapeHtml(shelf.title), escapeHtml(shelf.context), command(`join:${shelf.id}`, state.joined.has(shelf.id) ? '参加を解除' : '参加', state.joined.has(shelf.id) ? '' : 'Plus', 'primary-button'))}</div>
    <div class="section-label"><span>${escapeHtml(shelf.owner)} · 公開 · ${shelf.revisions.length}件</span>${own ? link('group-edit', 'グループを編集', 'ListMinus', 'plain') : link('fork', 'グループ全体をコピー', 'Copy', 'plain')}</div>
    <div class="results group-results">${shelf.revisions.map((id) => resultItem(revisions.find((item) => item.id === id))).join('')}</div>`;
}
function forkScreen() {
  const shelf = selectedGroup();
  return crumbs(`group/${shelf.id}`, shelf.title) + pageHead('グループ全体をコピー') + split(`<form id="fork-form"><label class="field">新しいグループ名<input name="title" value="${escapeHtml(shelf.title)}・自分のまとめ" required></label><label class="field">状況<textarea name="context" rows="3">${escapeHtml(shelf.context)}</textarea></label><h2 class="section-title">引き継ぐリスト</h2><ul class="revision-list">${shelf.revisions.map((id) => { const revision = revisions.find((item) => item.id === id); return `<li>${ico('BookOpen')}<span>${escapeHtml(revision.title)}</span><small>第${revision.version}版</small></li>`; }).join('')}</ul><p class="meta">全${shelf.revisions.length}件 · 現在の版で固定 · コピー先は公開</p><div class="action-row"><button class="button primary-button" type="submit">コピーして作成${ico('Copy')}</button></div><p id="operation-status" role="status"></p></form>`, shelfSummary());
}
function groupEditor() {
  const original = state.ownGroups.find((item) => item.id === state.group);
  if (!original) return pageHead('自作グループを編集') + '<div class="empty-state"><p>まだ自作のグループがありません</p>' + link('fork', 'グループをコピーして作る', 'Copy', 'primary-button') + '</div>';
  if (!state.groupDraft || state.groupDraft.id !== original.id) state.groupDraft = structuredClone(original);
  const shelf = state.groupDraft;
  return crumbs(`group/${shelf.id}`, shelf.title) + pageHead('グループを編集') + split(`<form id="group-form"><label class="field">グループ名<input name="title" value="${escapeHtml(shelf.title)}" required></label><label class="field">状況<textarea name="context" rows="3">${escapeHtml(shelf.context)}</textarea></label><h2 class="section-title">配置するリスト</h2><ul class="revision-list editable">${shelf.revisions.map((id, index) => { const revision = revisions.find((item) => item.id === id); return `<li><span>${escapeHtml(revision.title)}<small>第${revision.version}版</small></span><div class="row-tools">${tool(`up:${index}`, `${index + 1}件目を上へ`, 'ArrowLeft')}${tool(`down:${index}`, `${index + 1}件目を下へ`, 'ArrowRight')}${tool(`unplace:${index}`, `${index + 1}件目を除外`, 'X')}</div></li>`; }).join('')}</ul><label class="field">公開リストを追加<select name="revision"><option value="">選択する</option>${revisions.filter((item) => !shelf.revisions.includes(item.id)).map((item) => `<option value="${item.id}">${escapeHtml(item.title)} / 第${item.version}版</option>`).join('')}</select></label>${command('place-revision', '選んだリストを追加', 'Plus', 'plain')}<div class="action-row"><button class="button primary-button" type="submit">変更を保存</button></div><p id="operation-status" role="status"></p></form>`, `<aside class="support"><h2>公開範囲</h2><p>みんなに公開</p><small>編集できるのは自分だけ</small><h2>本文</h2><p>配置済みの公開版を使用</p></aside>`);
}
function historyScreen(detail = false) {
  if (detail) return crumbs('history', '完了履歴') + pageHead(escapeHtml(completed.title), '2026年9月2日 完了') + split(`<h2 class="section-title">実際に完了したタスク</h2>${listTasks(completed.tasks, true)}<div class="action-row">${command('from-history', '再利用用に整える', 'ArrowRight', 'primary-button')}</div>`, `<aside class="support"><h2>今回の記録</h2><p>引っ越し日 2026年8月30日</p><small>${completed.tasks.length}件完了</small></aside>`);
  const item = `<article class="history-item"><p class="date-label">2026年9月2日</p><h2><a href="#history-detail">${escapeHtml(completed.title)}</a></h2><p class="meta">${completed.tasks.length}件完了</p>${listTasks(completed.tasks.slice(0, 3), true)}<div class="item-footer">${link('history-detail', '完了内容を見る', 'ArrowRight')}</div></article>`;
  return pageHead('完了履歴') + (state.concept === 'c' ? `<div class="browser-layout"><div>${item}</div><section class="selection-detail"><h2>${completed.title}</h2>${listTasks(completed.tasks, true)}${command('from-history', '再利用用に整える', 'ArrowRight', 'primary-button')}</section></div>` : `<div class="history-list">${item}</div>`);
}
function privateScreen() {
  return pageHead('自分のCuebook', '', link('history', '完了履歴から整える', 'History')) + split(`<div class="section-label"><span>暮らし</span><span class="private-label">${ico('LockKeyhole')}自分だけ</span></div><article class="private-item"><div class="book-symbol">${ico('BookOpen')}</div><h2><a href="#editor">${escapeHtml(state.draft.title)}</a></h2><p class="meta">${state.draft.tasks.length}タスク · ${state.saved ? '保存済み' : '未保存'}</p>${listTasks(state.draft.tasks.slice(0, 3))}<div class="item-footer">${link('editor', '内容を整える', 'ArrowRight')}${link('publish', '公開内容を確認', '', 'plain')}</div></article>`, `<aside class="support"><h2>自分の棚</h2><a class="shelf-link" href="#private">${ico('FolderClosed')}暮らし <small>1</small></a>${state.ownGroups.length ? `<h2>自作の公開グループ</h2>${state.ownGroups.map((item) => `<a class="shelf-link" href="#group/${item.id}">${ico('Library')}${escapeHtml(item.title)}</a>`).join('')}` : ''}</aside>`);
}
function editorScreen() {
  if (state.concept === 'a') return revisedEditor();
  return crumbs('private', '自分のCuebook') + pageHead('再利用用に整える', '完了履歴から · 自分だけ', `<span class="save-state">${state.dirty ? '未保存' : '保存済み'}</span>`) + split(`<form id="editor-form"><label class="field">リスト名<input name="title" id="draft-title" value="${escapeHtml(state.draft.title)}" required></label><div class="section-label"><span>再利用するタスク</span><span>基準日からの日数</span></div><div class="edit-list">${state.draft.tasks.map((task, index) => `<div class="edit-row"><textarea rows="1" data-task="${index}" aria-label="タスク${index + 1}の内容" required>${escapeHtml(task.title)}</textarea><input type="number" step="1" data-offset="${index}" aria-label="タスク${index + 1}の相対日" value="${task.day}" required>${tool(`remove-task:${index}`, `タスク${index + 1}を除外`, 'X')}</div>`).join('')}</div>${command('add-task', 'タスクを追加', 'Plus', 'plain')}<div class="action-row"><button class="button primary-button" type="submit">自分用に保存</button></div><p id="operation-status" role="status"></p></form>`, `<aside class="support"><h2>保存先</h2><p class="private-label">${ico('LockKeyhole')}暮らし / 自分だけ</p><h2>グループに公開</h2>${link('publish', '公開内容を確認', 'ArrowRight')}<p class="meta">公開は別途確認</p></aside>`);
}
function publishScreen(error = false) {
  return crumbs('editor', '自分用の内容') + pageHead('公開内容を確認', 'この内容を、他の人も再利用できるようにします') + split(`<h2>${escapeHtml(state.draft.title)}</h2>${listTasks(state.draft.tasks)}<p class="meta">自分用の原本は残ります</p>`, `<aside class="support"><form id="publish-form"><h2>公開先</h2><label class="field">グループ<select id="public-target" name="target"><option value="new">新しいグループ</option>${state.ownGroups.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join('')}</select></label><div id="new-group-fields"><label class="field">グループ名<input name="title" value="猫と暮らす家の準備" required></label><label class="field">状況<textarea name="context" rows="3">猫2匹と暮らす家の、引っ越しや外出の準備</textarea></label></div>${error ? '<div class="error" role="alert"><strong>公開できませんでした</strong><p>自分用の保存内容は残っています。</p></div>' : ''}<button class="button primary-button" type="submit">${error ? 'もう一度公開する' : 'この内容を公開'}</button><p id="operation-status" role="status"></p></form></aside>`, 'publish-workspace');
}
function completeScreen(published = false) {
  return pageHead(published ? '公開しました' : 'アプリで使う準備ができました') + `<div class="completion"><h2>${escapeHtml(published ? state.draft.title : selectedRevision().title)}</h2><p>${published ? '自分用の原本も保存されています。' : '日程設定済みのタスクリストを、アカウントに保存しました。'}</p><div class="completion-summary"><span>${published ? '公開先' : '引っ越し日'}</span><strong>${published ? escapeHtml(selectedGroup().title) : state.anchor}</strong></div><div class="action-row">${published ? link(`group/${state.group}`, '公開先を見る', 'ArrowRight', 'primary-button') + link('private', '自分のCuebook', 'BookOpen') : link('apps', 'アプリで開く', 'ArrowUpRight', 'primary-button') + link('results', '探すに戻る', 'Search')}</div>${!published ? '<p class="meta">端末への反映はアプリ接続時に確認</p>' : ''}</div>`;
}
const views = {
  start: () => `<section class="search-entry">${pageHead('探す', 'みんなが残した、再利用できるタスクリスト')}${searchForm(true)}<img class="entry-mark" src="../../public/brand/mark.png" alt=""><div class="entry-link">${link('apps', 'タスクを管理', 'Smartphone', 'plain')}</div></section>`,
  results: resultsScreen,
  detail: () => crumbs('results', '検索結果') + split(detailContent(selectedRevision()), shelfSummary(relatedShelves(state.selected)[0])),
  schedule: () => scheduleScreen(), synced: () => completeScreen(), group: groupScreen,
  fork: forkScreen, 'group-edit': groupEditor, history: () => historyScreen(), 'history-detail': () => historyScreen(true),
  private: privateScreen, editor: editorScreen, publish: () => publishScreen(), published: () => completeScreen(true),
  account: () => pageHead('アカウントに接続') + `<section class="account-panel"><h2>端末と同じアカウントで</h2><p>${displayText('自分のCuebook')}と参加グループの保存先</p>${command('login', 'Google で続ける', '', 'primary-button')}${link('start', '今は探すだけ', '', 'plain')}<p class="review-note">モック内の接続状態のみ切り替わります。実際のログインは行いません。</p></section>`,
  apps: () => pageHead('タスクを管理') + `<section class="app-handoff"><img src="../../public/brand/icon-192.png" alt="CuckooCue アプリアイコン"><div><h2>CuckooCue</h2><p>Android / iOS</p><p class="meta">${state.synced ? '日程設定済みのタスクリストを同期する地点です。' : 'タスクの作成・実行はアプリへ。'}</p><div class="unavailable">配布先・App Linkは未確認</div><p class="review-note">実在するリンクが未確認のため、ストアURLや端末遷移は捏造せず未接続として表示しています。</p>${link(state.synced ? 'synced' : 'start', '戻る', 'ArrowLeft')}</div></section>`,
  empty: () => pageHead('探す') + searchForm() + `<div class="empty-state"><h2>一致するリストがありません</h2><p>条件を変えて検索</p></div>`,
  'search-error': () => pageHead('探す') + searchForm() + `<div class="error empty-state" role="alert"><h2>検索できませんでした</h2><p>条件は保持しています。もう一度お試しください。</p>${command('retry-search', '再検索', 'Search')}</div>`,
  'sync-error': () => scheduleScreen(true), 'publish-error': () => publishScreen(true),
};
