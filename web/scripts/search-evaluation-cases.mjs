// Synthetic, reviewer-labelled cases. Labels are not provided to the search LLM.
// Freeze this file before baseline; do not remove failures to improve the score.
const entry = (id, domain, title, tasks) => ({ id, domain, title, tasks });
export const documents = [
  entry("m-school-tokyo", "引っ越し", "子どもと東京から名古屋への引っ越し", ["東京の在籍校から子どもの転校書類を受け取る", "名古屋の教育委員会で転入学の手続きをする", "新しい通学路を親子で歩く"]),
  entry("m-school-osaka", "引っ越し", "大阪から京都へ家族で転居する", ["子どもの転校を現在の小学校に連絡する", "京都で転入学先の学校を確認する", "学用品と通学経路を準備する"]),
  entry("m-school-sapporo", "引っ越し", "札幌から仙台への住み替えと学校の変更", ["在学証明書と教科書給与証明書を受け取る", "仙台市で転入学通知書を受領する", "新しい学校へ書類を提出する"]),
  entry("m-school-cat", "引っ越し", "子どもと猫2匹との東京から名古屋への転居", ["子どもの転校手続きを東京の小学校で始める", "名古屋の転入学先へ書類を提出する", "猫2匹の新幹線移動用ケージを準備する"]),
  entry("m-school-uk", "引っ越し", "ロンドンからブライトンへ子連れで引っ越す", ["ブライトンの自治体に子どもの転校申請を出す", "in-year school admissionの空き状況を確認する", "Council Taxの登録先を変更する"]),
  entry("m-cat", "引っ越し", "猫2匹と東京から名古屋への引っ越し", ["猫の移動用ケージを準備する", "新幹線のペット乗車条件を確認する", "名古屋の新居で脱走防止対策をする"]),
  entry("m-single", "引っ越し", "東京から名古屋への単身引っ越し", ["引っ越し業者を予約する", "東京の旧居の電気を解約する", "名古屋の新居で水道を開通する"]),
  entry("m-no-school", "引っ越し", "子どもは転校しない学区内の引っ越し", ["同じ学区の新居へ荷物を運ぶ", "電気と水道の契約先住所を変更する", "区役所へ転居届を提出する"]),
  entry("m-piano", "引っ越し", "ピアノのある家の引っ越し", ["ピアノ専門の運送業者を予約する", "搬入口の幅と階段を測る", "搬入後の調律を依頼する"]),
  entry("m-internet", "引っ越し", "引っ越し時の通信契約", ["光回線の移転手続きを申し込む", "新居のインターネット開通工事を予約する", "旧居のルーターを返却する"]),
  entry("t-tokyo-kids", "旅行準備", "子どもと東京を観光する準備", ["東京の子連れ向けホテルを予約する", "浅草と上野の観光ルートを決める", "子どもの着替えと常備薬を荷物に入れる"]),
  entry("t-osaka-kids", "旅行準備", "子どもと大阪旅行", ["大阪の家族向けホテルを予約する", "子どもの休憩を入れた観光計画を立てる", "旅行中の着替えを用意する"]),
  entry("t-tokyo-solo", "旅行準備", "東京への一人旅", ["東京のホテルを予約する", "上野の美術館のチケットを取る", "新幹線の指定席を予約する"]),
  entry("t-tokyo-chair", "旅行準備", "車椅子で東京観光", ["東京のホテルに車椅子対応の客室を確認する", "観光施設のバリアフリー動線を調べる", "駅で乗降の介助を予約する"]),
  entry("t-sitter", "旅行準備", "東京旅行中の留守宅と猫の世話", ["旅行中に留守番する猫の世話をシッターに依頼する", "猫の食事と投薬の手順を伝える", "東京のホテルを予約する"]),
  entry("d-ios-line", "端末移行", "iPhoneからAndroidへLINEを移す", ["LINEのトーク履歴をバックアップする", "新しいAndroidでLINEにログインする", "連絡先と写真の移行結果を確認する"]),
  entry("d-android-line", "端末移行", "Androidの機種変更とメッセージ引き継ぎ", ["LINEの引き継ぎ設定を確認する", "トーク履歴を保存して新しいスマートフォンで復元する", "認証用の電話番号を確認する"]),
  entry("d-photos", "端末移行", "機種変更で写真だけを移す", ["写真をクラウドにバックアップする", "新端末へ写真をダウンロードする", "アルバムごとの枚数を確認する"]),
  entry("d-auth", "端末移行", "スマートフォンの認証アプリを移行する", ["二段階認証の復旧コードを保存する", "新端末へ認証アプリのアカウントを移す", "旧端末を消す前にログインを試す"]),
  entry("e-school", "学校手続き", "引っ越さずに学校を変える", ["転校先の受入条件を学校に確認する", "在籍校から在学証明書を受け取る", "通学方法を変更する"]),
  entry("p-sitter", "ペットケア", "仕事の出張中に猫を預ける", ["猫のペットシッターを予約する", "食事と投薬の手順を共有する", "緊急時の動物病院を伝える"]),
  entry("a-address", "住所変更", "銀行と携帯電話の住所変更", ["銀行の登録住所を変更する", "携帯電話の請求先住所を変更する", "勤務先へ新住所を届け出る"]),
  entry("m-school-fukuoka", "引っ越し", "福岡から広島へ、小学生の新生活", ["現在の学校から在学証明書を受領する", "広島市の転入学手続きを行う", "指定された小学校へ教科書の引き継ぎを相談する"]),
  entry("t-kyoto-chair", "旅行準備", "段差の少ない京都旅行を準備する", ["車いすで利用できる宿泊施設を予約する", "観光ルートの段差とエレベーターを確認する", "鉄道会社へ移動の介助を申し込む"]),
  entry("d-message", "端末移行", "買い替えたスマホへ会話を残す", ["LINEの会話データを保存する", "新端末でアカウントを引き継ぐ", "過去のメッセージが表示されるか確認する"]),
];
const school = ["m-school-tokyo", "m-school-osaka", "m-school-sapporo", "m-school-cat", "m-school-uk", "m-school-fukuoka"];
const jpSchool = school.filter(id => id !== "m-school-uk");
const moving = documents.filter(d => d.domain === "引っ越し").map(d => d.id);
const travel = documents.filter(d => d.domain === "旅行準備").map(d => d.id);
const line = ["d-ios-line", "d-android-line", "d-message"];
// required: must be retrievable; allowed: not a false positive; top: suitable
// first choice. Region variants stay useful, but are not all equally suitable.
const query = (id, message, domain, required, top, allowed = required, split = "development") => ({ id, message, domain, required, allowed, top, split });
export const queries = [
  query("school-context", "子どもの転校を伴う東京から名古屋への引っ越し", "引っ越し", jpSchool, ["m-school-tokyo", "m-school-cat"], school),
  query("school-other-region", "子どもの転校がある大阪から京都への引っ越し", "引っ越し", jpSchool, ["m-school-osaka"], school),
  query("school-generic", "引っ越しに伴う転校の段取り", "引っ越し", school, school),
  query("school-lexical", "引っ越しで在学証明書を受け取って新しい学校に入る手続き", "引っ越し", jpSchool, jpSchool, school),
  query("cat-moving", "猫2匹と東京から名古屋へ新幹線で引っ越す", "引っ越し", ["m-cat", "m-school-cat"], ["m-cat", "m-school-cat"]),
  query("school-and-cat", "引っ越しの転校手続きと猫の移動を両方準備したい", "引っ越し", ["m-school-cat"], ["m-school-cat"]),
  query("moving-broad", "引っ越しの準備", "引っ越し", moving, moving),
  query("piano", "ピアノの運搬がある引っ越し", "引っ越し", ["m-piano"], ["m-piano"]),
  query("internet", "引っ越し先でネット回線を開通したい", "引っ越し", ["m-internet"], ["m-internet"]),
  query("tokyo-trip", "東京を旅行する準備", "旅行準備", travel, ["t-tokyo-kids", "t-tokyo-solo", "t-tokyo-chair", "t-sitter"]),
  query("kids-trip", "子どもと東京で観光する準備", "旅行準備", ["t-tokyo-kids", "t-osaka-kids"], ["t-tokyo-kids"]),
  query("chair-trip", "車椅子で東京旅行をする段取り", "旅行準備", ["t-tokyo-chair", "t-kyoto-chair"], ["t-tokyo-chair"]),
  query("trip-sitter", "東京旅行中に猫をシッターへ頼む準備", "旅行準備", ["t-sitter"], ["t-sitter"]),
  query("line", "iPhoneからAndroidへの機種変更でLINEを引き継ぎたい", "端末移行", line, ["d-ios-line"]),
  query("photos", "機種変更で写真を移したい", "端末移行", ["d-photos", "d-ios-line"], ["d-photos"]),
  query("unavailable", "引っ越しでチェンバロを運ぶ段取り", "引っ越し", [], [], ["m-piano"]),
  query("held-school", "広島に引っ越す。小学生の学校を変える準備を知りたい", "引っ越し", jpSchool, ["m-school-fukuoka"], school, "held-out"),
  query("held-school-cat-background", "猫を飼っていますが、今回は引っ越しに伴う転校手続きだけを探しています", "引っ越し", jpSchool, jpSchool, school, "held-out"),
  query("held-school-exclusion", "猫の移動タスクは含まない、引っ越しの転校手続きを探す", "引っ越し", jpSchool.filter(id => id !== "m-school-cat"), jpSchool.filter(id => id !== "m-school-cat"), school.filter(id => id !== "m-school-cat"), "held-out"),
  query("held-country-limit", "日本国内だけで使える、引っ越しの転校手続き", "引っ越し", jpSchool, jpSchool, jpSchool, "held-out"),
  query("held-chair", "京都旅行で車いすを使うときの準備", "旅行準備", ["t-tokyo-chair", "t-kyoto-chair"], ["t-kyoto-chair"], undefined, "held-out"),
  query("held-line", "スマホを買い替えるのでLINEの会話を新端末でも読めるようにしたい", "端末移行", line, line, undefined, "held-out"),
  query("held-auth", "機種変更で認証アプリを引っ越す準備", "端末移行", ["d-auth"], ["d-auth"], undefined, "held-out"),
  query("held-education", "引っ越しはしません。子どもの転校手続きが知りたい", "学校手続き", ["e-school"], ["e-school"], undefined, "held-out"),
];
