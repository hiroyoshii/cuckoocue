// UI fixtures only. These are not a proposed storage schema or real user data.
window.mockFixtures = {
  revisions: [
    { id: "revision-moving-3", title: "猫と暮らす家の引っ越し", version: 3, author: "haru", tasks: [
      { title: "ペット可の条件と入居日を確認する", day: -30 },
      { title: "引っ越し業者と猫の移動手段を決める", day: -21 },
      { title: "通院記録と必要な薬をまとめる", day: -14 },
      { title: "電気・ガス・水道の切り替えを手配する", day: -7 },
      { title: "キャリーと当日使うものをまとめる", day: -1 },
      { title: "新居に猫が落ち着ける部屋を用意する", day: 0 },
    ] },
    { id: "revision-address-1", title: "引っ越しに伴う住所変更", version: 1, author: "nami", tasks: [
      { title: "転出・転入の手続きを確認する", day: -14 },
      { title: "郵便の転送を申し込む", day: -7 },
      { title: "契約中のサービスの住所を変更する", day: 3 },
    ] },
    { id: "revision-pets-2", title: "猫の留守番を頼む準備", version: 2, author: "haru", tasks: [
      { title: "食事と薬のメモをまとめる", day: -7 },
      { title: "鍵と緊急連絡先を預ける", day: -1 },
    ] },
  ],
  shelves: [
    { id: "shelf-cats", title: "猫2匹と暮らす", context: "引っ越し、外出、日々の備え。猫2匹との暮らしで使うリスト。", owner: "haru", revisions: ["revision-moving-3", "revision-pets-2"] },
    { id: "shelf-moving", title: "国内の引っ越し", context: "住まいを変えるときの手続きと準備。", owner: "nami", revisions: ["revision-address-1"] },
  ],
  completed: { title: "東京から名古屋への引っ越し", anchor: "2026-08-30", completed: "2026-09-02", tasks: [
    { title: "ペット可の条件と入居日を確認する", day: -30 },
    { title: "引っ越し業者と猫の移動手段を決める", day: -21 },
    { title: "通院記録と必要な薬をまとめる", day: -14 },
    { title: "電気・ガス・水道の切り替えを手配する", day: -7 },
    { title: "キャリーと当日使うものをまとめる", day: -1 },
    { title: "新居に猫が落ち着ける部屋を用意する", day: 0 },
  ] },
};
