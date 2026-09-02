package app.cuckoocue.benchmark

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import app.cuckoocue.data.CuckooDatabase
import app.cuckoocue.data.CuckooRepository
import app.cuckoocue.data.PriorityExposure
import kotlinx.coroutines.runBlocking

class BenchmarkSeedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        runBlocking {
            val dao = CuckooDatabase.getInstance(context).dao()
            val repository = CuckooRepository.getInstance(context)

            if (intent.action == ACTION_COUNT_BENCHMARK_DATA) {
                resultData = "runs=${dao.activeRunCount()}, tasks=${dao.taskCount()}, widget_cues=${dao.widgetCueCount()}"
                return@runBlocking
            }

            if (intent.action != ACTION_RESET_BENCHMARK_SEED) return@runBlocking

            dao.resetSeedData()
            val runCount = intent.getIntExtra(EXTRA_RUN_COUNT, 1).coerceIn(1, 500)
            val tasksPerRun = intent.getIntExtra(EXTRA_TASKS_PER_RUN, 10).coerceIn(0, 50)

            repeat(runCount) { runIndex ->
                val runTitle = if (runIndex == 0) {
                    "手元に置くこと"
                } else {
                    "手元に置くこと ${runIndex + 1}"
                }
                val runId = repository.createRun(runTitle) ?: return@repeat
                repeat(tasksPerRun) { taskIndex ->
                    repository.addTask(
                        runId = runId,
                        title = benchmarkTaskTitle(runIndex, taskIndex),
                        priority = benchmarkPriority(taskIndex),
                    )
                }
            }
        }
    }

    private fun benchmarkTaskTitle(runIndex: Int, taskIndex: Int): String =
        when (taskIndex % 10) {
            0 -> "本人確認書類を撮る"
            1 -> "水"
            2 -> "食事場所を分ける"
            3 -> "支払い方法の控えを更新する"
            4 -> "薬の残数を確認する"
            5 -> "予備の鍵の場所を確認する"
            6 -> "役所の手続きメモを読む"
            7 -> "バックアップ先にログインできるか確認する"
            8 -> "かなり長いタイトルのタスクがさらに続いても途中で自然に切れることを確認する"
            else -> "短 ${runIndex + 1}-${taskIndex + 1}"
        }

    private fun benchmarkPriority(taskIndex: Int): Int =
        when (taskIndex % 3) {
            0 -> PriorityExposure.Strong
            1 -> PriorityExposure.Medium
            else -> PriorityExposure.Quiet
        }

    companion object {
        const val ACTION_RESET_BENCHMARK_SEED = "app.cuckoocue.benchmark.RESET_SEED"
        const val ACTION_COUNT_BENCHMARK_DATA = "app.cuckoocue.benchmark.COUNT_DATA"
        private const val EXTRA_RUN_COUNT = "run_count"
        private const val EXTRA_TASKS_PER_RUN = "tasks_per_run"
    }
}
