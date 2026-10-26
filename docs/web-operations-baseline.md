# Web運用ベースライン

最終更新: 2026-10-26

## 配備前提

- App Hosting: `minInstances=0`、`maxInstances=5`、concurrency 80、CPU 1、memory 512 MiB。
- BigQuery: 検索Jobと共通readの両方を1 GiB `maximumBytesBilled`で拒否する。
- Billing: 月額1,000円の50%・80%・100%通知を維持する。通知は自動停止ではない。

## 観測

Cloud Monitoringの `Cuckoo Cue Web operations` dashboardで次を確認する。

- 検索完了・失敗
- BQ read上限拒否
- App Hosting HTTP status、P95 latency、instance数
- Vertex検索stage呼出し
- BigQuery billed bytes
- CSP Report-Only違反

検索失敗、BQ read上限到達、App Hosting HTTP 5xxには個別alertを設定した。通知先はCloud MonitoringのWeb運用用email channelとし、検索文、prompt、token本文、UID、IPをmetric labelや通知本文へ含めない。

Vertex AI、BigQuery、Firebase Authenticationの有効quotaはCloud Consoleと`gcloud alpha services quota list`で確認した。サービスquotaは費用上限ではない。App Hosting側の最大instanceは5だが、Vertex/BQの月額を直接制限しない。

## `/api/search`の総量制御

現時点では固定回数のrate limitを入れない。通常利用分布と異常トラフィックの証拠がなく、匿名UID・共有network・limiter用Firestore障害を推測値で扱うと、正常利用を誤拒否するためである。入力、token、BQ走査、結果件数、timeout、instance数の1要求上限と、dashboard、alert、予算通知、停止手順を維持する。

## cache境界

- 公開Shelf一覧・詳細: `public, s-maxage=60, stale-while-revalidate=300`
- 公開Revision・Revision import payload: `public, s-maxage=3600, stale-while-revalidate=86400`
- 認証付きShelf responseと全private API: `private, no-store`

Revision公開停止後のCDN stale許容は最大25時間とする。緊急停止ではCDN purgeまたはApp Hosting停止を行い、この時間を待たない。

## 異常時の順序

1. dashboardと構造化ログで失敗stage、HTTP status、BQ上限、instance数を確認する。
2. 異常な連続実行ならApp Hostingの公開を止める。
3. 課金要求が継続する場合だけVertex AI API、次にBigQuery APIを停止する。
4. 原因を修正し、BQ read、匿名検索、登録済み検索の順に小さく復旧する。

rate limitとApp Checkは、異常自動化と十分な通常利用標本が揃うまで導入しない。どちらも本人認証や厳密な費用上限の代替として扱わない。
