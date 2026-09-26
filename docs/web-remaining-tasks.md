# Web 残タスク

最終更新: 2026-09-27

この文書は、過去の監査履歴ではなく、現行コードを基準にした未完了項目だけを管理する。Web画面、Web API、公開レスポンス、App Hosting設定、Webから使うApp/Universal Linkを範囲とする。Android/iOS内部の実装、全面的な多端末同期、公開停止UIなどは含めない。

## 全体サマリ

| 優先 | 作業群 | 実装量の目安 | コスト・リスクへの効果 |
|---|---|---:|---|
| P0 | 公開APIの内部ID除去、検索ログ最小化、入力上限 | 完了 | 公開レスポンスからUID/私的原本IDを100%除去。検索条件由来の語句・属性hashを成功ログから100%除去。検索500文字、cursor 4,096文字、リスト200件などで固定上限化 |
| P0 | domainカタログ、検索・保存接続 | 完了 | 管理語彙を33件へ拡張。保存値と検索条件を完全一致にし、分類揺れによる候補漏れを抑制 |
| P0 | 33 domain・99公開Revision・境界ケース | 本番投入・評価完了 | 各domain 3件、合計99件を本番登録。既120 queryに加え、追加3 domainの12 queryも実Vertexで12/12合格 |
| P0 | CuckooCueデフォルト5 Shelf・30 Cuebook | BQ本番投入・Web公開受入済み、登録ユーザーforkの本人操作待ち | 18件のYouTube/ブログ/公式情報から独自編集した150タスク。原文・字幕は複製せず、出典と編集注記を表示 |
| P0 | thinking 128/BQ 1 GiBの配備・全体評価 | 実装・評価完了、7日観測中 | 16件実測ではthought token 56.1%減、検索解釈LLM推定費37.2%減、約46 USD/10万解釈。既存検索評価70/70合格。BQは1検索Jobの走査を1 GiB以下に制限 |
| P1 | 有料APIのrate limit、App Check、429契約 | 250〜450行 + インフラ設定 | 匿名UID・登録UID・network単位で異常消費を遮断。拒否要求のVertex/BQ/Memory Bank呼出しを0回にする |
| P1 | 公開GETのcache・ページング・BQ上限 | 120〜220行 + テスト80〜140行 | 同一公開データへの反復取得はCDN hit時にBQ呼出しを0回化。ランダムID攻撃は別途network制限で抑制 |
| P1 | Web CI、依存更新、security headers | 180〜320行 + lockfile更新 | mainへ入る回帰を自動停止。現時点のproduction依存6件のmoderate advisoryを解消。主要security header適用率を0%から100%へ |
| P1 | Firebaseキー分離・運用監視 | 主にCloud設定、設定コード20〜50行 | 漏えい時の利用可能面をplatform/API単位へ限定。費用・失敗率・上限拒否を検知可能にする |
| P2 | 実認証・実機リンク・ストア・法務ページ | 150〜300行 + 手動受入 | OAuth、インストール有無、release署名、ストア導線、プライバシー説明のリリース事故を低減 |

行数は新規/変更するTypeScript・テスト・設定の概算で、初期データ本文、Cloud Console操作、レビュー時間は含めない。検索の費用効果は16件の実測比較に基づく。rate limitはbotnetを含む全世界の厳密な費用上限ではなく、Cloud Billing予算通知も自動停止ではない。

## P0: 公開境界・ログ・入力上限

- [x] **PRIV-001: 公開DTOから内部識別子を除去する。** `created_by`と`source_cuebook_id`を公開DTO/SQL projectionから除外し、認証済みviewerに対するboolean `is_owned`だけを返す。匿名・本人の公開導線をE2Eで固定した。
- [x] **PRIV-002: 検索ログを最小化する。** 成功ログから`plan`、`query_hash`、`context_attribute_hashes`を削除し、domain、条件数、属性数、Job ID、件数などの運用値だけにした。失敗ログもprovider error全体を出さずerror型だけにし、検索文を含むrequest bodyの記録を止めた。Cloud Logging `_Default` bucketの保持期間は30日であることを確認した。
- [x] **BOUND-001: 有料処理へ渡す入力に上限を付ける。** 検索`message` 500文字、`cursor` 4,096文字、task 200件、Memory event ID 160文字/text 1,200文字/offset付き日時などをschemaで有料処理前に拒否し、境界テストを追加した。

完了条件: 未認証で取得できる全JSONを検査してFirebase UID・私的Cuebook IDがなく、検索成功ログに検索語またはプロフィール属性を推測できる値がなく、上限超過テストで有料API呼出しが0回になる。

## P0: domainカタログと初期データ

- [x] **DOMAIN-001: 管理語彙カタログを実装する。** `web/src/lib/domain-catalog.ts`を唯一の定義元とし、8項目を持つ30件をバージョン管理した。
- [x] **DOMAIN-002: 保存境界をカタログへ接続する。** enrichment候補をカタログへ固定し、legacy/private両保存schemaでカタログ外値とaliasを拒否する。
- [x] **DOMAIN-003: 検索境界をカタログへ接続する。** activeかつ公開Revisionありの候補だけを渡し、`DISTINCT domain`と正規化比較を廃止して`domain = @searchDomain`へ変更した。
- [x] **DATA-001: 30 domainの初期カタログを作る。** 境界・aliasを含む30件を定義し、DATA-002/003を満たしたものだけactiveにした。
- [x] **DATA-002: 各domainの初期公開データを準備する。** 30 domain × 3件、合計90件を本番`cuckoocue.cuckoo_cue`へ冪等seedした。タイトル90件・task本文270件は重複なし。
- [x] **DATA-003: domain境界ケースを固定する。** 各domain positive 2件・negative 2件、合計120件を固定し、実Vertex判定120/120合格を記録した。
- [x] **DATA-004: 段階的に有効化する。** 30件すべてが最低データ数と境界評価を満たしたためactive化した。公開Revisionのないdomainは実行時候補から外れる。
- [x] **DATA-005: 旧3件の扱いを確定する。** 旧表3件は所有者の公開同意を推定できないため自動移行せず、legacy検証データとして検索対象外にした。現在の本番corpusは`cuebook_revisions` 90件のみを利用する。
- [x] **DATA-006: 追加3 domainを本番へ反映する。** 「料理・食事準備」「キャンプ・アウトドア」「動画制作・配信」の9 Revisionを本番seedした。追加12境界queryはthinking 128の実Vertex判定で12/12合格。

完了条件: 30件のカタログ定義、90件以上のレビュー済み初期Revision、全domainの境界テスト、既存値のmappingが同じ変更セットにあり、検索・保存の両方がカタログ外値を受け付けない。

## P0: CuckooCueデフォルトShelf

- [x] **EDITORIAL-001: 第1弾データを固定する。** 5 Shelf、30 Cuebook/Revision、150タスク、18公開出典、30配置をmanifestに固定した。Runは利用者固有の実行記録のため作らない。
- [x] **EDITORIAL-002: 出典と編集境界を実装する。** YouTube/ブログは調査根拠とURLを保持し、本文・字幕・画像を公開データへ複製しない。公閏DTOには内部観察メモを出さず、出典メタデータとCuckooCue編集表示だけを返す。
- [x] **EDITORIAL-003: 安全なseedと表示回帰を用意する。** Cuebook先行作成、Revision不変検査、確認文字列、既存Revisionのembedding再計算回避、レスポンシブ/アクセシビリティE2Eを実装した。
- [ ] **EDITORIAL-004: 本番投入と公開受入を行う。** 本番`cuckoocue.cuckoo_cue`の99 managed Revision、30 editorial Revision、5 default Shelf、30配置を2026-09-27に再assertした。App Hosting rollout `rollout-2026-09-20-027`（commit `2f9cd71`）で5 Shelf各6件、PC/mobile表示、出典展開、実検索から関連Shelfへの命中を確認済み。forkは実装上`curation`をINSERTせず、desktop/mobile回帰でも印が非継承だが、本番の登録済みユーザーによるfork 1回だけは本人Googleログインが必要なため未確認。

完了条件: 本番で5 Shelf・30 Revisionが閲覧でき、各Revisionの出典が開け、詳細・Shelf・forkの表示境界がローカルE2Eと一致する。

## P0: 検索コスト変更の配備と評価

- [x] **COST-001: 現在の変更をmainへ反映し配備する。** thinking budget 128、BQ 1 GiB上限、生のVertex `usageMetadata`ログをmainへ反映し、App Hosting rollout `rollout-2026-09-20-020`で配備した。匿名本番検索はHTTP 200、6.5秒、正しいdomain、3件取得を確認した。
- [x] **COST-002: 128で全検索評価を再実行する。** 既存70ケースを再実行し、必要候補・目的外候補・先頭候補・domainの全判定が70/70合格。1024との差分だった学校・インターネット条件をprompt規則と回帰へ固定した。
- [ ] **COST-003: 本番分布を確認する。** stage別のinput/output/thought token、成功率、P50/P95、検索回数を集計する。検索文、UID、IP、トークン本文は記録しない。128から0への変更はこの結果まで保留する。
- [x] **COST-004: Cloud Billingの予算通知を設定する。** project `cuckoocue`を対象に暫定月額1,000円、50%・80%・100%の既定メール通知を設定した（budget ID `e3a0a05a-8052-4ebc-baee-2f6c6fd46972`）。通知のみで自動停止ではない。異常時はまずApp Hostingの公開を止め、継続する課金要求があればVertex AI APIとBigQuery APIを無効化し、原因修正後に段階復旧する。
- [ ] **COST-005: 低頻度LLM処理を別に計測する。** `task-list-enrichment`と`shelf-description`にも加工しない`usageMetadata`を記録し、呼出し回数とtoken分布を確認する。両者のthinking budget 1024は検索解釈と品質要件が異なるため、同じ128へ一括変更せず評価ケースを作ってから決める。
- [x] **COST-006: seedのBQ jobをバッチ化する。** managed seedは233から5 parent job、editorial seedは69から7 parent jobへ削減した（合計302から12、96.0%減）。本番で既存129 Revisionを再利用して新規embedding 0件の冪等実行と全件assertを完了した。2026年9月の請求CSVではBQ Analysisは0.03 TiB・0円で、500円通知の原因はBQではなくVertex AIの累積利用だった。

完了条件: 本番RevisionとGit commitが一致し、匿名・登録済み検索が成功し、1 GiB超過が検索失敗として安全に処理され、最低7日分のstage別usage集計を確認できる。

## P1: 検索APIの悪用対策

- [ ] **ABUSE-001: 有料処理前のサーバー側rate limitを実装する。** Firebase UIDとネットワークbackstopを別bucketにし、BigQuery、Vertex、Memory Bankの前で判定する。生UID/IPは保存せず、回転secretによるhashとTTL付きcounterだけを保持する。匿名Firebase UIDは作り直せるため、UID bucketだけで完了にしない。
- [ ] **ABUSE-002: paginationを別bucketにする。** cursor取得は元Jobを再利用するため、新規検索より高い上限にする。cursor変更や所有者不一致は既存どおり拒否する。
- [ ] **ABUSE-003: 429契約を実装する。** `Retry-After`と安定したerror codeを返し、UIは入力と既存結果を保持する。拒否された要求が有料APIを一度も呼ばないことをテストする。
- [ ] **ABUSE-004: App Checkを段階導入する。** reCAPTCHA Enterpriseをmetrics-onlyで開始し、通常検索のvalid coverageが48時間99%以上になった後に`/api/search`だけenforceする。Firebase Authenticationは維持する。
- [ ] **ABUSE-005: 登録者向け有料APIも同じ基盤で保護する。** `/api/task-list-enrichment`、`/api/shelf-description`、公開時embedding、`/api/memory-events`へ用途別の低い頻度枠を設定する。登録済みであることを費用対策の代わりにしない。

初期rate limit値は匿名100回/日、登録済み500回/日、network backstop 1,000回/日を上限側の仮値とし、report-only期間の実測で調整する。これは利用プランではなく、異常消費を止めるfuseである。

## P1: 公開GETとBQ読み取り

- [ ] **PUBLIC-001: 公開レスポンスへcache policyを付ける。** 不変の公開Revisionは長い`public, s-maxage`、更新されるShelf一覧/詳細は短いTTLと`stale-while-revalidate`を設定する。公開停止後に許容する最大stale時間を明記し、private APIには適用しない。
- [ ] **PUBLIC-002: Shelf一覧をページングする。** 現在の全件返却を固定上限付きcursorへ変更し、初期表示が全Shelfを必要としないようUIを接続する。
- [ ] **PUBLIC-003: 共通BQ readに1 GiB上限を適用する。** 公開Shelf/Revision/import payloadの`bqRead`にも`maximumBytesBilled`を設定し、上限超過を503ではなく識別可能な運用エラーとして記録する。正常データで発生しないことをdry runで確認する。

完了条件: 同じ公開URLの反復取得がCDN hitになり、一覧は1ページの上限を超えず、全公開read queryに走査上限があり、private responseが共有cacheへ保存されない。

## P1: Firebaseクライアントキー

- [ ] **KEY-001: Web production、Web local/CI、Android debug/release、iOSを別キーにする。** サーバー側Google Cloudアクセスにはクライアントキーを使わない。
- [ ] **KEY-002: caller/API restrictionを設定する。** Webは許可origin、Androidはpackageと署名証明書、iOSはbundle IDで制限する。必要APIは実トラフィックから確定する。
- [ ] **KEY-003: 旧共有キーを段階廃止する。** 新キー配布後7日以上観測し、旧キーの利用が0になってから無効化する。

## P1: CI・依存・Web防御

- [ ] **CI-001: Web検証をmainの必須checkにする。** 現在はAndroid/iOS screenshot workflowだけで、Web workflowがない。lint、production build、検索filter/route/write retryの軽量テスト、主要Playwrightを段階分けして実行し、Cloud認証が必要な本番scenarioは手動または保護environmentへ分離する。
- [ ] **SEC-001: production依存のadvisoryを解消する。** 2026-09-20時点の`npm audit --omit=dev`はhigh/critical 0、moderate 6で、直接依存`firebase-admin@14.3.0`配下の`@google-cloud/storage`、`gaxios`、`uuid`等はfix available。更新後にAuth、Firestore Run、App Hosting buildを回帰確認する。
- [ ] **SEC-002: security headersをreport-onlyから導入する。** 現在`next.config.ts`はAASAのContent-Typeだけを設定している。CSPはFirebase Auth/Google popup/必要なGoogle APIだけを許可して先にReport-Onlyで観測し、`frame-ancestors`、`nosniff`、`Referrer-Policy`等を確認してenforceする。
- [ ] **OPS-001: 運用alertを作る。** 5xx率、429率、Vertex失敗、BQ bytes billed/cap拒否、App Hosting instance/latencyをdashboard化し、検索文やUID/IP本文をdimensionに使わない。

## P2: 本番・リリース受入

- [ ] **ACCEPT-001: 実Google認証を確認する。** 同意、取消、元画面への復帰、AからBへのアカウント切替で、前の利用者の私的workspaceが表示・保存されないことを本人操作で確認する。
- [ ] **ACCEPT-002: ブラウザ導線を実機確認する。** Android/iOSそれぞれでアプリあり/なし、Googleアカウント選択、App/Universal Link復帰を確認する。AASAは設定済みなので、Apple CDN反映とrelease端末での受信を受入対象にする。
- [ ] **RELEASE-001: release署名のApp Linkを確定する。** release SHA-256をFirebaseと`assetlinks.json`へ追加し、release APKでverifiedを再確認する。
- [ ] **RELEASE-002: 公式ストアURLを設定する。** 実在するApp Store/Google Play URLと許可された公式badgeだけを使用し、QRからインストール、WebからRun受信まで確認する。
- [ ] **RELEASE-003: Web上の公開文書を用意する。** プライバシーポリシー、利用条件、問い合わせ先をcanonical domain上の固定URLで公開し、Web footer、OAuth同意画面、各store listingの説明とデータ境界を一致させる。
- [ ] **CLEANUP-001: 旧Entry互換経路を期限付きで閉じる。** 対応中のAndroid最低versionを確認後、未使用の`CUE_BIGQUERY_TABLE`、常時410の`POST /api/task-list-entries`、`entry_id`/`GET /api/import-payload/[id]`互換、`buildAndroidImportUri`を同じrelease計画で削除する。現行`revision_id`経路は維持する。

## 規模到達時だけ行う項目

- [ ] **SCALE-001: BQ実行量を再評価する。** P95 bytes billedが256 MiBを超えるか、1 GiB上限エラーが正常利用で発生した場合、`related` CTEの全Shelf走査を先に見直す。検索に期間条件がない限り`created_at` partitionは追加しない。
- [ ] **SCALE-002: domain分類軸を再監査する。** active domainが40件を超えた場合、地域・対象者・製品・個別タスクがdomainへ混入していないかを確認する。上限を増やすだけで解決しない。

## 完了済みとして戻さない項目

- thinking budget 128の設定と環境変数化
- BQ検索Jobとdomain候補取得の1 GiB上限
- Vertex `usageMetadata`のraw構造化ログ
- 匿名Firebase利用者の検索・公開App利用と、登録済み利用者だけに限定した私的保存・公開操作の認可境界
- 検索のcursor pagination、BQ Job再利用、所有者binding
- BQ書込Jobの失敗確定後の安全な再実行
- UID切替時の私的workspace破棄、公開競合からの再確認、Shelf作成操作IDの復元
