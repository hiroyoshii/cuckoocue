package app.cuckoocue.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface CuckooDao {
    @Query("select count(*) from runs")
    suspend fun runCount(): Int

    @Query("select count(*) from runs where archived_at is null")
    suspend fun activeRunCount(): Int

    @Query("select count(*) from run_tasks")
    suspend fun taskCount(): Int

    @Query("select count(*) from run_tasks where run_id = :runId")
    suspend fun taskCountForRun(runId: String): Int

    @Query("select count(*) from run_tasks where run_id = :runId and completed_at is null")
    suspend fun pendingTaskCountForRun(runId: String): Int

    @Query("select count(*) from widget_cues")
    suspend fun widgetCueCount(): Int

    @Query("select max(sort_order) from runs")
    suspend fun maxRunSortOrder(): Int?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertRun(run: RunEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertTask(task: RunTaskEntity)

    @Transaction
    suspend fun insertRunAndTasks(run: RunEntity, tasks: List<RunTaskEntity>, now: Long) {
        insertRun(run)
        tasks.forEach { task ->
            insertTask(task)
            refreshWidgetCueForTask(task.id, now)
        }
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertWidgetCue(cue: WidgetCueEntity)

    @Query("select * from runs order by created_at limit 1")
    fun observeFirstRun(): Flow<RunEntity?>

    @Query("select * from runs where archived_at is null order by sort_order, created_at")
    fun observeRuns(): Flow<List<RunEntity>>

    @Query("select * from runs where id = :runId")
    suspend fun runById(runId: String): RunEntity?

    @Query("select id from runs")
    suspend fun allRunIds(): List<String>

    @Query("select * from run_tasks where run_id = :runId order by sort_order, created_at")
    fun observeTasks(runId: String): Flow<List<RunTaskEntity>>

    @Query("select * from run_tasks where run_id = :runId order by sort_order, created_at")
    suspend fun tasksForRun(runId: String): List<RunTaskEntity>

    @Query(
        """
        select * from run_tasks
        where run_id = :runId
          and completed_at is null
          and title != ''
        order by sort_order, created_at
        limit :limit
        """,
    )
    fun observeTaskPreview(runId: String, limit: Int): Flow<List<RunTaskEntity>>

    @Query("select * from run_tasks where run_id = :runId and completed_at is null order by sort_order, created_at")
    suspend fun pendingTasks(runId: String): List<RunTaskEntity>

    @Query("select * from run_tasks where completed_at is not null order by completed_at desc limit 1")
    suspend fun firstCompletedTask(): RunTaskEntity?

    @Query("select max(sort_order) from run_tasks where run_id = :runId")
    suspend fun maxSortOrder(runId: String): Int?

    @Query(
        """
        update run_tasks
        set sort_order = sort_order + 1,
            updated_at = :now
        where run_id = :runId
          and sort_order >= :sortOrder
        """,
    )
    suspend fun shiftTaskSortOrdersFrom(runId: String, sortOrder: Int, now: Long): Int

    @Query(
        """
        select
            widget_cues.run_id as runId,
            widget_cues.task_id as taskId,
            run_tasks.title as title,
            widget_cues.priority as priority,
            run_tasks.due_at as dueAt,
            run_tasks.completed_at as completedAt
        from widget_cues
        inner join run_tasks on run_tasks.id = widget_cues.task_id
        inner join runs on runs.id = widget_cues.run_id
        where run_tasks.completed_at is null
          and runs.archived_at is null
        order by
            widget_cues.priority,
            run_tasks.due_at is null,
            run_tasks.due_at,
            runs.sort_order,
            run_tasks.sort_order,
            run_tasks.created_at
        limit 50
        """,
    )
    fun observeWidgetCues(): Flow<List<WidgetCue>>

    @Query(
        """
        select
            widget_cues.run_id as runId,
            widget_cues.task_id as taskId,
            run_tasks.title as title,
            widget_cues.priority as priority,
            run_tasks.due_at as dueAt,
            run_tasks.completed_at as completedAt
        from widget_cues
        inner join run_tasks on run_tasks.id = widget_cues.task_id
        inner join runs on runs.id = widget_cues.run_id
        where widget_cues.run_id = :runId
          and run_tasks.completed_at is null
          and runs.archived_at is null
        order by
            widget_cues.priority,
            run_tasks.due_at is null,
            run_tasks.due_at,
            run_tasks.sort_order,
            run_tasks.created_at
        limit 50
        """,
    )
    fun observeWidgetCuesForRun(runId: String): Flow<List<WidgetCue>>

    @Query(
        """
        select
            widget_cues.run_id as runId,
            widget_cues.task_id as taskId,
            run_tasks.title as title,
            widget_cues.priority as priority,
            run_tasks.due_at as dueAt,
            run_tasks.completed_at as completedAt
        from widget_cues
        inner join run_tasks on run_tasks.id = widget_cues.task_id
        inner join runs on runs.id = widget_cues.run_id
        where run_tasks.completed_at is null
          and runs.archived_at is null
        order by
            widget_cues.priority,
            run_tasks.due_at is null,
            run_tasks.due_at,
            runs.sort_order,
            run_tasks.sort_order,
            run_tasks.created_at
        limit 50
        """,
    )
    suspend fun getWidgetCues(): List<WidgetCue>

    @Query("select count(*) from widget_cues where task_id = :taskId")
    suspend fun isWidgetCue(taskId: String): Int

    @Query("delete from widget_cues where task_id = :taskId")
    suspend fun removeWidgetCueForTask(taskId: String)

    @Query("delete from widget_cues where run_id = :runId")
    suspend fun removeWidgetCuesForRun(runId: String)

    @Query("delete from widget_cues")
    suspend fun deleteAllWidgetCues()

    @Query("delete from runs")
    suspend fun deleteAllRuns()

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertWidgetCues(cues: List<WidgetCueEntity>)

    @Query("delete from run_tasks where id = :taskId")
    suspend fun deleteTask(taskId: String)

    @Query(
        """
        update runs
        set title = :title,
            updated_at = :now
        where id = :runId
        """,
    )
    suspend fun updateRunTitle(runId: String, title: String, now: Long): Int

    @Query(
        """
        update run_tasks
        set title = :title,
            available_from_at = :availableFromAt,
            due_at = :dueAt,
            user_priority = :userPriority,
            updated_at = :now
        where id = :taskId
        """,
    )
    suspend fun updateTaskDetails(
        taskId: String,
        title: String,
        availableFromAt: Long?,
        dueAt: Long?,
        userPriority: Int?,
        now: Long,
    ): Int

    @Query(
        """
        update run_tasks
        set sort_order = :sortOrder,
            updated_at = :now
        where id = :taskId
        """,
    )
    suspend fun updateTaskSortOrder(taskId: String, sortOrder: Int, now: Long): Int

    @Query(
        """
        update run_tasks
        set sort_order = :sortOrder,
            user_priority = :userPriority,
            updated_at = :now
        where id = :taskId
        """,
    )
    suspend fun updateMovedTaskSortOrderAndPriority(
        taskId: String,
        sortOrder: Int,
        userPriority: Int,
        now: Long,
    ): Int

    @Query(
        """
        update run_tasks
        set sort_order = sort_order + 1,
            updated_at = :now
        where run_id = :runId
          and completed_at is null
          and sort_order >= :toSortOrder
          and sort_order < :fromSortOrder
        """,
    )
    suspend fun shiftPendingSortOrdersDownForMove(
        runId: String,
        fromSortOrder: Int,
        toSortOrder: Int,
        now: Long,
    ): Int

    @Query(
        """
        update run_tasks
        set sort_order = sort_order - 1,
            updated_at = :now
        where run_id = :runId
          and completed_at is null
          and sort_order > :fromSortOrder
          and sort_order <= :toSortOrder
        """,
    )
    suspend fun shiftPendingSortOrdersUpForMove(
        runId: String,
        fromSortOrder: Int,
        toSortOrder: Int,
        now: Long,
    ): Int

    @Query(
        """
        update runs
        set archived_at = :now,
            updated_at = :now
        where id = :runId
          and archived_at is null
        """,
    )
    suspend fun archiveRun(runId: String, now: Long): Int

    @Query(
        """
        update run_tasks
        set completed_at = :now,
            updated_at = :now
        where id = :taskId
          and completed_at is null
        """,
    )
    suspend fun completeTask(taskId: String, now: Long): Int

    @Query(
        """
        update runs
        set completed_anchor_at = coalesce(completed_anchor_at, :now),
            updated_at = :now
        where id = :runId
        """,
    )
    suspend fun setRunCompletionAnchor(runId: String, now: Long): Int

    @Query(
        """
        update runs
        set completed_anchor_at = null,
            updated_at = :now
        where id = :runId
          and completed_anchor_at is not null
        """,
    )
    suspend fun clearRunCompletionAnchor(runId: String, now: Long): Int

    @Query(
        """
        update run_tasks
        set completed_at = null,
            updated_at = :now
        where id = :taskId
          and completed_at is not null
        """,
    )
    suspend fun undoCompleteTask(taskId: String, now: Long): Int

    @Transaction
    suspend fun completeTaskAndRemoveWidgetCue(
        taskId: String,
        now: Long,
    ): CompleteMutationResult {
        val task = taskById(taskId)
        val removedFromWidget = isWidgetCue(taskId) > 0
        val changed = completeTask(taskId, now)
        if (changed == 1) {
            removeWidgetCueForTask(taskId)
            task?.runId?.let { refreshRunCompletionAnchor(it, now) }
        }
        return CompleteMutationResult(
            completed = changed == 1,
            removedFromWidget = changed == 1 && removedFromWidget,
        )
    }

    @Transaction
    suspend fun undoCompleteTaskAndRestoreWidgetCue(
        taskId: String,
        now: Long,
        priority: Int?,
    ): Int {
        val changed = undoCompleteTask(taskId, now)
        val task = taskById(taskId)
        if (changed == 1 && task != null && priority != null && priority != PriorityExposure.Quiet && isWidgetCue(taskId) == 0) {
            upsertWidgetCue(
                WidgetCueEntity(
                    taskId = taskId,
                    runId = task.runId,
                    priority = priority,
                    createdAt = now,
                    updatedAt = now,
                ),
            )
        }
        if (changed == 1 && task != null) {
            refreshRunCompletionAnchor(task.runId, now)
        }
        return changed
    }

    @Query("select * from run_tasks where id = :taskId")
    suspend fun taskById(taskId: String): RunTaskEntity?

    @Query(
        """
        select
            run_tasks.run_id as runId,
            run_tasks.id as taskId,
            run_tasks.title as title,
            run_tasks.user_priority as userPriority,
            run_tasks.due_at as dueAt
        from run_tasks
        inner join runs on runs.id = run_tasks.run_id
        where run_tasks.id = :taskId
          and run_tasks.completed_at is null
          and runs.archived_at is null
        """,
    )
    suspend fun widgetCueCandidateByTaskId(taskId: String): WidgetCueCandidate?

    @Transaction
    suspend fun insertTaskAndRefreshWidgetCue(task: RunTaskEntity, now: Long) {
        insertTask(task)
        refreshRunCompletionAnchor(task.runId, now)
        refreshWidgetCueForTask(task.id, now)
    }

    @Transaction
    suspend fun updateTaskDetailsAndRefreshWidgetCue(
        taskId: String,
        title: String,
        availableFromAt: Long?,
        dueAt: Long?,
        userPriority: Int?,
        now: Long,
    ): Int {
        val changed = updateTaskDetails(taskId, title, availableFromAt, dueAt, userPriority, now)
        if (changed == 1) {
            refreshWidgetCueForTask(taskId, now)
        }
        return changed
    }

    @Transaction
    suspend fun deleteTaskAndRemoveWidgetCue(taskId: String, now: Long) {
        val task = taskById(taskId)
        removeWidgetCueForTask(taskId)
        deleteTask(taskId)
        task?.runId?.let { refreshRunCompletionAnchor(it, now) }
    }

    @Transaction
    suspend fun refreshRunCompletionAnchor(runId: String, now: Long) {
        if (taskCountForRun(runId) > 0 && pendingTaskCountForRun(runId) == 0) {
            setRunCompletionAnchor(runId, now)
        } else {
            clearRunCompletionAnchor(runId, now)
        }
    }

    @Transaction
    suspend fun archiveRunAndRemoveWidgetCues(runId: String, now: Long): Int {
        val changed = archiveRun(runId, now)
        if (changed == 1) {
            removeWidgetCuesForRun(runId)
        }
        return changed
    }

    @Transaction
    suspend fun movePendingTaskAndRefreshMovedWidgetCue(
        runId: String,
        taskId: String,
        delta: Int,
        now: Long,
    ): Boolean {
        val changed = movePendingTask(runId, taskId, delta, now)
        if (changed) {
            refreshWidgetCueForTask(taskId, now)
        }
        return changed
    }

    @Transaction
    suspend fun refreshWidgetCueForTask(taskId: String, now: Long) {
        val cue = widgetCueCandidateByTaskId(taskId)?.toWidgetCueEntity(now)
        if (cue == null) {
            removeWidgetCueForTask(taskId)
        } else {
            upsertWidgetCue(cue)
        }
    }

    @Transaction
    suspend fun replaceWidgetCues(cues: List<WidgetCueEntity>) {
        deleteAllWidgetCues()
        if (cues.isNotEmpty()) {
            insertWidgetCues(cues)
        }
    }

    @Transaction
    suspend fun resetSeedData() {
        deleteAllRuns()
    }

    @Transaction
    suspend fun movePendingTask(runId: String, taskId: String, delta: Int, now: Long): Boolean {
        if (delta == 0) return false
        val current = pendingTasks(runId)
        val fromIndex = current.indexOfFirst { it.id == taskId }
        if (fromIndex < 0) return false
        val toIndex = (fromIndex + delta).coerceIn(0, current.lastIndex)
        if (fromIndex == toIndex) return false

        val reordered = current.toMutableList()
        val moved = reordered.removeAt(fromIndex)
        reordered.add(toIndex, moved)
        val movedPriority = if (toIndex == 0) {
            PriorityExposure.Strong
        } else {
            reordered[toIndex - 1].effectivePriority(now)
        }

        val fromSortOrder = current[fromIndex].sortOrder
        val toSortOrder = current[toIndex].sortOrder
        if (toIndex < fromIndex) {
            shiftPendingSortOrdersDownForMove(runId, fromSortOrder, toSortOrder, now)
        } else {
            shiftPendingSortOrdersUpForMove(runId, fromSortOrder, toSortOrder, now)
        }
        updateMovedTaskSortOrderAndPriority(taskId, toSortOrder, movedPriority, now)
        return true
    }

    @Transaction
    suspend fun insertTaskAtSortOrder(task: RunTaskEntity, now: Long) {
        shiftTaskSortOrdersFrom(task.runId, task.sortOrder, now)
        insertTask(task)
        refreshWidgetCueForTask(task.id, now)
    }

    @Query(
        """
        select
            run_tasks.run_id as runId,
            run_tasks.id as taskId,
            run_tasks.title as title,
            run_tasks.user_priority as userPriority,
            run_tasks.due_at as dueAt
        from run_tasks
        inner join runs on runs.id = run_tasks.run_id
        where run_tasks.completed_at is null
          and runs.archived_at is null
        """,
    )
    suspend fun widgetCueCandidates(): List<WidgetCueCandidate>
}

private fun RunTaskEntity.effectivePriority(now: Long): Int =
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
