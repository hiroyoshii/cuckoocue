# iOS P1 本番受入

最終更新: 2026-10-26

実装済みのWeb→iOS→Widget→Webフローを、実サービス・配布ビルド・実機で受け入れるための記録。新機能の追加や全面的な多端末同期は対象外とする。

## 自動検証と配布

- [x] iOS app/model/UI testと実Home Screen Widget配置を含むE2Eが成功した。commit `8e4f03e`、[Actions run 36257175025](https://github.com/hiroyoshii/cuckoocue/actions/runs/36257175025)。このrun以後、TestFlight配布commitまでiOSコード変更はない。
- [x] 現行コードをApp Store Connectへ検証・uploadした。commit `f7d49f6`、tag `ios-testflight-2026-10-26-1`、build `10`、[Actions run 40269809533](https://github.com/hiroyoshii/cuckoocue/actions/runs/40269809533)。archive、build番号検査、IPA export、App Store Connect検証、TestFlight uploadはすべて成功した。

## 実機で残るP1受入

同じbuild `10`と同じRunを使い、次を1回の受入セッションで確認する。

- [ ] TestFlight build `10`を実機へインストールし、Run詳細で複数Taskの本文・日付・優先度・順序を連続して編集できる。
- [ ] 実Google認証で同意、取消、要求画面への復帰を確認する。
- [ ] アカウントAからBへ切り替えたとき、Aの私的workspace、Run、同期状態、draftをBへ表示・保存しない。
- [ ] 登録済み本人でデフォルトShelfのRevisionを1回forkし、`curation`等の編集印を私的原本へ継承しない。
- [ ] Webから作成した同じRun IDをUniversal LinkでiOSへ受信する。同じlinkの再オープンと一時失敗後の再試行でRunを重複・上書きしない。
- [ ] 実Home Screen WidgetからRun指定あり／なしのqueueを開き、Run詳細／一覧へ復帰する。Widget設定sheet表示中からの復帰も確認する。
- [ ] Widgetで完了・Undoを行い、アプリ終了・再起動・Widget再表示後も結果を保持する。自分のCueと設定プレビューが一致する。
- [ ] iOSの変更を同期し、「再利用用に整える」からWebの同じRunへ戻る。失敗後の再試行とETag競合で別Runや別accountへ書き込まない。
- [ ] アプリ未導入端末ではUniversal LinkがWebへ安全に留まり、存在しないstore URLや非公式badgeへ誘導しない。

## Web側の前提確認

- [x] 2026-10-26に本番Webで通常のChromeと実Google popupを使い、アカウントA→B→Aの切替と要求画面への復帰を確認した。
- [x] Aで保存したRunはBから取得できず、Aへ戻すと同じRunを再取得できることを確認した。
- [x] Aでdefault Shelfをforkし、`curation`非継承と所有者境界を確認した。Bでは同じ公開Shelfが非所有になり、Aへ戻すと所有者として復帰した。
- [x] 受入用RunとShelfは確認後に本番から削除し、不在を再検証した。

これらはWeb側の認証・データ境界の前提確認であり、下記のiOS実機受入を代替しない。Google popup取消時の表示も別途確認する。

## 受入記録

- 実施日時:
- 端末・OS:
- TestFlight build: `10`
- GoogleアカウントA/B:
- 対象Run ID:
- 対象Shelf/Revision:
- 結果・不具合:

実機操作が完了するまでは、モック・Simulator・Actions成功だけを本番受入完了とは扱わない。
