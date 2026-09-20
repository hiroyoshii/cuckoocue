# 段取りの再利用を目的とした検索

2026-09-13。Web検索の現行契約と再評価。design_v2.md第16節を補足する。
「1件に絞れた」を成功条件にしない。必要な手順を含む地域違いの事例も比較でき、目的外の事例で埋まらないことを目標とする。

## 現行契約

```text
検索文 ── LLMによる条件解釈 ── domain + 作業目的 + 明示的な限定/除外
                                         │
公開Revision ──────────────────────────── BQ SEARCHで候補を絞る
                                         │
検索文 + 今回の用事に関係する既存プロフィール属性 ── embedding
                                         │
                             同じBQ queryでcosine類似度順
                                         │
                          Job cursorで全件を遅延ページング
```

| 要素 | 判断 |
| --- | --- |
| domain | 管理カタログのactive値かつ公開Revisionが1件以上ある候補から、検索文だけで1件を選ぶ。部分作業を別domainへ移さない。候補は日次cache、同一プロセスで公開成功時は破棄 |
| 全文検索 | タスク本文と、有効なタスク参照を持つ既存task_groupingsの名前を検索する。タイトルやcontextに語があるだけでは作業を含む証拠にしない |
| 条件の組み方 | 一つの目的の同義語/表記ゆれはOR、独立した複数目的はAND。一般動詞やdomain語を重ねて必須化しない |
| 通常の地域・経路 | 類似度に残す。他地域の再利用可能な事例を落とさない |
| 明示的な限定・除外 | 「日本国内だけ」などはcontextの全文条件。「猫のタスクを含まない」はタスク側のNOT条件。単に探していないことと、併載禁止を区別する |
| プロフィール | 検索条件の生成には一切渡さない。別の処理で、今回の用事に直接関係し、検索文と競合せず重複しない既存属性だけを選ぶ。新しい属性は生成しない |
| 並び順 | 検索文と採用属性を一つの検索embeddingにする。BQのcosine類似度順。同点は公開日時/IDで安定化。重み、スコアの桁丸め、最低件数を満たす条件緩和はない |
| 空・失敗 | domainがない/条件に該当しない場合は0件。LLM・Memory Bank・embedding・BQの失敗は検索失敗として通知し、再検索する。LLM不正出力を入力ミスや0件へ偽装しない |

検索条件は一時的な内部構造であり、DBの新Entityやカラムではない。公開APIにも出さない。関連Shelfは既存配置の逆引きのまま。

## 保存データ

- LLMは既存domainを参照して粗分類を選ぶ。ユーザーの保存確認は引き続き必要。
- context_textに、入力から確定できる国・地域・経路・制度を残す。同国内移動と国際移動を区別する。使用言語だけから国を推測しない。
- 検索用文書embeddingにはタイトル・domain・context・グループとタスクを含める。文書は`RETRIEVAL_DOCUMENT`、検索は`RETRIEVAL_QUERY`。以前は両方がquery型だった。
- search_textは既存派生列として保持するが、今回の目的別SEARCH条件では、異なる役割の情報を混ぜたこの列を絞り込みに使わない。

## 評価の作り方

最初に25件と24検索文を固定した。16検索文を改善用、8検索文を初回の保留評価用とした。改善途中で保留評価の失敗も見たため、以後は未見テストとは呼ばない。

| 観点 | 反例/残すべき例 |
| --- | --- |
| 目的の適合 | 転校あり/転校なし/住民登録だけ。猫だけの引っ越し。旅行と端末移行 |
| 再利用可能性 | 東京→名古屋、大阪→京都、札幌→仙台、福岡→広島。完全一致の1件だけにしない |
| 表現の違い | 転校と在学証明書・転入学、車椅子と車いす、LINEの会話とトーク履歴 |
| 明示条件 | 転校と猫の両方、猫の作業を含まない、日本国内だけ |
| 文脈の優先 | 現在の大阪→京都と過去のロンドン在住。プロフィール有無で候補集合が変わらない |
| 広い検索/該当なし | 引っ越し全般/旅行全般、コーパスにない楽器。無理に結果件数を増やさない |
| ページング | 3件ずつ全ページを取得。重複/欠落なく、絞り込みをプロフィールで迂回しない |

さらに4件の反例を追加した。住民の転入届を転校と取り違えない、犬を猫と同一視しない、airlineをLINEと部分一致させない、日本→英国移動を日本国内限定に混ぜない。反例自体もそれを求める検索では取得できるか確認する。

評価は手書きの期待集合に照合する。判定を生成LLMに採点させない。検索結果の件数だけでも採点しない。必要候補の欠落、目的外候補、先頭候補、domain、プロフィールによる候補集合の変化を別々に記録する。

### 評価基準自体の修正

初期基準には、地域を指定していない3検索で日本の事例を必ず先頭にする誤りがあった。日本語の入力だけでは国内の指定にならず、ロンドンのプロフィールなら英国の事例が上位でもよい。
`school-lexical`、`held-school-cat-background`、`held-school-exclusion`の先頭許容集合を、元から許容した候補集合へ修正した。目的の適否や必須候補は緩めていない。元の定義と全失敗結果を残し、修正内容を最終結果のoracleNotesにも記録する。

## 実行証跡

実Google Cloudプロジェクト`cuckoocue`内の隔離BQデータセットで、LLM準備→私的保存→公開→別ユーザー検索→全ページ取得を実行。認証だけ開発用UID。Memory Bank検索とVertexの生成・embeddingは実サービス。

- 元の入力・期待集合: `web/scripts/search-evaluation-cases.mjs`
- 追加反例: `web/scripts/search-evaluation-challenges.mjs`
- 元の全API操作/生成/保存結果: [preparation.json](review-screenshots/web/search-relevance/preparation.json)
- 改善途中も含むデータ更新: [preparation-v2.json](review-screenshots/web/search-relevance/preparation-v2.json)、[preparation-v3.json](review-screenshots/web/search-relevance/preparation-v3.json)
- 全語ANDの基準値: [baseline.json](review-screenshots/web/search-relevance/baseline.json) (48条件中4合格、8リクエスト失敗)
- 条件解釈の最初の実装: [logic-v2-development.json](review-screenshots/web/search-relevance/logic-v2-development.json) (32条件中6合格)
- タスク目的検索への修正: [logic-v5-full.json](review-screenshots/web/search-relevance/logic-v5-full.json) (旧基準で48条件中44合格。国の欠落2件、順位2件が残った)

### 最終結果

29件の保存データ、29種類の検索文。通常24検索と追加11検索（うち6検索は反例追加後の再確認）をプロフィールなし/ありで実行し、70/70ケースが合格。ページングを含む124 APIリクエストが成功した。これは合成コーパス内の受入結果であり、母集団での「精度100%」ではない。

| 判定 | 結果 |
| --- | --- |
| 必要候補の欠落なし | 70/70 |
| 目的外候補の混入なし | 70/70 |
| 先頭候補が許容範囲 | 70/70 |
| domain一致 | 70/70 |
| プロフィールによる候補集合の変更 | 0件 |

| 検索例 | 件数と挙動 |
| --- | --- |
| 東京→名古屋の転校を伴う引っ越し | 7件。国内の地域違い・英国・海外移住も残す。猫だけ、住民登録だけ、単身引っ越し、異domainは除外 |
| 大阪→京都の転校を伴う引っ越し | 同じ7件。プロフィール有無とも大阪→京都が先頭 |
| 転校と猫の両方 | 1件。要求が狭いので、これは適切な1件 |
| 猫を伴う引っ越し | 2件。犬の引っ越しは入らない |
| 日本国内だけの転校 | 5件。英国国内と日本→英国の移住を除外 |
| イギリス国内だけの転校 | 1件。contextの「英国国内」と同義として一致 |
| 車椅子で東京旅行 | 2件。京都の車いす事例も残し、東京が先頭 |
| LINEを引き継ぐ機種変更 | 3件。airlineアプリを除外。airlineを求める検索では、その1件を取得 |

検索文と競合する属性を除く処理も確認した。大阪→京都の転校では「オンライン申請」だけを補足し、「猫2匹」「新幹線移動」「ロンドン在住」は採用しない。地域未指定の転校ではオンライン申請とロンドン在住を使い、英国に関係する事例が上がる。

文書生成は元の25件中2件（札幌→仙台、福岡→広島）でdomainを学校手続きと判定し、保存時確認で引っ越しへ修正した。全件のtask_groupingsが全タスクを参照した。検索評価の合格を、LLMだけで未確認公開できるという判断に広げない。

thinking budgetを128へ変更後、同じ既存評価を再実行し、通常48/48・追加反例22/22の合計70/70が再度合格した。さらに管理語彙30件について各positive 2件・negative 2件、合計120境界queryを実Vertexで実行し120/120合格した。これは30 domainの境界と初期corpusの受入結果であり、未知の自然文全体の精度保証ではない。

詳細な実行証跡:

- [最終48ケース](review-screenshots/web/search-relevance/acceptance-full.json)、[反例等22ケース](review-screenshots/web/search-relevance/acceptance-challenges.json): 全入力・応答・順位・採用属性・検索条件・SQL・Job情報
- [budget 128での最終48ケース](review-screenshots/web/search-relevance/p0-128-regular-final.json)、[budget 128での反例22ケース](review-screenshots/web/search-relevance/p0-128-challenges-final.json)、[管理語彙120境界query](review-screenshots/web/search-relevance/managed-domain-boundaries-128.json)
- [最終25件の保存状態](review-screenshots/web/search-relevance/preparation-v4.json)、[追加4件の生成/保存/公開](review-screenshots/web/search-relevance/preparation-challenges.json)。最初の25件の再生成過程はv3、国内範囲の表記前に生成した2件の再確認はv4に記録
- [実際の公開競合からの再試行](review-screenshots/web/search-relevance/publication-retry.json): 未コミットの失敗Jobから再送し、公開版1件・配置1件で回復
- [キャッシュなしのSQL再実行](review-screenshots/web/search-relevance/uncached-search.json): 3条件とも同じ全順位。各380,645 bytesを処理、課金対象は20 MiB。最初の検証用上限10 MBでは2テーブル分の最低課金量を下回ったため、検証上限を30 MBに変更して実行
- [実UIの記録](review-screenshots/web/search-relevance/screenshots.json)、[desktop検索](review-screenshots/web/search-relevance/search-desktop-viewport.png)、[mobile検索](review-screenshots/web/search-relevance/search-mobile-viewport.png)、[desktop詳細](review-screenshots/web/search-relevance/detail-desktop.png)、[mobile詳細](review-screenshots/web/search-relevance/detail-mobile.png)。API応答の差し替えなし。開発用UIDだけを付与し、各7件・横はみ出しなし・ページ内例外なしを確認

### Thinking budget 比較（2026-09-20）

固定した改善用16検索文について、実Vertex `gemini-2.5-flash` の条件解釈だけを1024、128、0で各1回実行した。入力、prompt、domain候補、response schemaは同一である。これは検索結果のrecall/precision評価や、プロフィール属性選択の評価ではない。

| budget | domain一致 | エラー | 1024とplan完全一致 | thought token合計 | 全token合計 | 中央応答時間 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1024 | 16/16 | 0 | 16/16 | 5,256 | 23,992 | 1,946 ms |
| 128 | 16/16 | 0 | 14/16 | 2,307 | 21,047 | 1,324 ms |
| 0 | 16/16 | 0 | 14/16 | 0 | 18,741 | 519 ms |

128は1024比でthought tokenを56.1%、全tokenを12.3%削減した。現行Standard料金（入力$0.30/100万token、responseとreasoning出力$2.50/100万token）で、この16件の条件解釈は約$0.0198から$0.0124、1回平均では約$0.00124から$0.00078となる。10万回の条件解釈へ単純換算した差は約$46で、プロフィール属性選択、embedding、BQは含まない。

128の差分は`school-lexical`で同義語集合に「在学証明書」「学校」が増え、`internet`で一般語「回線」が減った2件。domain誤りや構造エラーではないが、「学校」の追加は実コーパスでfalse positiveを増やし得るため、全検索評価を未実施のまま「精度同等」とは扱わない。0では別の1件でAND条件が増えた。128を初期値とし、0への変更は保留する。

`thinkingBudget`はsoft limitなので、128指定でも1呼び出し最大213 thought tokenを観測した。生の`usageMetadata`を検索段階・モデルとともにログへ残し、本番分布で再評価する。

証跡は`thinking-1024.json`、`thinking-128.json`、`thinking-0.json`。再集計は`web/scripts/summarize-thinking-eval.mjs`を使う。

単体21件、実BQの条件分離24ケース、検索UI回帰10件、公開関連UI回帰6件、lint/buildが成功。UI回帰には応答差し替えを含むため、実サービスの証拠とは分ける。

最終48ケースの初回ページ応答は、プロフィールなしの中央値2.60秒/P95 4.00秒、ありの中央値6.76秒/P95 8.91秒。BQ cacheが温まった再実行時の値であり、コールド時の性能保証ではない。プロフィール採用判断のLLM呼び出しが1回増えるため、品質との交換条件として残す。

旧全語ANDの4/48、途中の44/48、最終70/70は、コーパス追加と上記の期待順位修正を含むため単純な精度比較ではない。さらに途中のfinal-full.jsonでは新しい海外事例を「許容」に追加した際、「地域未指定の先頭許容」へ追加し忘れて47/48になった。集計定義を修正後、検索自体を再実行した結果がacceptance-full.jsonである。失敗記録を上書きしていない。

## 運用と限界

- 本番へは未配備。本番公開版の既存embeddingをdocument型へ再生成する必要がある。`rebuild-search-embeddings.mjs`は対象datasetを明示し、既定では更新しない。
- 公開版本文を勝手に書き換えない。今回のcontext修正は私的原本のAPI保存から新しい公開版を作った。旧合成事例の公開停止だけは検証用BQ保守操作で行い、履歴を残す。
- BQ書き込みで別レコード間のtransaction競合も実測した。未コミットで中断が確定した場合だけ別の安定Job IDで再試行する。内容の楽観ロック不一致は再試行しない。COMMIT済みなら結果の回復だけを行う。
- 動的な日本語辞書を`PATTERN_ANALYZER`に渡してBQ SEARCHを行う。既存search_textの索引が効くとは主張しない。低頻度の検索に対する選択であり、規模増加時は実行bytes/latencyを測って再評価する。
- LLMの目的解釈、グループ名、国の記述に依存する。今回の合成事例での合格は全自然文の精度や実ユーザーの再利用価値の証明ではない。

仕様根拠: [BQ検索](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/search_functions)、[embedding task type](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/embeddings/task-types)、[BQ transaction](https://docs.cloud.google.com/bigquery/docs/transactions)。
