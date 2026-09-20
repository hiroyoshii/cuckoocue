export type ManagedDomainStatus = "active" | "draft" | "deprecated";

export type ManagedDomain = {
  id: string;
  label_ja: string;
  description: string;
  includes: readonly string[];
  excludes: readonly string[];
  aliases: readonly string[];
  status: ManagedDomainStatus;
  replacement_id: string | null;
};

export const managedDomains = [
  { id: "moving", label_ja: "引っ越し", description: "住居を移すための準備、退去、移動、入居をまとめた段取り。", includes: ["転居", "荷造り", "旧居の退去と新居への入居"], excludes: ["住所だけを変更する手続きは住所変更", "物件選定だけなら住まい探し"], aliases: ["転居", "住み替え", "引越し"], status: "active", replacement_id: null },
  { id: "travel-preparation", label_ja: "旅行準備", description: "観光、帰省、出張など一時的な旅行へ出る前後の段取り。", includes: ["宿泊と交通の予約", "旅行の持ち物", "留守宅の準備"], excludes: ["長期の居住地変更は引っ越し", "旅券や査証だけの取得は在留・渡航手続き"], aliases: ["旅支度", "旅行計画", "出張準備"], status: "active", replacement_id: null },
  { id: "device-migration", label_ja: "端末移行", description: "スマートフォンやPCの買い替えに伴うデータ、設定、認証の移行。", includes: ["機種変更", "写真や連絡先の移行", "認証アプリの移行"], excludes: ["通信契約だけの解約は契約解約", "アカウントの住所変更は住所変更"], aliases: ["機種変更", "データ移行", "端末引き継ぎ"], status: "active", replacement_id: null },
  { id: "school-procedures", label_ja: "学校手続き", description: "入学、転校、休学、卒業など学校との手続き全体。", includes: ["転入学", "入学書類", "休学・復学"], excludes: ["引っ越し全体の一部としての転校は引っ越し", "試験勉強と出願準備は受験準備"], aliases: ["就学手続き", "転校手続き", "入学手続き"], status: "active", replacement_id: null },
  { id: "pet-care", label_ja: "ペットケア", description: "日常または一時的に動物の健康と生活を維持する段取り。", includes: ["通院", "投薬", "預かりやシッター"], excludes: ["旅行全体の留守宅準備は旅行準備", "引っ越し全体の動物移動は引っ越し"], aliases: ["ペットの世話", "動物ケア", "飼育管理"], status: "active", replacement_id: null },
  { id: "address-change", label_ja: "住所変更", description: "居住移動後に機関やサービスへ登録住所を届け出る段取り。", includes: ["銀行の登録住所", "勤務先への住所届", "郵便転送"], excludes: ["荷造りや退去を含む全体は引っ越し", "契約そのものを終了する場合は契約解約"], aliases: ["住所届", "登録住所変更", "転居後の届出"], status: "active", replacement_id: null },
  { id: "housing-search", label_ja: "住まい探し", description: "賃貸または購入候補の条件整理、比較、内見、申込みの段取り。", includes: ["物件検索", "内見", "入居審査"], excludes: ["売買契約と引渡しは住宅購入", "入居・退去全体は引っ越し"], aliases: ["部屋探し", "物件探し", "家探し"], status: "active", replacement_id: null },
  { id: "home-purchase", label_ja: "住宅購入", description: "住宅の購入申込みから融資、契約、引渡しまでの段取り。", includes: ["住宅ローン", "売買契約", "引渡し"], excludes: ["候補比較と内見だけなら住まい探し", "購入後の工事は住宅改修"], aliases: ["家の購入", "不動産購入", "マイホーム購入"], status: "active", replacement_id: null },
  { id: "home-renovation", label_ja: "住宅改修", description: "住宅の修繕、改装、設備更新を計画し施工する段取り。", includes: ["リフォーム", "修繕見積り", "設備交換"], excludes: ["日常の清掃は大掃除・片付け", "住宅売買は住宅購入"], aliases: ["リフォーム", "リノベーション", "家の修繕"], status: "active", replacement_id: null },
  { id: "decluttering", label_ja: "大掃除・片付け", description: "住居や保管物を整理、処分、清掃する段取り。", includes: ["大掃除", "不用品整理", "書類や衣類の片付け"], excludes: ["退去を伴う荷造りは引っ越し", "遺品と相続全体は葬儀・死後手続き"], aliases: ["断捨離", "整理整頓", "片づけ"], status: "active", replacement_id: null },
  { id: "job-search", label_ja: "就職活動", description: "求人探索、応募、選考、内定判断までの段取り。", includes: ["応募書類", "面接", "求人比較"], excludes: ["現職の退職は転職・退職", "内定後の初日準備は入社準備"], aliases: ["就活", "求職活動", "仕事探し"], status: "active", replacement_id: null },
  { id: "job-change-exit", label_ja: "転職・退職", description: "現職を離れ、引継ぎと退職後の切替を行う段取り。", includes: ["退職届", "業務引継ぎ", "社会保険の切替"], excludes: ["求人への応募は就職活動", "新しい勤務先への提出は入社準備"], aliases: ["退職準備", "転職準備", "会社を辞める"], status: "active", replacement_id: null },
  { id: "job-onboarding", label_ja: "入社準備", description: "内定後から就業開始までに勤務先と生活を整える段取り。", includes: ["入社書類", "初出勤", "就業環境の準備"], excludes: ["応募と面接は就職活動", "前職の引継ぎは転職・退職"], aliases: ["入社手続き", "オンボーディング", "初出勤準備"], status: "active", replacement_id: null },
  { id: "business-startup", label_ja: "開業準備", description: "個人事業や法人を開始するための届出、資金、業務基盤の段取り。", includes: ["開業届", "法人設立", "事業用口座"], excludes: ["毎年の税務申告は確定申告", "一度限りの催事はイベント開催"], aliases: ["起業準備", "会社設立", "事業開始"], status: "active", replacement_id: null },
  { id: "marriage-procedures", label_ja: "結婚手続き", description: "婚姻に伴う届出、名義、生活契約の変更をまとめた段取り。", includes: ["婚姻届", "氏名変更", "家計や保険の見直し"], excludes: ["披露宴の開催準備だけならイベント開催", "住所だけの変更は住所変更"], aliases: ["婚姻手続き", "入籍準備", "結婚後の名義変更"], status: "active", replacement_id: null },
  { id: "pregnancy-childbirth", label_ja: "妊娠・出産", description: "妊娠中から出産直後までの受診、入院、届出、生活準備。", includes: ["妊婦健診", "出産入院", "出生直後の届出"], excludes: ["継続的な保育や育児制度は育児手続き", "一般の入院は通院・入院"], aliases: ["出産準備", "産前産後", "妊娠中の準備"], status: "active", replacement_id: null },
  { id: "childcare-procedures", label_ja: "育児手続き", description: "子育て期の保育、給付、予防接種、生活制度を利用する段取り。", includes: ["保育園申込み", "児童手当", "予防接種予定"], excludes: ["出産そのものは妊娠・出産", "学校への入学や転校は学校手続き"], aliases: ["子育て手続き", "保育手続き", "育児制度"], status: "active", replacement_id: null },
  { id: "caregiving", label_ja: "介護", description: "継続的な介護サービス、生活支援、家族の役割を整える段取り。", includes: ["要介護認定", "介護サービス選定", "在宅介護の分担"], excludes: ["治療目的の入退院は通院・入院", "死亡後の手続きは葬儀・死後手続き"], aliases: ["介護準備", "高齢者ケア", "在宅介護"], status: "active", replacement_id: null },
  { id: "medical-care", label_ja: "通院・入院", description: "診察、検査、治療、入退院に必要な準備と記録の段取り。", includes: ["初診準備", "手術入院", "退院後の受診"], excludes: ["妊娠・出産の入院は妊娠・出産", "介護サービスの継続利用は介護"], aliases: ["受診準備", "入院準備", "治療スケジュール"], status: "active", replacement_id: null },
  { id: "bereavement", label_ja: "葬儀・死後手続き", description: "死亡直後の連絡、葬送、契約停止、行政届出をまとめた段取り。", includes: ["葬儀", "死亡届", "故人契約の停止"], excludes: ["財産の分割と申告は相続手続き", "生前の介護は介護"], aliases: ["葬儀準備", "死後事務", "おくやみ手続き"], status: "active", replacement_id: null },
  { id: "disaster-preparedness", label_ja: "防災準備", description: "災害前の備蓄、避難、連絡、住居対策を整える段取り。", includes: ["非常持出品", "避難経路", "家族の連絡方法"], excludes: ["旅行の持ち物は旅行準備", "被災後の住宅工事は住宅改修"], aliases: ["災害対策", "避難準備", "防災対策"], status: "active", replacement_id: null },
  { id: "event-planning", label_ja: "イベント開催", description: "複数人が参加する催事を企画し、会場、案内、当日運営を行う段取り。", includes: ["会場予約", "参加者案内", "当日進行"], excludes: ["旅行者本人の旅程は旅行準備", "行政上の婚姻届は結婚手続き"], aliases: ["催事準備", "行事運営", "イベント企画"], status: "active", replacement_id: null },
  { id: "exam-preparation", label_ja: "受験準備", description: "試験選択、出願、学習、受験当日までを管理する段取り。", includes: ["出願", "試験勉強", "受験票と会場確認"], excludes: ["合格後の入学書類は学校手続き", "資格の期限更新は免許・資格更新"], aliases: ["試験準備", "入試準備", "資格試験対策"], status: "active", replacement_id: null },
  { id: "tax-return", label_ja: "確定申告", description: "所得と控除資料を集め、税額確認と申告を行う段取り。", includes: ["控除証明書", "申告書作成", "納税"], excludes: ["相続税を含む遺産整理全体は相続手続き", "事業開始時の届出は開業準備"], aliases: ["税務申告", "所得税申告", "確申"], status: "active", replacement_id: null },
  { id: "inheritance", label_ja: "相続手続き", description: "相続人と財産を確認し、分割、名義、申告を進める段取り。", includes: ["相続人調査", "遺産分割", "相続登記"], excludes: ["葬儀と死亡直後の契約停止は葬儀・死後手続き", "通常の確定申告は確定申告"], aliases: ["遺産相続", "相続整理", "遺産手続き"], status: "active", replacement_id: null },
  { id: "vehicle-purchase", label_ja: "車両購入", description: "自動車や二輪車の選定、契約、登録、納車までの段取り。", includes: ["車選び", "購入契約", "納車準備"], excludes: ["購入後の継続整備は車検・車両整備", "運転免許の更新は免許・資格更新"], aliases: ["車の購入", "自動車購入", "バイク購入"], status: "active", replacement_id: null },
  { id: "vehicle-maintenance", label_ja: "車検・車両整備", description: "保有車両の点検、修理、法定検査、消耗品交換の段取り。", includes: ["車検", "定期点検", "タイヤ交換"], excludes: ["車両の取得は車両購入", "運転免許の更新は免許・資格更新"], aliases: ["車の整備", "自動車点検", "メンテナンス"], status: "active", replacement_id: null },
  { id: "license-renewal", label_ja: "免許・資格更新", description: "期限のある免許、資格、認定を更新・再認定する段取り。", includes: ["運転免許更新", "資格更新研修", "更新書類"], excludes: ["新しい試験への出願と学習は受験準備", "在留資格の更新は在留・渡航手続き"], aliases: ["免許更新", "資格更新", "認定更新"], status: "active", replacement_id: null },
  { id: "immigration-travel-documents", label_ja: "在留・渡航手続き", description: "旅券、査証、在留資格、出入国に必要な公的手続きを進める段取り。", includes: ["パスポート申請", "ビザ申請", "在留資格更新"], excludes: ["宿泊や荷物を含む旅行全体は旅行準備", "国内の免許更新は免許・資格更新"], aliases: ["渡航書類", "ビザ手続き", "在留資格手続き"], status: "active", replacement_id: null },
  { id: "contract-cancellation", label_ja: "契約解約", description: "継続サービスや会員契約を停止し、返却、精算、データ退避を行う段取り。", includes: ["サブスク解約", "通信契約停止", "レンタル品返却"], excludes: ["引っ越し全体の一部なら引っ越し", "故人契約の一括停止は葬儀・死後手続き"], aliases: ["サービス解約", "退会", "契約終了"], status: "active", replacement_id: null },
] as const satisfies readonly ManagedDomain[];

const activeDomains = managedDomains.filter((domain) => domain.status === "active");
const activeByLabel = new Map<string, ManagedDomain>(activeDomains.map((domain) => [domain.label_ja, domain]));
const byAlias = new Map<string, ManagedDomain>(activeDomains.flatMap((domain) => domain.aliases.map((alias) => [alias, domain] as const)));

export function activeDomainLabels(): string[] {
  return activeDomains.map((domain) => domain.label_ja);
}

export function isActiveDomainLabel(value: string): boolean {
  return activeByLabel.has(value.trim());
}

export function resolveDomainLabel(value: string): string | null {
  const normalized = value.trim();
  return activeByLabel.get(normalized)?.label_ja ?? byAlias.get(normalized)?.label_ja ?? null;
}
