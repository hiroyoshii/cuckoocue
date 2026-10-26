# Web API総量制御とFirebaseキー分離

最終更新: 2026-10-26

## 結論

`/api/search`はVertex AI、embedding、BigQueryを使うが、現在の通常利用コストを高優先度の問題とは扱わない。1要求あたりの入力・model token・BQ走査・結果件数・実行時間・instance数をすでに制限し、7日間の本番観測は検索1件だった。検索解釈LLMの16件比較では約46 USD/10万解釈、BQ実測は1検索20 MiBであり、現時点で高コスト化の兆候はない。

残るのは、匿名UIDを作り直しながら要求回数を積み上げる総量リスク。予算通知は自動停止せず、App Hostingのinstance上限はVertex AIやBQの月額上限ではない。ただし異常利用は観測されておらず、全API共通limiterやApp Checkを先回りして実装する費用対効果も確認できていない。

このため、次の順番にする。固定回数を増やすだけでは正常利用の安全を証明できないため、2026-10-26の再精査でrate limitの先行実装は取り下げた。

1. 呼出量alert、service quota、停止手順を確認した。
2. 既存の1要求上限と観測を維持する。
3. rate limit、App Check、登録者向け有料APIの共通limiterは、異常トラフィックと十分な通常利用標本が得られた場合だけ再評価する。

## 既存のコスト防御

| 層 | 現在の防御 | 効果と限界 |
|---|---|---|
| 認証 | Firebase ID token必須。匿名利用者もtokenを取得する | 無認証の直接要求を拒否する。匿名UIDは作り直せるため回数上限にはならない |
| 入力 | 検索文500文字、cursor 4,096文字、page size 20件 | 1要求のprompt・応答・BQ結果を固定上限に収める |
| 検索解釈 | Gemini thinking budget 128、model呼出し1 attempt、timeoutあり | 16件比較でthought token 56.1%、検索解釈LLM推定費37.2%減 |
| 匿名経路 | Memory Bank取得とprofile選択LLMを呼ばない | 公開検索の標準経路で追加のmodel処理を避ける |
| no-match | domainが得られなければembeddingとBQを呼ばない | 無関係な入力で後段費用を発生させない |
| embedding | 入力上限、timeout、限定retry | 1要求あたりの入力と待機時間を制限する。要求総数は制限しない |
| BigQuery | 1 query jobあたり1 GiB、page size 20、timeout | 実測20 MiB。cursor paginationは同じJobを再利用し、新しいLLM・embedding・query jobを作らない |
| App Hosting | `minInstances: 0`、`maxInstances: 5`、concurrency 80 | idle computeと無制限scaleを避ける。外部APIの総費用上限ではない |
| Billing | 月額1,000円、50%・80%・100%通知 | 異常を知らせるが、自動停止しない |
| 運用 | App Hosting停止後、必要ならVertex AI・BQ APIを停止する手順 | 人が対応すれば追加費用を止められる。夜間等の検知遅延は残る |

seedのBQ jobバッチ化は保守処理の費用削減であり、公開検索の悪用防止には数えない。Firebaseクライアントキーも公開識別子であり、キーを秘匿することを検索の費用防御にしない。

## 完了: 観測と既存quotaの確認

Cloud Monitoring dashboard、個別alert、quota記録、停止手順を[Web運用ベースライン](web-operations-baseline.md)へ固定した。

- 検索回数、HTTP status、latency、Vertex stage別呼出し・失敗、BQ bytes billed・1 GiB上限拒否をdashboardとalertにする。
- 検索文、prompt、token本文、生UID、生IPをmetric dimensionへ使わない。
- Vertex AI、embedding、BigQuery、Firebase Authentication、App Hostingの現在のquotaと上限変更権限を記録する。
- 予算通知を受けてからApp Hosting、Vertex AI、BQを止める担当・手順・復旧順を確認する。
- 将来limiterを検討する場合は、Firestore費用・latency・障害点と正常利用の誤拒否を先に評価する。

この段階の完了条件は、通常費用と異常な呼出増加を区別でき、通知後に停止できること。rate limitやApp Checkの実装完了を条件にしない。

## 条件付き: `/api/search`の総量制御

現時点ではrate limitを検索経路へ入れない。匿名・登録・networkの固定回数を大きくしても、正常利用への影響がなくなった証拠にはならず、limiter用Firestoreを新しい障害点にもするためである。

異常な自動化が観測された場合は、次を同時に設計する。

- 通常利用分布と共有networkの実測を基準にし、推測の固定回数を先に置かない。
- Firebase UIDだけで完了にせず、匿名UID再作成とnetwork誤判定を両方考慮する。
- cursor paginationは既存Jobを読むだけなので、新規検索と別扱いにする。
- 拒否を導入する場合は`429`、`Retry-After`、安定したerror code、入力・既存結果保持を契約にする。
- 保存が必要なら、生UID/IPではなく回転secretによるhashと期限付きcounterだけを保持する。
- limiter用storageの障害時に検索全体を停止させない方式と、保護が外れたことを検知するalertを同時に用意する。

## 条件付き: Firebase App Check

App Checkは現時点の高優先度タスクではない。正規Webアプリ経由である確率を上げる防御であり、本人認証、rate limit、service quota、費用上限を置き換えない。実ブラウザを使う自動化も完全には止めない。

次の両方を満たす場合だけ再評価する。

1. 自動化された異常トラフィックが確認され、既存の入力・実行上限、service quota、運用停止だけでは不足する。
2. 対応ブラウザごとのvalid/missing/invalidを判断できるだけの通常利用標本がある。

導入する場合はreCAPTCHA Enterpriseをmetrics-onlyで開始する。十分な期間と件数で通常検索を誤拒否しないこと、localhost/CIのdebug tokenを本番で受け付けないこと、緊急無効化が可能なことを確認してから`/api/search`だけenforceする。Android/iOSへ影響するproject-wide enforcementは行わない。

## 条件付き: 登録者向け有料API

`/api/task-list-enrichment`、`/api/shelf-description`、公開時embedding、`/api/memory-events`は登録済み利用者だけが使う低頻度処理を含む。7日観測ではenrichment/descriptionとも呼出し0件だった。

これらへ共通limiterを先回りして広げない。stage別呼出量または異常利用が観測されたAPIだけを対象に、入力上限・冪等性・既存認可を確認したうえで個別の低頻度枠を検討する。

## Firebaseクライアントキー分離

キー分離は費用対策の主役ではなく、漏えい時の影響範囲と切替単位を小さくするセキュリティ・運用施策として維持する。

維持するキー:

- Web production
- Web local/preview/CI
- Android release（release署名情報の提供後に作成）
- Android debug
- iOS

Webは許可origin、Androidはpackageと署名証明書、iOSはbundle IDでcaller restrictionを設定する。Web productionの許可originにはcanonicalとApp Hosting既定domainに加え、Firebase Auth popupがIdentity Toolkitを呼ぶ`cuckoocue.firebaseapp.com`のAuth handler originも含める。API allowlistは実トラフィックから確定し、Firebase Authentication、匿名ログイン、Firestore等を推測で壊さない。サーバー側BigQuery・Vertex AI・管理処理はservice identityを維持し、クライアントキーへ移さない。

Web production/local、Android debug、iOSは分離・caller制限・Auth API allowlistを反映済み。2026-10-26に本番Webの匿名認証と実Google popup認証を確認し、Auth handler origin不足でGoogle認証が拒否される構成不備を上記許可origin追加で解消した。既存構成に全platform共用キーはなかったため旧共有キーの廃止対象はない。Android releaseだけはrelease署名fingerprintと配布用設定の確定後に作る。

## 対象外

- rate limitを利用プランや課金プランとして設計すること
- 検索利用がほぼない段階で、評価目的の有料要求を生成すること
- App Check導入だけで悪用対策完了とすること
- botnetを完全に防ぐために複雑な識別・追跡基盤を作ること
- 生の検索文、UID、IP、tokenを長期保存すること
