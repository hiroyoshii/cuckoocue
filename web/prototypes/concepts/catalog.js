// Review manifest, not application data.
window.conceptCatalog = {
  concepts: [
    { id: 'a', name: 'A · リスト中心（採用）', description: '本文を読み、1画面ずつ進む。関連グループへのリンクを開き、Cuebook一覧とともに参加ボタンを表示。', tradeoff: '迷いにくい一方、複数候補を見比べるには往復が必要。' },
    { id: 'b', name: 'B · 本棚中心', description: 'Cuebookを並べて見比べる。グループと自分の棚を視覚的につなぐ構成。', tradeoff: '発見と再訪に強い一方、長いリストは詳細を開いて読む。' },
    { id: 'c', name: 'C · 一覧＋詳細', description: '一覧を残して詳細を切り替える。選択と確認を同じ場所で進める構成。', tradeoff: '比較と連続操作が速い一方、初見の情報量が多い。スマホは1列に切り替える。' },
  ],
  screens: [
    ['start', '01 検索の入口'], ['results', '02 検索結果'], ['detail', '03 公開リスト詳細'],
    ['schedule', '04 今回使う内容・日程'], ['synced', '05 保存後・Android受渡し'], ['group', '06 参加グループ詳細'],
    ['fork', '07 グループ全件コピー'], ['group-edit', '08 自作グループ編集'],
    ['history', '09 完了履歴一覧'], ['history-detail', '10 完了内容'],
    ['private', '11 自分のリスト'], ['editor', '12 再利用用の編集'],
    ['publish', '13 公開内容・公開先確認'], ['published', '14 公開完了'],
    ['account', '15 アカウント接続'], ['apps', '16 アプリへの導線'],
    ['empty', '17 検索0件'], ['search-error', '18 検索失敗'],
    ['sync-error', '19 リスト保存失敗'], ['publish-error', '20 公開失敗'],
  ],
};
