# Mobile仕上げTodo

2026-09-13作成、2026-09-22更新。Android・iOSの現行コードとCIを基準に残件を記録する。古い設計書の「未実装」をそのまま復活させない。

## 固定する前提

- WidgetはRun横断の実行、アプリはRun別の追加・修正。Webは発見・再利用用の編集・公開を担当する。
- 「新しいリストを作る」と「Webで探す」は同格。空・全件完了で開始導線を前面に出す。
- Androidから直接公開させない。完了後の「もう一度使う」と「再利用用に整える→Web」を維持する。
- iOSはAndroidと操作の意味・到達先を揃える。Material部品や可変サイズWidgetをそのまま移植しない。
- 新しいEntity、検索方式、公開方式をこのTodoの名目で追加しない。

## iOS上位UIの判断記録（2026-09-22）

Run一覧・Task一覧の**操作構造と情報密度はAndroidに揃え、部品とOS固有の挙動はiOSに合わせる**。Run行にTaskの内容を見せ、Run詳細でTaskの追加・本文編集・完了・優先度・開始日・期限・並べ替えを連続して扱えるようにする。NavigationStack、List、Menu、Toggle、DatePicker、swipe action等はiOSのものを使い、独立した一時操作に限ってsheetを使う。「iOSらしさ」は日常的な編集を別sheetへ分離する理由にはならない。

以前のsheet中心の判断は誤りだった。旧Todoの「NavigationStack・sheet・Formを維持」を、各Task編集をsheetに送る制約として読み過ぎた。また、値を編集できるかだけをE2Eで確認し、一覧で実際のTaskを把握できるか、複数Taskを続けて編集できるか、必要なタップ数がAndroidと乖離しないかを受入条件にしていなかった。iOSのプラットフォーム制約を根拠にした設計ではない。今後は「ネイティブ部品の使用」と「操作効率」を別々に評価し、両OSの同一シナリオ・スクリーンショットで確認する。

M02のインライン編集は`670dec3`、`b1025da`、`0f26beb`で`main`へ反映した。UI・モデルテストとアプリスクリーンショットは[CI #57](https://github.com/hiroyoshii/cuckoocue/actions/runs/35522573098)で成功。[CI #58](https://github.com/hiroyoshii/cuckoocue/actions/runs/35523506229)ではアプリ側は成功したが、実ホーム画面Widgetの自動配置テストで全体が失敗した。最終コミットのCI全体を成功扱いしない。

## Todo一覧

### M01：アプリ上位の入口を確定する【両OS実装済み】

- [x] `表示`タブを廃止し、Widgetプレビュー・文字サイズ・配色をヘッダーのWidget設定アイコンへ移した。
- [x] Androidの`再利用`タブとPrivate Cuebook導線を廃止した。Web ImportはPrivate Cuebookを作らずRunへ直接展開し、履歴からの再利用はWebへ接続する。
- [x] `アーカイブ`タブとRun詳細のアーカイブ操作を廃止した。既存DBフィールドは同期・移行互換として残すが、新しいユーザー操作には露出しない。
- [x] 主画面をRun一覧中心にし、Web探索・新規作成・Widget設定は領域を奪わないアイコンへ整理した。実行中Runがない場合だけWeb探索を中央の主導線にする。
- [x] 完了Runは最新1件だけ一覧末尾に残し、その下からWebの完了履歴へ進める。
- [x] 同じ操作構造をiOSへ反映する。Materialの見た目は移植しない。

実装上の完了条件：通常利用・設定変更・完了後・Web再利用への入口と戻り先を両OSで説明できる。実Webとの往復確認はM03／M05に残す。

根拠：`android/app/src/main/java/app/cuckoocue/MainActivity.kt`のRunListScreen / ListModeTabs / AppearanceSettingsPanel。機能は既存で、主に情報設計の整理。

### M02：iOSのローカル操作・画面を確定したAndroidへ揃える【実装済み】

- [x] 一覧の開始2ボタン、空・全件完了状態、指定ブランド画像を反映する。Run行にはAndroid同様、件数だけでなく未完了Taskのプレビューを表示する。
- [x] 項目作成だけでなく、既存項目の本文・日付・優先度の修正、完了取消をRun詳細から行えるようにする。高頻度操作は別sheetへ送らず行内で完結させる。
- [x] M01で決めた設定入口と復元導線を実装する。再利用画面はM01の結論に従い、先回りして増やさない。
- [x] ローカルの「もう一度使う」をAndroidと同じ意味にする。今回の実装は本文を新Runへコピーし、日付・優先度・完了状態をリセットする。以前の「日付をずらすコピー」案を混ぜない。
- [x] 設定画面のプレビューを自分の対象Cue・テーマ・文字サイズに追随させる。既存CueWidgetCardを共用し、静的な別見本は作らない。

完了条件：同じデータを使い、一覧→編集→Widget表示設定→完了→再利用／復元を両OSで比較できる。iOSのNavigationStackとWidget familyは維持し、sheet／Formは独立した一時操作にだけ使う。Run名、Task追加・本文・日付・優先度、並べ替えはRun詳細内で操作できる。

実装箇所：`ios/CuckooCue/MainTabView.swift`、`RunDetailView.swift`、`InlineTaskRow.swift`、`ios/Shared/CueStore.swift`。最終版のアプリ画像はCI #58の`cuckoo-cue-ios-e2e-screenshots` artifactにある。実機での触り心地の確認はM05の最終受入に含める。

### M03：iOSを既存Web受渡し契約へ接続する【実装済み・実接続受入は未完】

- [x] Firebase本人認証と既存Run取得APIへ接続し、WebのRunを同一ID・同じ日付で受信する。
- [x] 契約に必要なRun／Taskの由来・日程フィールドをApp GroupのJSONモデルへ追加する。リリース前形式の移行処理は追加しない。
- [x] 受信失敗・再試行・同じリンクの再オープンを扱い、ローカルRunを安易に上書きしない。
- [x] ローカル変更をETag付きで本人向け保存経路へ同期し、「再利用用に整える」は同期成功後に対象RunをWebで開く。
- [x] iOSでは同期メタデータに所有者を固定し、ログアウト／別アカウントでそのRunを再帰属させないガードを実装した。
- [ ] 実認証・実APIを使い、Web→iOS→Widget→Webの往復と失敗・再試行・別アカウント境界を実機／配布ビルドで受け入れる。Android側の同じ境界も確認する。

完了条件：Web→iOSで同じRunを受信→Widgetで実行→Webの対象履歴／編集へ戻る。実認証・実APIの試験をUIモックの成功で代用しない。

実装箇所：`ios/CuckooCue/RunAuthentication.swift`、`RunTransfer.swift`、`RunTransferController.swift`、`ios/Shared/CueSyncMetadata.swift`、`CueModels.swift`。契約の単体テストは`ios/CuckooCueTests/RunTransferTests.swift`。これは確定済み仕様への追随であり、全面的な多端末双方向同期の追加ではない。モックを使ったテスト成功を、実認証・実APIの受入完了と混同しない。

### M04：Widget→アプリの往復を両OSで受け入れる【比較・必要箇所のみ修正】

- [ ] 集約表示、Run文脈のfooter、対象Runを開く／一覧を開く、アプリからホームへ戻る操作を同じ表で確認する。
- [x] iOSでRun指定なしのqueue URLを受けた場合、NavigationStackのpathを空に戻す処理を実装した。
- [ ] 実WidgetからRun指定あり／なしのqueue URLを開き、Run詳細／一覧への復帰を確認する。Widget設定sheet表示中からの復帰も含む。
- [ ] 完了・Undo、アプリ終了後の永続化、再表示、自分のCueと設定プレビューの一致を確認する。
- [ ] Androidは実設置寸法、iOSはSmall / Medium / Large（既存Lock Screenも回帰）で、長い本文・複数Run・大きい文字・空状態を撮影する。

完了条件：両OSの操作結果が一致する比較表とCI画像がある。既存Widgetの情報設計を全面的に再レビューし直すタスクにはしない。OS差として残す操作は明記する。

根拠：`docs/android-widget-navigation.md`、`docs/widget-preview-review.md`、`ios/WidgetShared/CueWidgetCard.swift`。iOSのonOpenURLはrunIDなしでpathを空に戻すが、実Widgetからの復帰は未受入。

### M05：直近Android変更とWeb接続の最終回帰【検証・反映】

- [x] 当初の未コミットAndroid差分はコミット済みで、2026-09-22時点のAndroid作業ツリーに未コミット差分はない。
- [ ] 現行Android版のCIを成功させる。[直近のAndroid Widget CI](https://github.com/hiroyoshii/cuckoocue/actions/runs/35486222694)はActions budgetによりジョブが開始されず失敗。コードの失敗と断定せず再実行する。ローカルテスト成功をCIやWeb実連携の完了と混同しない。
- [ ] 実Web→Android受信→Widget実行→「再利用用に整える」の往復を現行版で確認する。認証後に要求した履歴／編集へ復帰することも含む。
- [ ] 最新のWeb変更は配備状況を照合する。仕様書の第28〜29節は未配備記録なので、ローカルで見えることを本番反映済みとしない。
- [ ] Product Guideの古いiOS説明・画像を現行版へ揃える。現状は「項目追加シート」「iOSアプリで完了取消は未実装」「iOSはWeb受渡し未接続」と記述しており、コードと不一致。iOS READMEのWeb受渡し説明は更新済み。
- [ ] 最新のiOS UIを含む版でE2E全体を再び緑にし、実機の連続編集とTestFlight配布を確認する。TestFlight uploadの[前回成功](https://github.com/hiroyoshii/cuckoocue/actions/runs/35500625991)はインライン編集導入前のcommitなので、新UIの配布証拠ではない。

完了条件：検証したcommit、配布／配備した版、画像の版が追跡でき、古いスクショを現行仕様として見せない。

### M06：配布入口の接続【公開時】

- [ ] Android／iOSの実配布URLが決まったら、Webの既存`NEXT_PUBLIC_ANDROID_APP_URL` / `NEXT_PUBLIC_IOS_APP_URL`へ設定する。
- [ ] 配布リンク・QR→インストール→WebからのRun受信までを端末で確認する。URL未決の間は「準備中」を維持する。

完了条件：利用者が実際に入手して一連の操作を開始できる。新しい配布案内ページは作らない。

## 順番と対象外

M01・M02・M03の実装 → M03実接続受入とM04 → M05の最終回帰・配布確認 → M06。M03の実認証試験はM04／M05と並行してよい。

残りはM03の実接続受入、M04のWidget往復比較、M05のCI・実機・Web往復・ドキュメント回帰、M06の配布入口である。M01・M02・M03のコード実装は完了しているが、実サービス・実機の確認が終わるまで製品としての完了とはしない。

今回増やさない：Observation、自動改善、ランキング／SNS、CuebookやRevisionの再設計、全面的な多端末同期、AIによる新しい提案機能。Web検索品質の既知の懸念（仕様書G01/C08）は消えたわけではないが、このMobile UI仕上げとは別枠で維持する。
