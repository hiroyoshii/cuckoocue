package app.cuckoocue.data

import android.content.Context
import android.database.sqlite.SQLiteException
import java.util.UUID
import kotlinx.coroutines.flow.Flow

class CuckooRepository internal constructor(
    private val dao: CuckooDao,
) {

    val widgetCues: Flow<List<WidgetCue>>
        get() = dao.observeWidgetCues()
    val firstRun: Flow<RunEntity?>
        get() = dao.observeFirstRun()
    val runs: Flow<List<RunEntity>>
        get() = dao.observeRuns()

    fun observeTasks(runId: String): Flow<List<RunTaskEntity>> = dao.observeTasks(runId)

    fun observeTaskPreview(runId: String, limit: Int = RunCardPreviewLimit): Flow<List<RunTaskEntity>> =
        dao.observeTaskPreview(runId, limit)

    fun observeWidgetCues(runId: String): Flow<List<WidgetCue>> = dao.observeWidgetCuesForRun(runId)

    suspend fun createRun(title: String, clock: () -> Long = { System.currentTimeMillis() }): String? {
        val cleanTitle = title.trim()
        if (cleanTitle.isEmpty()) return null
        val now = clock()
        val runId = UUID.randomUUID().toString()
        val nextOrder = (dao.maxRunSortOrder() ?: -1) + 1
        dao.insertRun(
            RunEntity(
                id = runId,
                title = cleanTitle,
                sortOrder = nextOrder,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return runId
    }

    suspend fun renameRun(runId: String, title: String, clock: () -> Long = { System.currentTimeMillis() }): Boolean {
        val cleanTitle = title.trim()
        if (cleanTitle.isEmpty()) return false
        return dao.updateRunTitle(runId, cleanTitle, clock()) == 1
    }

    suspend fun addTask(
        runId: String,
        title: String,
        dueAt: Long? = null,
        priority: Int? = null,
        clock: () -> Long = { System.currentTimeMillis() },
    ): String? {
        val cleanTitle = title.trim()
        if (cleanTitle.isEmpty()) return null

        val now = clock()
        val nextOrder = (dao.maxSortOrder(runId) ?: -1) + 1
        val taskId = UUID.randomUUID().toString()
        dao.insertTaskAndRefreshWidgetCue(
            RunTaskEntity(
                id = taskId,
                runId = runId,
                title = cleanTitle,
                dueAt = dueAt,
                userPriority = priority?.let { PriorityExposure.normalize(it) },
                sortOrder = nextOrder,
                createdAt = now,
                updatedAt = now,
            ),
            now = now,
        )
        return taskId
    }

    suspend fun addTaskAfter(
        afterTaskId: String,
        title: String,
        dueAt: Long? = null,
        priority: Int? = null,
        clock: () -> Long = { System.currentTimeMillis() },
    ): String? {
        val cleanTitle = title.trim()
        val afterTask = dao.taskById(afterTaskId) ?: return null
        val now = clock()
        val taskId = UUID.randomUUID().toString()
        dao.insertTaskAtSortOrder(
            RunTaskEntity(
                id = taskId,
                runId = afterTask.runId,
                title = cleanTitle,
                dueAt = dueAt,
                userPriority = priority?.let { PriorityExposure.normalize(it) },
                sortOrder = afterTask.sortOrder + 1,
                createdAt = now,
                updatedAt = now,
            ),
            now = now,
        )
        return taskId
    }

    suspend fun updateTask(
        taskId: String,
        title: String,
        dueAt: Long?,
        priority: Int?,
        clock: () -> Long = { System.currentTimeMillis() },
    ): Boolean {
        val cleanTitle = title.trim()
        val now = clock()
        return dao.updateTaskDetailsAndRefreshWidgetCue(
            taskId = taskId,
            title = cleanTitle,
            dueAt = dueAt,
            userPriority = priority?.let { PriorityExposure.normalize(it) },
            now = now,
        ) == 1
    }

    suspend fun movePendingTask(runId: String, taskId: String, delta: Int): Boolean {
        val now = System.currentTimeMillis()
        return dao.movePendingTaskAndRefreshMovedWidgetCue(runId, taskId, delta, now)
    }

    suspend fun deleteTask(taskId: String) {
        dao.deleteTaskAndRemoveWidgetCue(taskId)
    }

    suspend fun archiveRun(runId: String, clock: () -> Long = { System.currentTimeMillis() }): Boolean {
        val now = clock()
        return dao.archiveRunAndRemoveWidgetCues(runId, now) == 1
    }

    suspend fun completeTask(taskId: String): CompleteMutationResult =
        try {
            dao.completeTaskAndRemoveWidgetCue(taskId, System.currentTimeMillis())
        } catch (_: SQLiteException) {
            CompleteMutationResult(completed = false, removedFromWidget = false)
        }

    suspend fun undoCompleteTask(
        taskId: String,
    ): Boolean =
        try {
            val task = dao.taskById(taskId)
            val priority = task?.effectivePriority()
            dao.undoCompleteTaskAndRestoreWidgetCue(
                taskId = taskId,
                now = System.currentTimeMillis(),
                priority = priority,
            ) == 1
        } catch (_: SQLiteException) {
            false
        }

    suspend fun getWidgetCues(): List<WidgetCue> = dao.getWidgetCues()

    suspend fun getFirstCompletedTask(): RunTaskEntity? = dao.firstCompletedTask()

    suspend fun rebuildWidgetCues(now: Long = System.currentTimeMillis()) {
        dao.replaceWidgetCues(
            dao.widgetCueCandidates()
                .mapNotNull { candidate ->
                    candidate.toWidgetCueEntity(now)
                },
        )
    }

    companion object {
        const val RunCardPreviewLimit = 5

        @Volatile private var instance: CuckooRepository? = null

        fun getInstance(context: Context): CuckooRepository =
            instance ?: synchronized(this) {
                instance ?: CuckooRepository(
                    CuckooDatabase.getInstance(context).dao(),
                ).also { instance = it }
            }
    }
}

private fun RunTaskEntity.effectivePriority(now: Long = System.currentTimeMillis()): Int =
    userPriority?.let { PriorityExposure.normalize(it) } ?: PriorityExposure.compute(dueAt, now)

private fun WidgetCueCandidate.effectivePriority(now: Long): Int =
    userPriority?.let { PriorityExposure.normalize(it) } ?: PriorityExposure.compute(dueAt, now)

private fun WidgetCueCandidate.toWidgetCueEntity(now: Long): WidgetCueEntity? {
    val priority = effectivePriority(now)
    if (title.isBlank() || priority == PriorityExposure.Quiet) return null
    return WidgetCueEntity(
        taskId = taskId,
        runId = runId,
        priority = priority,
        createdAt = now,
        updatedAt = now,
    )
}
