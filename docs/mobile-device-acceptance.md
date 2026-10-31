# Android / iOS 実機検証の開始手順

最終更新: 2026-10-31。実機試験の入口をこの文書にまとめる。実施結果は未記入を合格扱いにしない。

## 現状と使う版

| 対象 | 確認済み | 実機で残ること |
|---|---|---|
| Web | 本番 `cfb2e69`、App Hosting `build-2026-10-31-002`。通常検索・配置グループ・作成入口を確認済み。10/26の実Google A→B→A、本人データ境界も完了 | 今回修正する「新しい状況」ログイン後復帰の配備確認と、各端末ブラウザからの受渡し |
| iOS | [E2E 40270605502](https://github.com/hiroyoshii/cuckoocue/actions/runs/40270605502)成功。app/model/UI、SimulatorのHome Screen Widget配置stepも成功。TestFlight build **10**は[40269809533](https://github.com/hiroyoshii/cuckoocue/actions/runs/40269809533)で検証・upload済み | build 10のtesterへの表示・インストール、実Google認証、実Run往復、実Widget。upload成功だけではtesterへの提供完了を意味しない |
| Android | 通常ビルドは `app.cuckoocue`、`0.1.0 (1)`。最新CI [35486222694](https://github.com/hiroyoshii/cuckoocue/actions/runs/35486222694)はstep開始前の失敗。前回成功以降に上位UI変更がある | 現行版の再回帰と本番接続debug APKを使った実Google認証・実Run往復・実Widget。正式release署名/Play公開は別ゲート |

iOSは `8e4f03e`（既存E2E）→`f7d49f6`（build 10）→現在のmainで、`ios/`の実装・依存・project設定は同一。READMEの差分だけであり、今回のWeb修正のためにiOSを再uploadする必要はない。App Storeの新規設定や署名secretの登録をやり直さない。

WSLとWindowsの両adbを確認したが、接続は `emulator-5554` のみ。iPhoneを操作できる接続もない。以下は実機操作を行う担当者に渡す手順であり、この環境で実機合格を記録してはいない。

## Android：APKを準備して端末に入れる

リポジトリルートで次を実行する。端末へのインストールやデータ初期化は行わない。

```bash
bash android/scripts/prepare-device-acceptance.sh
```

出力は `output/mobile-device-acceptance/cuckoocue-debug.apk` と `build.json`。後者にcommit、Androidソースtree、APK SHA-256、署名、接続URLを記録する。スクリプトは本番URL以外（journey用localhostを含む）、本番assetlinksと署名が一致しないAPKを受入用として出力しない。debug用Firebase設定・署名は既存のものを使う。release版の受入を代替しない。

Android 8以上が動作対象。最初の受入にはGoogle Play servicesを備えたAndroid 12以上の実機を使うと、App Linksの状態も次のコマンドで確認できる。開発者向けオプション/USBデバッグを有効にしてPCを許可し、**実機serialを明示する**。

```bash
cue_adb=/home/hiroyoshii/Android/Sdk/platform-tools/adb
"$cue_adb" devices -l
cue_serial=実機のserial
"$cue_adb" -s "$cue_serial" install -r output/mobile-device-acceptance/cuckoocue-debug.apk
"$cue_adb" -s "$cue_serial" shell pm verify-app-links --re-verify app.cuckoocue
# 非同期検証が終わってから確認する。
"$cue_adb" -s "$cue_serial" shell pm get-app-links app.cuckoocue
```

WSLから端末が見えずWindowsから見える場合は `cue_adb=/mnt/c/Users/orien/AppData/Local/Android/Sdk/platform-tools/adb.exe` とし、APKの引数は `wslpath -w` でWindowsパスに変換する。署名不一致で更新できなければ、既存の私的データを消すアンインストールで進めず、その端末を保留して検証用端末を使う。

`cuckoocue.hiyozoo.com: verified` が合格。`approved`への強制変更やpackage指定の起動はOSの自動リンク解決の合格証拠にしない。[Android公式の検証手順](https://developer.android.com/training/app-links/verify-applinks)に従う。

## iOS：既存TestFlight build 10を使う

1. iOS 17以上の実機にTestFlightを入れ、既存testerアカウントで招待を受ける。
2. Cuckoo Cueのbuild **10**を選び、build番号・OS・端末名を記録してインストールする。
3. 見えなければApp Store Connectの既存アプリ→TestFlightでbuild 10の処理状態、コンプライアンス、テスターgroupへの割当を確認する。uploadをやり直す前にここを解消する。外部testerの場合はBeta Reviewの状態も確認する。
4. 既存のGoogleログインとWeb受渡しを使う。Firebase plist、App Group、Associated Domainsは配布workflowへ設定済みであり、未設定扱いにしない。

招待の受諾と利用可能なbuildのインストールが必要であることは[AppleのTestFlight手順](https://testflight.apple.com/)でも確認できる。App Storeの正式URLはこの試験の開始条件ではない。

## 同じデータで一巡する（両OSそれぞれ実施）

画面操作の自動試験は他アプリのQAと同じ端末で並行実行しない。今回のローカルエミュレーターではSystem UIの応答停止と他アプリへの前面切替があり、画面回帰の判定には独立CIを使う。

検証用のGoogleアカウントA/B、端末ブラウザ（Android Chrome / iOS Safari）、ホーム画面へWidgetを置ける状態を用意する。端末ごとに別の検証Runを作り、**その端末内の往復では同一Run IDを維持する**。最初から両OSで同じRunを同時編集して競合を混ぜない。個人情報のないタイトル・Taskを使い、証跡へtoken/emailを保存しない。

| ID | 操作 | 合格条件・残す証跡 |
|---|---|---|
| D01 | ログアウト状態で本番Webの通常検索→「新しい状況」→Googleログイン。別の回で取消→再試行 | 成功後は作成フォームへ復帰し検索文を保持。取消後は検索へ戻れ、後日の通常ログインで勝手に開かない。自動作成はしない |
| D02 | WebでAにログイン。管理者の例から候補を開き、未来の最終日を指定して日程保存 | 保存済みRun ID、Task件数、各日付、time zoneを記録。単なる「端末へ送る準備」を保存成功と混同しない |
| D03 | 端末ブラウザの受渡しボタン、またはメモ/メール等の外部アプリから対象 `/import?run_id=…` リンクをタップ。アプリもAでログイン | 同じRun ID・Task件数・日付を受信。Google取消後も同じリンクで再開可能。iOSでSafariの同一サイト内に留まる場合は外部アプリからも確認し、URL直打ちだけで判定しない |
| D04 | 同じリンクを2回開く。初回取得前に機内モードにして失敗させ、復帰後に再試行 | Runが増殖しない。取得できていない状態を成功表示しない。既にローカル編集したRunを再受信で上書きしない |
| D05 | Run詳細で3 Taskの本文・開始日/期限・優先度・並び順を連続編集。閉じて再度開く | 行内編集と並び順を保持。iOSだけ日常操作が別sheetへ戻っていない。編集前後の画面を記録 |
| D06 | ホームへWidgetを実設置。対象Run指定あり/なしをそれぞれタップ。アプリのWidget設定を開いた状態でも試す | 指定ありは対象Run、なしは一覧へ戻る。設定sheetに遮られない。プレビューは本人のCue・文字サイズ・配色と一致 |
| D07 | Widgetで完了→Undo→再度完了。アプリを終了/再起動し、ホームへ戻る | 完了状態の永続化、Undoが対象Taskだけを戻すこと、Widget再表示を確認。OSの更新遅延は秒数を記録し、即時不具合と決めつけない |
| D08 | 「再利用用に整える」からWebへ戻る。通信OFFで一度失敗→ONで再試行 | 同期成功後だけWebを開き、対象Run・選択した完了Task・日付が一致。新Runや別Runを勝手に編集しない。Webでの私的原本への保存と公開は別操作 |
| D09 | AのRunを持った状態でアプリ/WebをBへ切替。同じ受渡しリンクと同期を試し、Aに戻す | BによるAのクラウドRun取得・同期・再帰属を拒否。Aでは元のRunへ戻れる。端末内の表示分離は下記G06の既知残件として別判定する |
| D10 | アプリ未導入の別端末/検証ブラウザで同じリンクを開く | Webに留まり再開できる。架空のstore URLへ遷移しない。既存端末のアプリを削除してこの試験を作らない |

まずD01〜D08を各OSで一巡し、次にD09/D10。実機で初めて分かる不具合は再現操作と版を付けて修正対象にする。

## 既知の制約と合格にしない項目

- **G06：アカウント別の端末内表示分離は未実装。** Androidは共有Room、iOSは共有snapshotのRunを表示し、同期metadataの所有者ガードとは別である。別アカウントへ同期されないことを、ローカルRunが見えないことの証明にしない。共有端末での私的データ分離を製品の合格条件にする受入は現状では保留。所有者不明のローカルRunの扱いを含む既存G06として残す。
- 他端末変更の自動取得/マージ、競合解消UI、削除伝播もG06の別スコープ。ETag競合時は上書きせずエラーとなることを確認する。競合試験には専用Runを使い、Web/API側から先に更新してから端末の古いETagで送信する。勝手に新Runを作ったり、409/412を成功と表示したら不合格。
- 正式Android release署名、release用Firebaseキー制限、Play/App Store URL設定、storeからの導入は公開・配布ゲート。debug APK/TestFlightでの機能受入と混同しない。
- Androidの既存 `verify-widget-phase0.sh` はseed・端末表示設定の変更を伴う自動試験。実データのある実機へそのまま実行しない。今回はエミュレーター用の回帰として使う。

## 記録と片付け

`output/mobile-device-acceptance/`にOSごとに記録する。日時、端末/OS、Webの配備commit、APK hash/build 10、D01〜D10の合否、Run ID、期待/実際、画面、再現手順を残す。個人情報を含む原本はgitへ追加しない。成功した自動テスト件数と実Google/実機の合否を別欄にする。

検証Runだけを対象に片付ける。Web側の削除が端末へ自動伝播する前提は置かず、端末に残る検証用データも確認する。既存のRunやアカウント全体を初期化しない。実機結果は[iOS受入記録](ios-production-acceptance.md)と[Mobile仕上げTodo](mobile-finish-todo.md)へ要約を反映する。
