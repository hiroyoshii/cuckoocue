package app.cuckoocue.data

data class SeedTask(
    val title: String,
    val priority: Int,
    val categoryKey: String,
    val categoryLabel: String,
    val categoryColorKey: String,
)

object SeedData {
    const val RunId = "run-home"
    const val RunTitle = "手元に置くこと"

    val tasks = listOf(
        SeedTask("水", 0, "account", "アカウント復旧と本人確認まわりの長すぎるカテゴリ", "teal"),
        SeedTask(
            "2段階認証の復旧手段とバックアップコードの保管場所を家族にも分かる形で確認する",
            1,
            "life",
            "生活導線",
            "green",
        ),
        SeedTask("食事場所を分ける", 2, "identity", "本人確認書類", "gold"),
        SeedTask("本人確認書類を撮る", 2, "identity", "本人確認書類", "gold"),
        SeedTask("支払い方法の控えを更新する", 2, "payment", "支払い確認まわりと請求書整理とカード更新", "teal"),
        SeedTask("薬の残数を確認する", 1, "backup", "バックアップ", "green"),
        SeedTask("役所の手続きメモを読む", 2, "city", "自治体手続き", "gold"),
        SeedTask("予備の鍵の場所を確認する", 2, "short", "短", "teal"),
        SeedTask("バックアップ先にログインできるか確認する", 1, "long", "とても長いカテゴリ名の確認と表示崩れ耐性テスト", "green"),
        SeedTask("一行メモを片づける", 2, "life", "生活導線", "green"),
        SeedTask(
            "かなり長いタイトルのタスクがさらに続いてもWidgetでは途中で自然に切れることを確認する",
            2,
            "payment",
            "支払い確認まわりと請求書整理とカード更新",
            "teal",
        ),
        SeedTask("短", 2, "short", "短", "teal"),
    )
}
