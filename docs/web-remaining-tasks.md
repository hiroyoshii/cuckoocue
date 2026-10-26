# Web 残タスク

最終更新: 2026-10-26

この文書は、過去の監査履歴ではなく、現行コードを基準にした未完了項目だけを管理する。Web画面、Web API、公開レスポンス、App Hosting設定、Webから使うApp/Universal Linkを範囲とする。Android/iOS内部の実装、全面的な多端末同期、公開停止UIなどは含めない。

優先度は次の意味で使う。P1は、現在のmain自動配備または検索・再利用・端末受渡しという中核フローの成立を直接守るため、次に着手するもの。P2は既存機能が成立した後の防御・効率・運用改善。公開拡大前ゲートはストア公開・外部告知・広告等で匿名流入を意図的に増やす前に必須なもの。2026-10-26の全Web残件対応指示により、実装可能な公開拡大前ゲートは前倒しした。条件付きは観測された規模・異常が着手条件を満たすまで残タスクに数えない。

## 全体サマリ

| 優先 | 作業群 | 実装量の目安 | コスト・リスクへの効果 |
|---|---|---:|---|
| P0 | 公開APIの内部ID除去、検索ログ最小化、入力上限 | 完了 | 公開レスポンスからUID/私的原本IDを100%除去。検索条件由来の語句・属性hashを成功ログから100%除去。検索500文字、cursor 4,096文字、リスト200件などで固定上限化 |
| P0 | domainカタログ、検索・保存接続 | 完了 | 管理語彙を33件へ拡張。保存値と検索条件を完全一致にし、分類揺れによる候補漏れを抑制 |
| P0 | 33 domain・99公開Revision・境界ケース | 本番投入・評価完了 | 各domain 3件、合計99件を本番登録。既120 queryに加え、追加3 domainの12 queryも実Vertexで12/12合格 |
| P0 | CuckooCueデフォルト5 Shelf・30 Cuebook | BQ本番投入・Web公開受入・登録ユーザーfork済み | 18件のYouTube/ブログ/公式情報から独自編集した150タスク。原文・字幕は複製せず、出典と編集注記を表示 |
| P0 | thinking 128/BQ 1 GiBの配備・全体評価 | 実装・評価・7日観測完了 | 16件実測ではthought token 56.1%減、検索解釈LLM推定費37.2%減、約46 USD/10万解釈。既存検索評価70/70合格。7日間の本番利用は検索1件だけで追加最適化の標本には不足 |
| 完了 | Web CI | workflow実装・全job成功済み | Web変更時にlint、build、軽量API回帰、主要E2Eを実行する。branch protectionのrequired check化は採用しない |
| P1受入 | 実Google認証、アカウント切替、Web↔端末受渡し | 手動受入 + 必要箇所の修正 | 開発UID・Auth emulator・UI fixtureで代用できない中核フローと本人データ境界を確定する |
| P2 | security headers | Report-Only実装済み、本番観測/enforce待ち | CSP Report-Onlyと主要headerを導入し、違反を最小化ログで観測する |
| P2 | 公開GETのcache・ページング・BQ上限 | 完了 | 公開一覧だけ20件cursor、本人の所有・参加一覧は完全取得、公開/private cache境界、共通BQ 1 GiB上限を固定した |
| 公開・配布ゲート | Firebaseキー分離、store URL、release link | Web/iOS/debug制限済み、release情報待ち | platform別に制限・停止でき、利用者が正式配布版で受渡しを開始できるようにする |
| 公開拡大前ゲート | 呼出量alert、quota確認、停止手順 | 完了 | 通常利用を推測で拒否せず、異常な費用・失敗率を検知して運用停止できるようにする |
| 条件付き | 検索rate limit、App Check、登録者向け有料APIの共通limiter | 現時点では着手しない | 異常トラフィックと通常利用分布を確認してから、誤拒否しない方式を設計する |

行数は新規/変更するTypeScript・テスト・設定の概算で、初期データ本文、Cloud Console操作、レビュー時間は含めない。検索の費用効果は16件の実測比較に基づく。

検索は、500文字の入力上限、thinking budget 128、1 GiBのBQ上限、20件の結果上限、cursorでの既存Job再利用、timeout、App Hosting最大5 instance、月額1,000円の予算通知を実装済み。匿名検索はMemory Bankとprofile選択LLMを呼ばず、domain不一致時はembedding/BQも呼ばない。16件比較では検索解釈LLM推定費が約46 USD/10万解釈、7日間の本番観測は検索1件・BQ 20 MiBだった。したがって現時点で検索の通常利用コストを高優先度の問題とは扱わない。

匿名UIDを作り直して回数を積み上げられる総量リスクは残るが、根拠のない固定回数で正常利用を拒否しない。dashboard、alert、予算通知、instance上限、1要求ごとの上限を先行し、異常トラフィックと通常利用分布が得られた場合だけrate limitやApp Checkを再評価する。

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
- [x] **EDITORIAL-004 [P1受入]: 本番投入と公開受入を完了する。** 本番`cuckoocue.cuckoo_cue`の99 managed Revision、30 editorial Revision、5 default Shelf、30配置を2026-09-27に再assertした。App Hosting rollout `rollout-2026-09-20-027`（commit `2f9cd71`）で5 Shelf各6件、PC/mobile表示、出典展開、実検索から関連Shelfへの命中を確認済み。2026-10-26に登録済み本人が本番のdefault Shelfをforkし、3項目、所有者判定、`forked_from_shelf_id`、`curation`非継承を実レスポンスで確認した。アカウントBでは非所有となることも確認し、受入用ShelfとRunは確認後に削除した。

完了条件: 本番で5 Shelf・30 Revisionが閲覧でき、各Revisionの出典が開け、詳細・Shelf・forkの表示境界がローカルE2Eと一致する。

## P0: 検索コスト変更の配備と評価

- [x] **COST-001: 現在の変更をmainへ反映し配備する。** thinking budget 128、BQ 1 GiB上限、生のVertex `usageMetadata`ログをmainへ反映し、App Hosting rollout `rollout-2026-09-20-020`で配備した。匿名本番検索はHTTP 200、6.5秒、正しいdomain、3件取得を確認した。
- [x] **COST-002: 128で全検索評価を再実行する。** 既存70ケースを再実行し、必要候補・目的外候補・先頭候補・domainの全判定が70/70合格。1024との差分だった学校・インターネット条件をprompt規則と回帰へ固定した。
- [x] **COST-003: 本番分布を確認する。** 2026-09-20 16:39:53Z〜09-27 16:39:53Zを、検索文・UID・IP・prompt/token本文を取得せず集計した。検索は1件、HTTP 200、成功率100%、latency P50/P95 4.484秒。`interpret`は1件でinput 1,537、通常output 30、thought 174 token。`profile_selection`は0件。BQ public searchは1 job、20 MiB、失敗・1 GiB上限拒否とも0件。n=1では0 budgetの品質判断ができないため128を維持する。
- [x] **COST-004: Cloud Billingの予算通知を設定する。** project `cuckoocue`を対象に暫定月額1,000円、50%・80%・100%の既定メール通知を設定した（budget ID `e3a0a05a-8052-4ebc-baee-2f6c6fd46972`）。通知のみで自動停止ではない。異常時はまずApp Hostingの公開を止め、継続する課金要求があればVertex AI APIとBigQuery APIを無効化し、原因修正後に段階復旧する。
- [x] **COST-005: 低頻度LLM処理を別に計測する。** `task-list-enrichment`と`shelf-description`の加工しない`usageMetadata`ログをstage別に確認した。7日間はいずれも呼出し0件で分布を作れない。需要のない処理を評価目的で有料実行せず、1024を維持する。実利用が発生した後に検索とは別の評価ケースで変更判断する。
- [x] **COST-006: seedのBQ jobをバッチ化する。** managed seedは233から5 parent job、editorial seedは69から7 parent jobへ削減した（合計302から12、96.0%減）。本番で既存129 Revisionを再利用して新規embedding 0件の冪等実行と全件assertを完了した。2026年9月の請求CSVではBQ Analysisは0.03 TiB・0円で、500円通知の原因はBQではなくVertex AIの累積利用だった。

完了条件: 本番RevisionとGit commitが一致し、匿名・登録済み検索が成功し、1 GiB超過が検索失敗として安全に処理され、最低7日分のstage別usage集計を確認できる。

## 検索APIの総量制御: 観測を先行する

- [x] **OPS-001 [公開拡大前ゲート]: 呼出量と既存quotaを確認する。** 検索完了・失敗、BQ上限、Vertex stage、BQ billed bytes、App Hosting status/instance/P95 latency、CSP違反をCloud Monitoring dashboardへ設定した。検索失敗、BQ上限、HTTP 5xxには個別alertと通知先を設定した。Vertex、BQ、Firebase Authenticationのquota、App Hosting `maxInstances=5`/concurrency 80、停止・復旧順は[Web運用ベースライン](web-operations-baseline.md)へ記録した。
- **ABUSE-001 [条件付き・現在の残タスク外]: `/api/search`の総量制御を再評価する。** 異常な自動化が観測され、既存の1要求上限・quota・運用停止では不足する場合だけ対象にする。固定回数を先に置かず、通常利用分布、共有network、匿名UID再作成、limiter自体の障害点を含めて方式を決める。
- **ABUSE-002 [ABUSE-001と同時]: paginationを別扱いにする。** cursorは既存Jobを再利用しLLM・embedding・新規BQ jobを作らないため、新規検索と同じ制限をかけない。
- **ABUSE-003 [ABUSE-001と同時]: 拒否時の契約を固定する。** 導入する場合だけ`429`、`Retry-After`、安定したerror code、入力・既存結果保持を回帰対象にする。
- **ABUSE-004 [条件付き・現在の残タスク外]: App Checkを再評価する。** 自動化された異常トラフィックが確認され、rate limit・service quotaだけでは不十分な場合にmetrics-onlyから始める。通常利用の十分な標本で対応ブラウザを誤拒否しないことを確認するまでenforceしない。App Checkを本人認証、rate limit、費用上限の代わりにしない。
- **ABUSE-005 [条件付き・現在の残タスク外]: 登録者向け有料APIの共通limiterを再評価する。** `/api/task-list-enrichment`、`/api/shelf-description`、公開時embedding、`/api/memory-events`は7日観測で呼出し0件だった。実利用または異常呼出しが発生するまで、検索用limiterを先回りして全APIへ拡張しない。

完了条件は「すべての防御を実装すること」ではない。公開拡大前ゲートは現状の呼出量とquotaを把握し、異常時に検知・停止できること。条件付き項目は着手条件が成立しなければ未実装のままでよい。

## P2: 公開GETとBQ読み取り

- [x] **PUBLIC-001: 公開レスポンスへcache policyを付ける。** 公開Revision/import payloadは1時間+24時間SWR、Shelf一覧/詳細は60秒+300秒SWRとした。認証付きShelfは`private, no-store`と`Vary: Authorization`を返す。公開停止後の最大stale 25時間と緊急purge/停止を運用ベースラインへ記録した。
- [x] **PUBLIC-002: 公開Shelf一覧だけをページングする。** `updated_at,id`の固定順で20件+cursorに変更し、UIへ続きを読む操作を接続した。所有・参加Shelfはmembership APIから別取得して公開一覧のページ位置に依存させず、ナビ、ライブラリ、公開先選択を欠落させない。fixture E2Eで公開2ページ目の追記と、公開1ページ目外の所有Shelf表示を確認した。
- [x] **PUBLIC-003: 共通BQ readに1 GiB上限を適用する。** `bqRead`全体へ`maximumBytesBilled=1 GiB`とlabelを設定し、上限時は`bigquery_read_limit_exceeded`の503と構造化運用ログを返す。軽量回帰で上限指定とエラー契約、本番データのShelf 2ページ取得で正常系を確認した。

完了条件: 同じ公開URLの反復取得がCDN hitになり、一覧は1ページの上限を超えず、全公開read queryに走査上限があり、private responseが共有cacheへ保存されない。

## 公開・配布ゲート: Firebaseクライアントキー

- [ ] **KEY-001: Web production、Web local/CI、Android debug/release、iOSを別キーにする。** Web production/local、Android debug、iOSは分離済み。Android release署名のfingerprintと配布用Firebase設定が未提供のため、releaseキーだけ未作成。サーバー処理はservice identityを維持する。
- [ ] **KEY-002: caller/API restrictionを設定する。** Web productionはcanonical、App Hosting既定domain、Firebase Auth handlerの`cuckoocue.firebaseapp.com`、localはlocalhost、Android debugはpackage+debug SHA-1、iOSはbundle IDへ制限し、APIはIdentity Toolkit/Secure Tokenだけに限定した。Firebase Auth popupはhandler originからIdentity Toolkitを呼ぶため、そのoriginも必要になる。本番Webで匿名認証と実Google popup認証、Android debug/iOSの各制限headerで匿名認証→削除を確認済み。Android releaseだけRELEASE-001と同じ外部入力待ち。
- [x] **KEY-003: 旧共有キーを段階廃止する。** 調査時点でplatformは既に別々のFirebase自動生成キーを使っており、全platform共用キーは存在しなかった。既存キーを用途名へ変更して制限し、廃止対象なしと確定した。

## Web CI

- [x] **CI-001: Web検証workflowを運用する。** `.github/workflows/web.yml`へlint、production build、34件の軽量回帰、主要desktop/mobile Playwrightを追加した。既存のNode/TypeScript import問題は`tsx` test loaderで解消した。commit `7ad93a2`の[初回全体実行](https://github.com/hiroyoshii/cuckoocue/actions/runs/40269116904)は2 jobとも成功した。2026-10-26の判断によりbranch protectionのrequired check化は採用せず、残タスクから外す。

Webはmainの`web/`変更からApp Hostingへ自動配備される。workflow未配置と軽量回帰のNode/TypeScript import問題は解消済みである。

## P2: 依存・ブラウザ防御

- [x] **SEC-001: production依存のadvisoryを解消する。** 2026-10-26の再監査で検出したcritical 1、high 8、moderate 6を、Next.js 16.4.3、Firebase 12.19.0、Firebase Admin 14.5.0、Zod 4.6.7と安全な推移的依存へ更新して解消した。Firebase Web SDKが固定する脆弱な`@grpc/grpc-js` 1.9系は、同じ1.xの修正版1.14.6へoverrideした。`npm audit --omit=dev` 0件、production build、lint、34件の軽量回帰、主要desktop/mobile E2E 46ケースを確認した。
- [ ] **SEC-002: security headersをreport-onlyから導入する。** CSP Report-Only、`frame-ancestors`、`nosniff`、`Referrer-Policy`、Permissions Policy、COOP、X-Frame-Optionsを実装し、CSP reportはURL pathを捨てた構造化ログとdashboardへ接続した。production配備後にGoogle popupを含む違反を観測してCSPをenforceへ切り替える工程が残る。

## P1受入: 実認証・Web↔端末受渡し

- [ ] **ACCEPT-001: 実Google認証を確認する。** 2026-10-26に通常のChromeと本番Google popupでA→B→Aを本人操作し、元画面への復帰を確認した。Aで作成したRunはBから404、公開ShelfはBで`is_owned: false`となり、Aへ戻すと同じRunが200、Shelfが`is_owned: true`へ戻った。受入データは削除済み。残るのはpopupで同意を取り消した場合のUI復帰表示の明示確認だけである。
- [ ] **ACCEPT-002: ブラウザ導線を実機確認する。** Android/iOSそれぞれでアプリあり/なし、Googleアカウント選択、App/Universal Link復帰を確認する。AASAは設定済みなので、Apple CDN反映とrelease端末での受信を受入対象にする。

2026-10-26にcanonicalのAASA/assetlinksとApple CDN AASAがHTTP 200で、iOS App ID・Android package/debug署名が一致することを再確認した。残るのはrelease署名と実機でのOS受信だけである。

これは新機能追加ではなく、実装済みの認証・Run受渡し・owner境界が本番構成で成立するかの確認。失敗した場合は配布リンクや説明を進めず、認証復帰またはlink設定を修正する。

## 公開・配布ゲート: release設定と互換経路

- [ ] **RELEASE-001: release署名のApp Linkを確定する。** release SHA-256をFirebaseと`assetlinks.json`へ追加し、release APKでverifiedを再確認する。
- [ ] **RELEASE-002: 公式ストアURLを設定する。** 実在するApp Store/Google Play URLと許可された公式badgeだけを使用し、QRからインストール、WebからRun受信まで確認する。
- [ ] **RELEASE-003: Web上の公開文書を用意する。** `/privacy`、`/terms`、`/support`とWeb内リンクは実装・production公開済み。OAuth同意画面と未作成の各store listingを本人が照合する作業だけが残る。
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
