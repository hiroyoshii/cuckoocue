package app.cuckoocue.data

import android.content.Context
import android.database.sqlite.SQLiteException
import app.cuckoocue.transfer.ImportedRunPayload
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.Flow

class CuckooRepository internal constructor(
    private val dao: CuckooDao,
    private val runSyncClient: RunSyncClient? = null,
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
        runSyncClient?.enqueue(runId)
        return runId
    }

    suspend fun importRun(
        payload: ImportedRunPayload,
        clock: () -> Long = { System.currentTimeMillis() },
    ): String? {
        if (payload.title.isBlank() || payload.tasks.isEmpty()) return null
        val now = clock()
        val runId = UUID.randomUUID().toString()
        val nextOrder = (dao.maxRunSortOrder() ?: -1) + 1
        val anchor = payload.targetAnchorDay
        val zoneId = ZoneId.systemDefault()
        val tasks = payload.tasks.mapIndexed { index, task ->
            RunTaskEntity(
                id = UUID.randomUUID().toString(),
                runId = runId,
                title = task.title,
                userPriority = task.defaultPriority?.let { PriorityExposure.normalize(it) },
                availableFromAt = task.relativeStartDay
                    ?.let { anchor.plusDays(it.toLong()) }
                    ?.atStartOfDay(zoneId)
                    ?.toInstant()
                    ?.toEpochMilli(),
                dueAt = task.relativeEndDay
                    ?.let { anchor.plusDays(it.toLong()) }
                    ?.atStartOfDay(zoneId)
                    ?.toInstant()
                    ?.toEpochMilli(),
                sortOrder = index,
                createdAt = now,
                updatedAt = now,
            )
        }
        dao.insertRunAndTasks(
            run = RunEntity(
                id = runId,
                title = payload.title.trim(),
                sortOrder = nextOrder,
                createdAt = now,
                updatedAt = now,
            ),
            tasks = tasks,
            now = now,
        )
        runSyncClient?.enqueue(runId)
        return runId
    }

    suspend fun getTasks(runId: String): List<RunTaskEntity> = dao.tasksForRun(runId)

    suspend fun getTask(taskId: String): RunTaskEntity? = dao.taskById(taskId)

    suspend fun renameRun(runId: String, title: String, clock: () -> Long = { System.currentTimeMillis() }): Boolean {
        val cleanTitle = title.trim()
        if (cleanTitle.isEmpty()) return false
        val changed = dao.updateRunTitle(runId, cleanTitle, clock()) == 1
        if (changed) runSyncClient?.enqueue(runId)
        return changed
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
        runSyncClient?.enqueue(runId)
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
        runSyncClient?.enqueue(afterTask.runId)
        return taskId
    }

    suspend fun updateTask(
        taskId: String,
        title: String,
        availableFromAt: Long?,
        dueAt: Long?,
        priority: Int?,
        clock: () -> Long = { System.currentTimeMillis() },
    ): Boolean {
        val cleanTitle = title.trim()
        if (availableFromAt != null && dueAt != null && availableFromAt > dueAt) return false
        val now = clock()
        val changed = dao.updateTaskDetailsAndRefreshWidgetCue(
            taskId = taskId,
            title = cleanTitle,
            availableFromAt = availableFromAt,
            dueAt = dueAt,
            userPriority = priority?.let { PriorityExposure.normalize(it) },
            now = now,
        ) == 1
        if (changed) dao.taskById(taskId)?.runId?.let { runSyncClient?.enqueue(it) }
        return changed
    }

    suspend fun movePendingTask(runId: String, taskId: String, delta: Int): Boolean {
        val now = System.currentTimeMillis()
        val changed = dao.movePendingTaskAndRefreshMovedWidgetCue(runId, taskId, delta, now)
        if (changed) runSyncClient?.enqueue(runId)
        return changed
    }

    suspend fun deleteTask(taskId: String) {
        val runId = dao.taskById(taskId)?.runId
        dao.deleteTaskAndRemoveWidgetCue(taskId, System.currentTimeMillis())
        runId?.let { runSyncClient?.enqueue(it) }
    }

    suspend fun archiveRun(runId: String, clock: () -> Long = { System.currentTimeMillis() }): Boolean {
        val now = clock()
        val changed = dao.archiveRunAndRemoveWidgetCues(runId, now) == 1
        if (changed) runSyncClient?.enqueue(runId)
        return changed
    }

    suspend fun completeTask(taskId: String): CompleteMutationResult {
        return try {
            val runId = dao.taskById(taskId)?.runId
            dao.completeTaskAndRemoveWidgetCue(taskId, System.currentTimeMillis()).also {
                if (it.completed) runId?.let { id -> runSyncClient?.enqueue(id) }
            }
        } catch (_: SQLiteException) {
            CompleteMutationResult(completed = false, removedFromWidget = false)
        }
    }

    suspend fun undoCompleteTask(
        taskId: String,
    ): Boolean {
        return try {
            val task = dao.taskById(taskId)
            val runId = task?.runId
            val priority = task?.effectivePriority()
            val changed = dao.undoCompleteTaskAndRestoreWidgetCue(
                taskId = taskId,
                now = System.currentTimeMillis(),
                priority = priority,
            ) == 1
            if (changed) runId?.let { runSyncClient?.enqueue(it) }
            changed
        } catch (_: SQLiteException) {
            false
        }
    }

    suspend fun syncRunNow(runId: String): Boolean = runSyncClient?.sync(runId) ?: false

    fun syncAllRuns() {
        runSyncClient?.enqueueAll()
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
                instance ?: CuckooDatabase.getInstance(context).dao().let { dao ->
                    CuckooRepository(
                        dao,
                        RunSyncClient(dao, context.getString(app.cuckoocue.R.string.cuckoo_cue_web_url)),
                    ).also { instance = it }
                }
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
