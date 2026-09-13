# Android Widgetとアプリの接続

2026-09-13。WidgetはRun横断の実行、アプリはRun別の追加・修正を担当する。

| 対象 | 操作結果 |
| --- | --- |
| Cue行全体 | 完了。既存のタップ領域を維持 |
| footerのRun名 | Runで絞り込み。再タップで解除 |
| footerの送り・Undo | 既存どおり |
| 背景・余白 | アプリのトップへ。Run選択状態で遷移先を変えない |
| 絞り込み中の上端「Run名 ↗」 | ローカルの該当Run詳細へ |

集約表示には見出しを追加しない。絞り込み時だけ48dpの見出しを一覧の先頭に置き、長いRun名は1行に収め、矢印の領域を残す。footerのRun名を減らさず、Cue本文も横に圧縮しない。最小高さ110dpでは固定見出しとfooterだけでCue領域がほぼなくなるため、見出しはCueと一緒にスクロールする。footerは固定のままとする。

Widgetからの起動はWeb Importと別のローカル遷移。ログインやネットワーク受信を要求しない。アプリが既にRun詳細・再利用画面を開いている場合も、トップ指定ではそれらの選択を解除する。

Cue一覧の空き領域はListViewに吸収されるため、一覧の高さを「内容の高さ」と「実サイズからfooter・余白を引いた高さ」の小さい方に制限する。残りは背景へタップが届く余白とする。SizeMode.Exactで実サイズを取得し、最小サイズで計算して途中の行を切らない。実機相当の検証では、外周だけでなく一覧下の中央余白からもトップへ戻ることを確認する。

撮影中に見つかった外観設定の反映漏れも修正する。設定はWidgetセッションの初回取得で固定せずFlowを監視し、テーマ・文字サイズ変更を同じWidgetへ反映する。見出しの操作検証は、装飾の矢印文字ではなく「Run名をアプリで開く」というアクセシビリティラベルを使用する。

固定footerはRemoteViewsツリー上で一覧より前に構築し、画面では下端に配置する。外観変更時の再適用で、footerのView IDが一覧内の再利用Viewへ解決され、表示やタップ先が崩れる現象を防ぐ。見出しとCueには異なる安定したitem IDを付ける。

検証はスクリーンショットだけでなく、実際にfooterで絞る→見出しを押す→該当Runに到達→ホームへ戻る→余白を押す→トップに到達→絞り込み解除、の順で行う。既存の行完了・Undoの検証も継続する。

## 検証記録

2026-09-13、Android 14のローカルEmulatorで、テーマ・文字サイズ切替後の見出し、行完了、Undo、Run詳細への遷移、一覧下の余白からトップへの遷移を確認した。アプリをforce-stopした後も見出しから該当Runへ起動できる。CuckooDaoInstrumentedTestとRunTransferContractInstrumentedTestは計23件成功。

CIの撮影はAndroid 15 / Pixel 6プロファイル。狭幅・低高さは画面サイズ／密度を変更する試験であり、全Launcherや全Widgetリサイズ寸法での検証を意味しない。通常の集約表示には見出しを追加せず、絞り込み時だけ48dpを使う。長いCue本文の省略は既存仕様のままで、この変更では行の横幅を減らさない。

CI画像のレビューで、以前の固定座標による完了・Undo試験が実際には余白を押していたことを発見した。完了対象と「戻す」の表示位置を取得して操作し、Undo表示の出現・消失を必須条件に変更した。footer送りの検証には複数Runを使い、存在する「›」を押す。CI成功だけでなく、画像と実操作後の状態を照合する。

### 画像の確認箇所

| 画像 | 確認すること |
| --- | --- |
| [集約表示](review-screenshots/android/multi-run-footer-context.png) | 常時見出しを置かずCue領域を維持 |
| [Run絞り込み](review-screenshots/android/navigation-filtered-run.png) | Run名・開く矢印と、固定footerの役割分離 |
| [ダーク・大きい文字](review-screenshots/android/navigation-filtered-dark-large.png) | 外観設定の即時反映、見出し・Cueの表示維持 |
| [狭幅](review-screenshots/android/resize-filtered-narrow-before-scroll.png) | 開く矢印が残る。既存の本文・footer省略はあり |
| [低高さ](review-screenshots/android/resize-filtered-short-before-scroll.png) | 見出し・Cue・footerが重ならない |
| [Run詳細](review-screenshots/android/navigation-open-run.png) | Widgetで選んだRunへログインなしで到達 |
| [中央余白からトップ](review-screenshots/android/navigation-central-blank-top.png) | 直前にRun詳細を開いていてもトップへ戻る |
| [完了直後](review-screenshots/android/after-row-tap-complete.png) | 完了した行が消え、footerへUndoが出る |
| [Undo直後](review-screenshots/android/after-undo-tap.png) | Cueが復帰しUndoが消える |

## Androidアプリ側の入口と戻り先

2026-09-13追補。未設置時のみ、実行リスト一覧とRun詳細に固定画像の「表示例」と「ホーム画面にWidgetを追加」を表示し、OSの設置確認へ渡す。表示例はCIの `multi-run-footer-context.png`（commit f8a56a9）のWidget部分を切り出した同梱画像であり、実データ・設定・テーマには追随しない。専用画面、別のWidget描画実装、自動生成・更新処理は持たず、用途が伝わらなくなる変更時だけ手動差し替えする。対応しないLauncherでは手動設置手順を案内する。アプリ復帰時に設置状態を再確認し、設置後は表示例も追加ボタンも出さない。

Run詳細の「閉じる」は「アーカイブ」に変更する。確認で、一覧とWidgetから外れること、内容は削除しないことを明示する。取消時は無変更。リスト一覧の「アーカイブ」から復元すると、同じRun ID・Task・日付・完了状態を保持して詳細を開く。Widget対象の未完了Cueのみ表示を再構築する。既存archived_atを利用するため、テーブル追加・migrationは不要。復元は既存Run同期へ渡す。

「表示」はリスト末尾への設定追加ではなくModalBottomSheetを即時表示する。外観設定の保存先やWidgetの表示仕様は変えない。

「完了履歴をWebで見る」は、未ログインなら認証→同じRunを同期→元のRunのWeb履歴を開く、を一つの要求として処理する。取消・認証失敗・同期失敗ではWebを開かず、再操作可能とする。連打で認証を重複起動しない。端末でのプロセス終了をまたぐ要求の自動再開は行わない。

撮影追加: app-widget-install-entry / app-widget-install-confirmation / app-display-sheet / app-archive-confirmation / app-archive-list / app-archive-restored。認証継続は依存処理を差し替えた計装テストで順序と失敗時の停止を検証し、実Googleアカウントの認証成功を模擬テストの成功と混同しない。

## Webとの責務・接続残件（2026-09-13再照合）

現行の[Web仕様](web-experience-spec.md)第1・16・17節を基準にする。「Androidで再利用リストを整え、直接公開APIを新契約へ接続することが次の主タスク」という整理は撤回する。

- Android/Widget: 一からのタスク作成、今回のRunの日常管理・実行・完了。完了結果を同期し、同じRun IDのWeb履歴へ渡す。
- Web: 完了履歴のタスクを選び、再利用用の内容を整え、私的原本を保存し、必要な場合だけ公開内容を確認してShelfへ置く。検索・借用時の日程設定もWebで行う。
- WebからAndroid: 保存済みRun IDを渡し、本人の同じRunを受信する。原本の編集や日程再入力をAndroidでやり直させない。
- Web履歴の「そのまま再利用」は、日付・優先度をクリアした新Runを作る別経路。「再利用用に整える」を必須にしない。

Web仕様には原本をモバイルでも取得・編集する将来契約もある。「再利用用編集はWebが主導線」と「Androidの原本編集をすべて廃止する」は同義ではない。

| 残件 | 根拠と対応範囲 |
| --- | --- |
| Android旧直接公開UIの扱い | `MainActivity.PublishCuebookDialog`と`PublicShelfClient.publishCuebook`はローカルsnapshotを直接送信する。Webの`publish-cuebook.tsx`は保存済み原本と`expected_source_updated_at`等を使う。旧ボタンをそのまま新APIへ適合させるのではなく、Webの編集・保存・公開確認を主導線として、旧導線を退避/置換する範囲を決める。未同期ローカル原本をWebで開けるとは扱わない |
| 実認証・配備後の一周 | 検証環境ではWeb日程設定→同じRun受信→Android完了→同期→Web履歴を確認済み（Web仕様第16節）。本番配備、実Googleアカウント、物理端末、取消・再試行の受入は別途必要 |
| 原本共有とRun同期の区別 | AndroidのPrivate CuebookとWeb原本の共有は未完。既存Runの他端末更新・競合・アカウント別ローカル表示・削除伝播も別残件。新規Run受信の成功を完全同期の成功と呼ばない |
| アプリ未設置時の配布入口 | Web仕様第21節で配布URL未確定のため保留。URLを推測して追加しない |

この再照合では製品UI・公開API・同期モデルは変更していない。Web仕様は作業中の変更を含むため、配備済みの仕様と混同しない。
