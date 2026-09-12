const screens = window.conceptCatalog.screens;
const imageRoot = '../../../docs/review-screenshots/web/reuse-flow';
document.querySelector('#jump').innerHTML = screens.map(([id, title]) => `<option value="${id}">${title}</option>`).join('');
const screenshot = (id, label) => `<figure><a href="${imageRoot}/${id}-desktop.png" target="_blank" rel="noopener"><img src="${imageRoot}/${id}-desktop.png" alt="${label} デスクトップ幅1440px" loading="lazy"></a></figure>`;
const extras = {
  schedule: [['schedule-edited','今回だけの本文・日程・優先度を調整']],
  synced: [['android-received','同じRunをAndroidで受信（再現）'],['handoff-failed','アプリを開けない場合も保存内容は保持']],
  group: [['group-joined','参加後のサイドバー']],
  'history-detail': [['completed-history','Webで作成した予定の完了履歴']],
  private: [['library-saved','履歴から原本を保存し、もう一度使う']],
  editor: [['original-edited','完了履歴を材料に原本を編集']],
  publish: [['publication-confirm','日程・優先度を含む公開確認']],
};
document.querySelector('#gallery').innerHTML = screens.map(([id, title]) => `<section class="screen-row" id="${id}"><h2>${title}<a href="app.html?concept=a&screen=${id}">この画面を操作</a></h2><a href="${imageRoot}/${id}-mobile.png">スマホ幅の画像</a>${screenshot(id, title)}${(extras[id] || []).map(([name,label]) => `<div class="extra-state"><h3>${label}</h3>${screenshot(name,label)}</div>`).join('')}</section>`).join('');
document.querySelector('#jump').addEventListener('change', (event) => document.getElementById(event.target.value).scrollIntoView());
