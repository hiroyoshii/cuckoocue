# Mobile仕上げTodo

2026-09-13。Androidの実装・未コミット差分、iOSの現行コード、Web仕様書の最新追記を確認した残件。古い設計書の「未実装」をそのまま復活させない。

## 固定する前提

- WidgetはRun横断の実行、アプリはRun別の追加・修正。Webは発見・再利用用の編集・公開を担当する。
- 「新しいリストを作る」と「Webで探す」は同格。空・全件完了で開始導線を前面に出す。
- Androidから直接公開させない。完了後の「もう一度使う」と「再利用用に整える→Web」を維持する。
- iOSはAndroidと操作の意味・到達先を揃える。Material部品や可変サイズWidgetをそのまま移植しない。
- 新しいEntity、検索方式、公開方式をこのTodoの名目で追加しない。

## Todo一覧

### M01：アプリ上位の入口を確定する【Android実装済み】

- [x] `表示`タブを廃止し、Widgetプレビュー・文字サイズ・配色をヘッダーのWidget設定アイコンへ移した。
- [x] Androidの`再利用`タブとPrivate Cuebook導線を廃止した。Web ImportはPrivate Cuebookを作らずRunへ直接展開し、履歴からの再利用はWebへ接続する。
- [x] `アーカイブ`タブとRun詳細のアーカイブ操作を廃止した。既存DBフィールドは同期・移行互換として残すが、新しいユーザー操作には露出しない。
- [x] 主画面をRun一覧中心にし、Web探索・新規作成・Widget設定は領域を奪わないアイコンへ整理した。実行中Runがない場合だけWeb探索を中央の主導線にする。
- [x] 完了Runは最新1件だけ一覧末尾に残し、その下からWebの完了履歴へ進める。
- [x] 同じ操作構造をiOSへ反映する。Materialの見た目は移植しない。

完了条件：Androidは達成。iOS反映後、通常利用・設定変更・完了後・Web再利用への入口と戻り先を両OSで説明できる。

根拠：`android/app/src/main/java/app/cuckoocue/MainActivity.kt`のRunListScreen / ListModeTabs / AppearanceSettingsPanel。機能は既存で、主に情報設計の整理。

### M02：iOSのローカル操作・画面を確定したAndroidへ揃える【実装】

- [ ] 一覧の開始2ボタン、空・全件完了状態、指定ブランド画像を反映する。
- [ ] 項目作成だけでなく、既存項目の本文・日付・優先度の修正、完了取消をRun詳細から行えるようにする。
- [ ] M01で決めた設定入口と復元導線を実装する。再利用画面はM01の結論に従い、先回りして増やさない。
- [ ] ローカルの「もう一度使う」をAndroidと同じ意味にする。今回の実装は本文を新Runへコピーし、日付・優先度・完了状態をリセットする。以前の「日付をずらすコピー」案を混ぜない。
- [ ] 設定画面のプレビューを自分の対象Cue・テーマ・文字サイズに追随させる。既存CueWidgetCardを共用し、静的な別見本は作らない。

完了条件：同じデータを使い、一覧→編集→Widget表示設定→完了→再利用／復元を両OSで比較できる。iOSのNavigationStack・sheet・FormとWidget familyは維持する。

根拠：`ios/CuckooCue/MainTabView.swift`はM01でRun一覧中心・Widget設定sheetへ整理済みだが、Run詳細は追加・完了中心。`ios/Shared/CueStore.swift`に項目編集・Run復元・再利用メソッドはまだない。`archivedAt`フィールドがあることを、復元導線が完成済みの根拠にしない。

### M03：iOSを既存Web受渡し契約へ接続する【実装／残件の中では大きい】

- [ ] 既存の本人認証とRun取得APIへ接続し、Webで作ったRunを同一ID・同じ日付で受信する。再度の日程入力や別形式のImportを作らない。
- [ ] 契約に必要なRun／Taskの由来・日程フィールドをApp GroupのJSONモデルへ追加する。iOS専用の新ドメインモデルや、リリース前形式の移行処理は作らない。
- [ ] 受信失敗・再試行・同じリンクの再オープンで重複やローカル編集の上書きを起こさない。
- [ ] 実行結果を既存の本人向け保存経路へ反映し、「再利用用に整える」は同期成功後に対象RunをWebで開く。
- [ ] ログアウト／別アカウントで、別人のローカルRunを送信しないことを確認する。既存Androidの同じ境界も受入で確認し、不備を確認した場合だけ修正する。

完了条件：Web→iOSで同じRunを受信→Widgetで実行→Webの対象履歴／編集へ戻る。実認証・実APIの試験をUIモックの成功で代用しない。

根拠：`ios/Shared/CueStorage.swift`はApp GroupのJSON保存。`MainTabView.swift`のURL処理は`cuckoocue://queue`によるローカルRun遷移だけ。`ios/project.yml`に認証／クラウド連携依存はなく、CueRun/CueTaskにもAndroidの由来フィールドの一部がない。これは確定済み仕様への追随であり、全面的な多端末双方向同期の追加ではない。

### M04：Widget→アプリの往復を両OSで受け入れる【比較・必要箇所のみ修正】

- [ ] 集約表示、Run文脈のfooter、対象Runを開く／一覧を開く、アプリからホームへ戻る操作を同じ表で確認する。
- [ ] iOSでRun指定なしのqueue URLを受けた場合、以前のRun詳細が残らず一覧へ戻れることを確認・修正する。設定タブ選択中からの復帰も含む。
- [ ] 完了・Undo、アプリ終了後の永続化、再表示、自分のCueと設定プレビューの一致を確認する。
- [ ] Androidは実設置寸法、iOSはSmall / Medium / Large（既存Lock Screenも回帰）で、長い本文・複数Run・大きい文字・空状態を撮影する。

完了条件：両OSの操作結果が一致する比較表とCI画像がある。既存Widgetの情報設計を全面的に再レビューし直すタスクにはしない。OS差として残す操作は明記する。

根拠：`docs/android-widget-navigation.md`、`docs/widget-preview-review.md`、`ios/WidgetShared/CueWidgetCard.swift`。iOSの現行onOpenURLはrunIDがある場合だけpathを変更する。

### M05：直近Android変更とWeb接続の最終回帰【検証・反映】

- [ ] 未コミットのAndroidブランド差し替え・開始2ボタン・空／完了状態・テスト・スクショを確認してコミット／pushする。
- [ ] 変更後のAndroid CIを通す。ローカル22件成功をCIやWeb実連携の完了と混同しない。
- [ ] 実Web→Android受信→Widget実行→「再利用用に整える」の往復を現行版で確認する。認証後に要求した履歴／編集へ復帰することも含む。
- [ ] 最新のWeb変更は配備状況を照合する。仕様書の第28〜29節は未配備記録なので、ローカルで見えることを本番反映済みとしない。
- [ ] iOS READMEとProduct Guideの古い説明・画像を現行版へ揃える。特に「アプリ一覧に集約Cueプレビューが出る」というiOS READMEの記述は現行コードと不一致。

完了条件：検証したcommit、配布／配備した版、画像の版が追跡でき、古いスクショを現行仕様として見せない。

### M06：配布入口の接続【公開時】

- [ ] Android／iOSの実配布URLが決まったら、Webの既存`NEXT_PUBLIC_ANDROID_APP_URL` / `NEXT_PUBLIC_IOS_APP_URL`へ設定する。
- [ ] 配布リンク・QR→インストール→WebからのRun受信までを端末で確認する。URL未決の間は「準備中」を維持する。

完了条件：利用者が実際に入手して一連の操作を開始できる。新しい配布案内ページは作らない。

## 順番と対象外

M01 → M02・M03 → M04 → M05の最終受入 → M06。M05のAndroid差分整理は先に実施可能。

残りは6つの作業群であり、6個の小修正という意味ではない。Android／Widget／Webの新機能追加は少ないが、iOSのWeb接続を見た目の差し替えとして見積もらない。

今回増やさない：Observation、自動改善、ランキング／SNS、CuebookやRevisionの再設計、全面的な多端末同期、AIによる新しい提案機能。Web検索品質の既知の懸念（仕様書G01/C08）は消えたわけではないが、このMobile UI仕上げとは別枠で維持する。
