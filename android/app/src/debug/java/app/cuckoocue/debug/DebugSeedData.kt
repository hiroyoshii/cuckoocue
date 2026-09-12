package app.cuckoocue.debug

import android.content.Context
import app.cuckoocue.data.CuckooDatabase
import app.cuckoocue.data.CuckooRepository
import app.cuckoocue.data.PriorityExposure

private data class DebugSeedTask(
    val title: String,
    val priority: Int?,
)

private data class DebugSeedRun(
    val title: String,
    val dueTodayTask: String,
    val upcomingTask: String,
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

    val manyRuns = listOf(
        DebugSeedRun(
            title = "朝の支度",
            dueTodayTask = "水筒に水を入れる",
            upcomingTask = "明日の服を玄関近くに置く",
        ),
        DebugSeedRun(
            title = "出発前",
            dueTodayTask = "戸締まりと火元を確認する",
            upcomingTask = "移動中に読む案内を保存する",
        ),
        DebugSeedRun(
            title = "役所まわり",
            dueTodayTask = "本人確認書類をかばんに入れる",
            upcomingTask = "転出届の受付時間を確認する",
        ),
        DebugSeedRun(
            title = "病院の準備",
            dueTodayTask = "診察券と紹介状をまとめる",
            upcomingTask = "薬の残数をメモする",
        ),
        DebugSeedRun(
            title = "家のメンテ",
            dueTodayTask = "換気フィルターの型番を確認する",
            upcomingTask = "粗大ごみの回収日を控える",
        ),
        DebugSeedRun(
            title = "バックアップ",
            dueTodayTask = "復旧コードの保管場所を確認する",
            upcomingTask = "外付けドライブにログインする",
        ),
        DebugSeedRun(
            title = "旅行前",
            dueTodayTask = "パスポートの期限を確認する",
            upcomingTask = "空港までの移動時間を調べる",
        ),
        DebugSeedRun(
            title = "月末処理",
            dueTodayTask = "請求書の未処理分を確認する",
            upcomingTask = "来月の支払い予定を見直す",
        ),
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
    DebugSeedData.manyRuns.forEachIndexed { index, run ->
        val runId = repository.createRun(run.title) ?: return@forEachIndexed
        repository.addTask(
            runId = runId,
            title = run.dueTodayTask,
            dueAt = PriorityExposure.startOfDayOffset(0),
        )
        repository.addTask(
            runId = runId,
            title = run.upcomingTask,
            dueAt = PriorityExposure.startOfDayOffset((index % 5 + 1).toLong()),
        )
        repository.addTask(
            runId = runId,
            title = "あとで必要なら見直す控え ${index + 1}",
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
