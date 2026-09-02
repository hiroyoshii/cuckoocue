package app.cuckoocue.debug

import android.content.Context
import app.cuckoocue.data.CuckooDatabase
import app.cuckoocue.data.CuckooRepository
import app.cuckoocue.data.PriorityExposure

private data class DebugSeedTask(
    val title: String,
    val priority: Int?,
)

private object DebugSeedData {
    const val RunTitle = "手元に置くこと"

    val tasks = listOf(
        DebugSeedTask("水", PriorityExposure.Strong),
        DebugSeedTask(
            "2段階認証の復旧手段とバックアップコードの保管場所を家族にも分かる形で確認する",
            PriorityExposure.Medium,
        ),
        DebugSeedTask("食事場所を分ける", PriorityExposure.Quiet),
        DebugSeedTask("本人確認書類を撮る", PriorityExposure.Quiet),
        DebugSeedTask("支払い方法の控えを更新する", PriorityExposure.Quiet),
        DebugSeedTask("薬の残数を確認する", PriorityExposure.Medium),
        DebugSeedTask("役所の手続きメモを読む", PriorityExposure.Quiet),
        DebugSeedTask("予備の鍵の場所を確認する", PriorityExposure.Quiet),
        DebugSeedTask("バックアップ先にログインできるか確認する", PriorityExposure.Medium),
        DebugSeedTask("一行メモを片づける", PriorityExposure.Quiet),
        DebugSeedTask(
            "かなり長いタイトルのタスクがさらに続いてもWidgetでは途中で自然に切れることを確認する",
            PriorityExposure.Quiet,
        ),
        DebugSeedTask("短", PriorityExposure.Quiet),
    )

    val manyRunTitles = listOf(
        "朝の支度",
        "出発前",
        "役所まわり",
        "病院の準備",
        "家のメンテ",
        "バックアップ",
        "買い物",
        "旅行前",
        "月末処理",
        "連絡すること",
        "読んでおくこと",
        "あとで確認",
        "長い名前のリストでもカード幅の中で自然に省略されることを見る",
        "短",
        "手続き",
        "荷造り",
        "支払い",
        "メモ整理",
    )

    val archivedRunTitles = listOf(
        "先週閉じた準備",
        "終わった調査",
        "古い買い物メモ",
    )
}

suspend fun resetToDebugSeedData(context: Context) {
    val dao = CuckooDatabase.getInstance(context).dao()
    val repository = CuckooRepository.getInstance(context)
    dao.resetSeedData()
    val runId = repository.createRun(DebugSeedData.RunTitle) ?: return
    DebugSeedData.tasks.forEach { task ->
        repository.addTask(
            runId = runId,
            title = task.title,
            priority = task.priority,
        )
    }
    repository.rebuildWidgetCues()
}

suspend fun resetToManyRunsDebugSeedData(context: Context) {
    val dao = CuckooDatabase.getInstance(context).dao()
    val repository = CuckooRepository.getInstance(context)
    dao.resetSeedData()
    DebugSeedData.manyRunTitles.forEachIndexed { index, title ->
        val runId = repository.createRun(title) ?: return@forEachIndexed
        repository.addTask(
            runId = runId,
            title = "今すぐ触る ${index + 1}",
            dueAt = PriorityExposure.startOfDayOffset(0),
        )
        repository.addTask(
            runId = runId,
            title = "少し長い項目名でも一覧カードのプレビューが自然に切れるか確認する ${index + 1}",
            dueAt = PriorityExposure.startOfDayOffset((index % 5 + 1).toLong()),
        )
        repository.addTask(
            runId = runId,
            title = "静かな控え ${index + 1}",
            priority = PriorityExposure.Quiet,
        )
    }
    repository.rebuildWidgetCues()
}

suspend fun resetToArchivedRunsDebugSeedData(context: Context) {
    val repository = CuckooRepository.getInstance(context)
    resetToManyRunsDebugSeedData(context)
    DebugSeedData.archivedRunTitles.forEach { title ->
        val runId = repository.createRun(title) ?: return@forEach
        repository.addTask(
            runId = runId,
            title = "閉じたリストの項目はホームにもwidgetにも出ない",
            priority = PriorityExposure.Strong,
        )
        repository.archiveRun(runId)
    }
    repository.rebuildWidgetCues()
}
