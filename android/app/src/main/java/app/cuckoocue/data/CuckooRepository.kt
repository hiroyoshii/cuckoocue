package app.cuckoocue.data

import android.content.Context
import android.database.sqlite.SQLiteException
import app.cuckoocue.transfer.ImportedRunPayload
import app.cuckoocue.transfer.ImportedRunTask
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
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
    val archivedRuns: Flow<List<RunEntity>>
        get() = dao.observeArchivedRuns()
    val cuebooks: Flow<List<CuebookEntity>>
        get() = dao.observeCuebooks()

    fun observeTasks(runId: String): Flow<List<RunTaskEntity>> = dao.observeTasks(runId)

    fun observeCuebookTasks(cuebookId: String): Flow<List<CuebookTaskEntity>> = dao.observeCuebookTasks(cuebookId)

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

    suspend fun createCuebook(
        title: String,
        tasks: List<CuebookTaskDraft>,
        originRevisionId: String? = null,
        clock: () -> Long = { System.currentTimeMillis() },
    ): String? {
        val cleanTitle = title.trim()
        val cleanTasks = tasks.mapNotNull { task ->
            val cleanTaskTitle = task.title.trim()
            if (cleanTaskTitle.isEmpty()) {
                null
            } else {
                task.copy(
                    title = cleanTaskTitle,
                    defaultPriority = task.defaultPriority?.let { PriorityExposure.normalize(it) },
                )
            }
        }
        if (cleanTitle.isEmpty() || cleanTasks.isEmpty()) return null
        if (cleanTasks.any { it.relativeStartDay != null && it.relativeEndDay != null && it.relativeStartDay > it.relativeEndDay }) {
            return null
        }

        val now = clock()
        val cuebookId = UUID.randomUUID().toString()
        dao.insertCuebookAndTasks(
            cuebook = CuebookEntity(
                id = cuebookId,
                title = cleanTitle,
                originRevisionId = originRevisionId?.trim()?.ifEmpty { null },
                createdAt = now,
                updatedAt = now,
            ),
            tasks = cleanTasks.mapIndexed { index, task ->
                CuebookTaskEntity(
                    id = UUID.randomUUID().toString(),
                    cuebookId = cuebookId,
                    title = task.title,
                    defaultPriority = task.defaultPriority,
                    relativeStartDay = task.relativeStartDay,
                    relativeEndDay = task.relativeEndDay,
                    sortOrder = index,
                    createdAt = now,
                    updatedAt = now,
                )
            },
        )
        return cuebookId
    }

    suspend fun createRunFromCuebook(
        cuebookId: String,
        targetAnchorDay: LocalDate,
        clock: () -> Long = { System.currentTimeMillis() },
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): String? {
        val cuebook = dao.cuebookById(cuebookId) ?: return null
        val cuebookTasks = dao.tasksForCuebook(cuebookId).filter { it.title.isNotBlank() }
        if (cuebookTasks.isEmpty()) return null

        val now = clock()
        val runId = UUID.randomUUID().toString()
        val nextOrder = (dao.maxRunSortOrder() ?: -1) + 1
        val tasks = cuebookTasks.mapIndexed { index, task ->
            RunTaskEntity(
                id = UUID.randomUUID().toString(),
                runId = runId,
                sourceTaskId = task.id,
                title = task.title.trim(),
                userPriority = task.defaultPriority?.let { PriorityExposure.normalize(it) },
                availableFromAt = task.relativeStartDay
                    ?.let { targetAnchorDay.plusDays(it.toLong()) }
                    ?.atStartOfDay(zoneId)
                    ?.toInstant()
                    ?.toEpochMilli(),
                dueAt = task.relativeEndDay
                    ?.let { targetAnchorDay.plusDays(it.toLong()) }
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
                title = cuebook.title,
                sourceCuebookId = cuebook.id,
                targetAnchorDay = targetAnchorDay.atStartOfDay(zoneId).toInstant().toEpochMilli(),
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

    suspend fun renameCuebook(
        cuebookId: String,
        title: String,
        clock: () -> Long = { System.currentTimeMillis() },
    ): Boolean {
        val cleanTitle = title.trim()
        if (cleanTitle.isEmpty()) return false
        return dao.updateCuebookTitle(cuebookId, cleanTitle, clock()) == 1
    }

    suspend fun addCuebookTask(
        cuebookId: String,
        title: String,
        defaultPriority: Int? = null,
        relativeStartDay: Int? = null,
        relativeEndDay: Int? = null,
        clock: () -> Long = { System.currentTimeMillis() },
    ): String? {
        val cleanTitle = title.trim()
        if (cleanTitle.isEmpty()) return null
        if (relativeStartDay != null && relativeEndDay != null && relativeStartDay > relativeEndDay) return null
        if (dao.cuebookById(cuebookId) == null) return null

        val now = clock()
        val taskId = UUID.randomUUID().toString()
        dao.insertCuebookTaskAndTouchCuebook(
            CuebookTaskEntity(
                id = taskId,
                cuebookId = cuebookId,
                title = cleanTitle,
                defaultPriority = defaultPriority?.let { PriorityExposure.normalize(it) },
                relativeStartDay = relativeStartDay,
                relativeEndDay = relativeEndDay,
                sortOrder = (dao.maxCuebookTaskSortOrder(cuebookId) ?: -1) + 1,
                createdAt = now,
                updatedAt = now,
            ),
            now = now,
        )
        return taskId
    }

    suspend fun updateCuebookTask(
        cuebookId: String,
        taskId: String,
        title: String,
        defaultPriority: Int?,
        relativeStartDay: Int?,
        relativeEndDay: Int?,
        clock: () -> Long = { System.currentTimeMillis() },
    ): Boolean {
        val cleanTitle = title.trim()
        if (cleanTitle.isEmpty()) return false
        if (relativeStartDay != null && relativeEndDay != null && relativeStartDay > relativeEndDay) return false
        return dao.updateCuebookTaskAndTouchCuebook(
            cuebookId = cuebookId,
            taskId = taskId,
            title = cleanTitle,
            defaultPriority = defaultPriority?.let { PriorityExposure.normalize(it) },
            relativeStartDay = relativeStartDay,
            relativeEndDay = relativeEndDay,
            now = clock(),
        ) == 1
    }

    suspend fun deleteCuebookTask(
        cuebookId: String,
        taskId: String,
        clock: () -> Long = { System.currentTimeMillis() },
    ): Boolean = dao.deleteCuebookTaskAndTouchCuebook(cuebookId, taskId, clock()) == 1

    suspend fun cuebookSnapshot(cuebookId: String): CuebookSnapshot? {
        val cuebook = dao.cuebookById(cuebookId) ?: return null
        val tasks = dao.tasksForCuebook(cuebookId)
            .filter { it.title.isNotBlank() }
            .map {
                CuebookSnapshotTask(
                    title = it.title.trim(),
                    defaultPriority = it.defaultPriority,
                    relativeStartDay = it.relativeStartDay,
                    relativeEndDay = it.relativeEndDay,
                )
            }
        if (tasks.isEmpty()) return null
        return CuebookSnapshot(
            id = cuebook.id,
            title = cuebook.title,
            tasks = tasks,
        )
    }

    suspend fun importRun(
        payload: ImportedRunPayload,
        clock: () -> Long = { System.currentTimeMillis() },
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): String? {
        if (payload.title.isBlank() || payload.tasks.isEmpty()) return null
        val now = clock()
        val runId = UUID.randomUUID().toString()
        val nextOrder = (dao.maxRunSortOrder() ?: -1) + 1
        val anchor = payload.targetAnchorDay
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
                targetAnchorDay = anchor.atStartOfDay(zoneId).toInstant().toEpochMilli(),
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

    suspend fun reuseCompletedTasks(sourceRunId: String, taskIds: List<String>): String? {
        val id = dao.reuseCompletedTasks(sourceRunId, taskIds, UUID.randomUUID().toString(), System.currentTimeMillis())
        if (id != null) runSyncClient?.enqueue(id)
        return id
    }

    suspend fun reuseCompletedRun(
        sourceRunId: String,
        targetAnchorDay: LocalDate,
        clock: () -> Long = { System.currentTimeMillis() },
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): String? {
        val sourceRun = dao.runById(sourceRunId) ?: return null
        val sourceAnchorAt = sourceRun.completedAnchorAt ?: return null
        val sourceTasks = dao.tasksForRun(sourceRunId)
        if (sourceTasks.isEmpty() || sourceTasks.any { it.completedAt == null }) return null

        val sourceAnchorDay = Instant.ofEpochMilli(sourceAnchorAt).atZone(zoneId).toLocalDate()
        val reusableTasks = sourceTasks
            .filter { it.title.isNotBlank() }
            .map { task ->
                ImportedRunTask(
                    title = task.title.trim(),
                    defaultPriority = task.userPriority,
                    relativeStartDay = task.availableFromAt?.relativeDayFrom(sourceAnchorDay, zoneId),
                    relativeEndDay = task.dueAt?.relativeDayFrom(sourceAnchorDay, zoneId),
                )
            }
        if (reusableTasks.isEmpty()) return null

        return importRun(
            payload = ImportedRunPayload(
                title = sourceRun.title,
                targetAnchorDay = targetAnchorDay,
                tasks = reusableTasks,
            ),
            clock = clock,
            zoneId = zoneId,
        )
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

    suspend fun restoreRun(runId: String, clock: () -> Long = { System.currentTimeMillis() }): Boolean {
        val changed = dao.restoreRunAndRefreshWidgetCues(runId, clock()) == 1
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
    internal suspend fun syncRunResult(runId: String): RunSyncResult = runSyncClient?.syncResult(runId) ?: RunSyncResult.Blocked

    suspend fun receiveRun(runId: String) {
        val client = runSyncClient ?: error("同期に接続できませんでした")
        client.receive(runId)
    }

    suspend fun receiveRuns() { runSyncClient?.receiveAll() }

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
                        RunSyncClient(dao, context.getString(app.cuckoocue.R.string.cuckoo_cue_web_url), context.getSharedPreferences("run_sync", Context.MODE_PRIVATE), schedule = { owner, runId -> RunSyncWorker.enqueue(context.applicationContext, owner, runId) }),
                    ).also { instance = it }
                }
            }
    }
}

data class CuebookTaskDraft(
    val title: String,
    val defaultPriority: Int? = null,
    val relativeStartDay: Int? = null,
    val relativeEndDay: Int? = null,
)

data class CuebookSnapshot(
    val id: String,
    val title: String,
    val tasks: List<CuebookSnapshotTask>,
)

data class CuebookSnapshotTask(
    val title: String,
    val defaultPriority: Int?,
    val relativeStartDay: Int?,
    val relativeEndDay: Int?,
)

private fun Long.relativeDayFrom(anchorDay: LocalDate, zoneId: ZoneId): Int =
    ChronoUnit.DAYS.between(
        anchorDay,
        Instant.ofEpochMilli(this).atZone(zoneId).toLocalDate(),
    ).toInt()

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
