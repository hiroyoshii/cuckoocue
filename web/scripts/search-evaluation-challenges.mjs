import { queries as originalQueries } from "./search-evaluation-cases.mjs";

// Additional counterexamples, not examples in the search planner prompt.
export const documents = [
  { id: "c-address-moving", domain: "引っ越し", title: "東京から名古屋へ引っ越すときの住民登録", tasks: ["東京の区役所で転出届を提出する", "名古屋の市役所で転入届を提出する", "住民票の住所変更を確認する"] },
  { id: "c-dog", domain: "引っ越し", title: "犬と大阪から京都へ引っ越す", tasks: ["犬の移動用ケージを用意する", "新居の近くの動物病院を確認する", "犬の登録住所を変更する"] },
  { id: "c-airline", domain: "端末移行", title: "機種変更でairlineアプリを移す", tasks: ["airlineアプリの予約番号を控える", "新端末へairlineアプリをインストールする", "航空券の予約データを同期する"] },
  { id: "c-international", domain: "引っ越し", title: "東京からロンドンへ子どもと移住する", tasks: ["東京の学校で子どもの転校と退学の手続きをする", "ロンドンの自治体へ学校の入学を申請する", "英国の子どものビザを申請する"] },
];
const extra = (id, message, domain, required) => ({ id, message, domain, required, allowed: required, top: required, split: "challenge" });
export const queries = [
  ...originalQueries.filter(q => ["school-context", "school-generic", "cat-moving", "line", "held-school-exclusion", "held-country-limit"].includes(q.id)).map(q => ({ ...q, split: "challenge", allowed: q.id.startsWith("school-") || q.id === "held-school-exclusion" ? [...q.allowed, "c-international"] : q.allowed })),
  extra("dog-positive", "犬と一緒に引っ越すときの準備", "引っ越し", ["c-dog"]),
  extra("address-positive", "引っ越しの住民登録と転出届・転入届を準備したい", "引っ越し", ["c-address-moving"]),
  extra("airline-positive", "機種変更でairlineアプリの予約データを移したい", "端末移行", ["c-airline"]),
  extra("uk-only", "イギリス国内だけの引っ越し。子どもの転校手続きを探す", "引っ越し", ["m-school-uk"]),
  { ...extra("international-positive", "東京からロンドンへ引っ越すので子どもの転校を準備したい", "引っ越し", [...originalQueries.find(q => q.id === "school-generic").required, "c-international"]), top: ["c-international"] },
];
