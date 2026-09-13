# Widget表示設定の操作レビュー

## 目的・受入条件

自分のCueで文字の読みやすさと表示量を確かめ、ホーム画面のWidgetへ適用する。Run詳細で設定を要求せず、一覧の「表示」から設定を開く。

- 自分の`widgetCues`を使う。未完了・対象条件・並び順は実Widgetと同じRoom projection。
- Compact / Standard / Large、Widgetテーマ、本体に追随する設定の変更でプレビューが再描画される。
- 設定保存は既存AppearanceRepository、実Widget更新は既存WidgetRedrawScheduler。プレビュー専用の設定値を作らない。
- 未設置でも設置後でも確認できる。追加ボタンだけ未設置時に出る。
- プレビューのタップではタスク完了・Run遷移・footer状態の変更を行わない。
- 空状態や描画失敗を固定のサンプル画像で隠さない。

## レビューで発見した不一致

旧画面は設置用の固定画像を表示設定へ移しただけだった。文字サイズ・テーマ・自分のタスクに追随せず、設定結果を確認する目的を満たさない。未設置時しか出ないことも、設置後の調整と矛盾した。

修正は別のCompose版Widgetを作るのではなく、Glance 1.2.0のGlanceRemoteViewsから実Widgetの`CuckooCueWidgetContent`を呼ぶ。配色・行高・文字サイズ・タイトル省略・footerの描画を共通化し、表示例の画像は呼び出さない。タッチと子孫へのフォーカス・アクセシビリティ操作を遮断し、読み上げ用に内容の要約を付ける。

## 操作と結果

| 操作 | プレビュー | 実データ・実Widget |
| --- | --- | --- |
| 一覧→表示 | 現在のCueを全リストで表示 | Runを変更しない |
| 文字サイズを変更 | 同じ枠で字の大きさ・行高・省略位置が変わる | 設定を保存し設置済みWidgetを更新 |
| WidgetのLight / Dark | 共通の配色が切り替わる | 同上 |
| Followで本体テーマを変更 | 本体テーマの解決結果に追随 | 同上 |
| 設定を閉じて再度開く | 保存済みの設定で表示 | 値をリセットしない |
| タスクの編集・完了 | RoomのCue更新を反映 | 対象外になったCueは消える |
| プレビューをタップ | 操作しない | タスクを変更しない |
| Widgetを追加 | プレビューは残り、追加ボタンだけ消える | OSの設置確認を使用 |

## 同一としないもの

未設置時は設定画面の幅×180dpの参考表示。設置済みならAppWidgetManagerのorientation別寸法（Glance Exactと同じminWidth/maxHeightまたはmaxWidth/minHeight）で描画する。複数設置時は寸法の参照先を切り替えられる。枠より大きい場合は内部のレイアウト寸法を変えず、描画全体を縮小する。個別WidgetのRun絞り込み・スクロール位置・Undo状態はコピーしない。全リストの先頭を確認することを画面内に明示する。操作の実行場所はホーム画面に限定する。

## 検証記録

初回の実画面ではfooterだけ描かれ、Cue一覧が空白だった。RemoteViewsのcollection adapterにはAppWidgetHostViewが必要だったため、通常のFrameLayoutから置換して解消した。

次に連続操作でアプリ自身の入力応答停止を観測。ANR traceではComposeの一覧計測中であり、プレビュー生成だけが原因と断定しない。UIスレッド上のGlance生成をDefault dispatcherへ移動し、同一RemoteViewsの無用な再適用を避けた。変更後の連続サイズ切替3往復と閉じる→再表示を含むUI試験が成功した。端末全般での性能保証とはしない。

ホーム画面との比較では、固定幅プレビューで全文が見えても細い実Widgetでは省略されることを確認。注意書きだけでは設定判断に不十分なため、設置済み寸法を使うよう再修正した。

## 最終確認（2026-09-13）

Android 14 / API 34のローカルEmulator、設置寸法220×193dpで確認。以下はCI画像ではない。

- debug APK / androidTest APKビルド成功。
- `CompletedReuseUiTest`実行成功：`OK (1 test)`、62.809秒。再利用に加え、Light→Dark、Compact→Large、Cue完了による更新、プレビュータップ時のデータ不変、連続切替3往復、閉じる→再表示を検証。
- 実Launcherへの設置、設置後もプレビューが残ること、Dark / Largeの実Widgetへの反映を実操作で確認。
- スクリーンショットはテスト用にRoomへ登録したCueと端末内の既存Cueを表示。製品側に固定サンプルは入れていない。

| 状態 | 証跡 |
| --- | --- |
| Compact：同一枠で本文5行 | [compact.png](review-screenshots/android/live-widget-preview/compact.png) |
| Large：本文4行、次行の一部 | [large.png](review-screenshots/android/live-widget-preview/large.png) |
| Darkへ切替 | [dark.png](review-screenshots/android/live-widget-preview/dark.png) |
| 先頭Cueを完了し一覧から消える | [data-updated.png](review-screenshots/android/live-widget-preview/data-updated.png) |
| 閉じて再度開く | [reopened.png](review-screenshots/android/live-widget-preview/reopened.png) |
| 既存Cueで設置寸法を確認 | [installed-settings.png](review-screenshots/android/live-widget-preview/installed-settings.png) |
| 同じ既存Cueの実ホームWidget | [home-dark-large.png](review-screenshots/android/live-widget-preview/home-dark-large.png) |

## UIとしての判断と残る限界

設定と結果が同じ画面にあり、日常のRun管理画面を占有しない。既存UIの外観を維持しつつ、frontend-ui-engineering skillの操作と結果の近接・誤操作防止の観点を適用した。別実装の見本ではなく実描画を共用することで、今後Widgetだけが更新されて見本が古くなるリスクも減らした。

今回の寸法ではテーマ・文字サイズとプレビューを同時に確認でき、「自分のCueを読みやすく調整する」という目的は満たす。ただし全画面・全端末で最善と断定しない。

- 大きいWidgetは全体を縮小するため、表示量・省略位置の確認には使えるが実寸の読みやすさはホーム画面で最終確認する。
- footerの長いRun名の省略や次行の一部も実描画のまま表示する。プレビューだけで整形して隠さない。実Widgetの情報設計を変更したという意味ではない。
- プレビューは読み取り専用。スクロール・Run絞り込み・Undoの操作確認には使えない。
- 複数設置時の寸法選択、横画面、大きなOS文字設定、描画失敗時の再試行は今回の実操作試験では未確認。
