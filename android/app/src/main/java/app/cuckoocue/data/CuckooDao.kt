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

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertRun(run: RunEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertTask(task: RunTaskEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertFocusAssignment(assignment: FocusAssignmentEntity)

    @Query("select * from runs order by created_at limit 1")
    fun observeFirstRun(): Flow<RunEntity?>

    @Query("select * from run_tasks where run_id = :runId order by sort_order, created_at")
    fun observeTasks(runId: String): Flow<List<RunTaskEntity>>

    @Query("select max(sort_order) from run_tasks where run_id = :runId")
    suspend fun maxSortOrder(runId: String): Int?

    @Query(
        """
        select
            focus_assignments.id as assignmentId,
            run_tasks.id as taskId,
            focus_assignments.slot as slot,
            run_tasks.title as title,
            run_tasks.status as status,
            run_tasks.version as version,
            run_tasks.priority as priority,
            run_tasks.category_key as categoryKey,
            run_tasks.category_label as categoryLabel,
            run_tasks.category_color_key as categoryColorKey,
            run_tasks.completed_at as completedAt
        from focus_assignments
        inner join run_tasks on run_tasks.id = focus_assignments.task_id
        order by focus_assignments.slot
        """,
    )
    fun observeFocusCues(): Flow<List<FocusCue>>

    @Query(
        """
        select
            focus_assignments.id as assignmentId,
            run_tasks.id as taskId,
            focus_assignments.slot as slot,
            run_tasks.title as title,
            run_tasks.status as status,
            run_tasks.version as version,
            run_tasks.priority as priority,
            run_tasks.category_key as categoryKey,
            run_tasks.category_label as categoryLabel,
            run_tasks.category_color_key as categoryColorKey,
            run_tasks.completed_at as completedAt
        from focus_assignments
        inner join run_tasks on run_tasks.id = focus_assignments.task_id
        order by focus_assignments.slot
        """,
    )
    suspend fun getFocusCues(): List<FocusCue>

    @Query("select count(*) from focus_assignments where task_id = :taskId")
    suspend fun isFocused(taskId: String): Int

    @Query("select count(*) from focus_assignments where slot = :slot")
    suspend fun isSlotUsed(slot: Int): Int

    @Query("delete from focus_assignments where task_id = :taskId")
    suspend fun removeFocusAssignmentForTask(taskId: String)

    @Query("delete from focus_assignments where slot = :slot")
    suspend fun clearSlot(slot: Int)

    @Query("delete from runs")
    suspend fun deleteAllRuns()

    @Query(
        """
        update run_tasks
        set status = 'completed',
            completed_at = :now,
            updated_at = :now,
            version = version + 1
        where id = :taskId
          and status = 'pending'
          and version = :expectedVersion
        """,
    )
    suspend fun completeTask(taskId: String, expectedVersion: Long, now: Long): Int

    @Query(
        """
        update run_tasks
        set status = 'pending',
            completed_at = null,
            updated_at = :now,
            version = version + 1
        where id = :taskId
          and status = 'completed'
          and version = :expectedVersion
        """,
    )
    suspend fun undoCompleteTask(taskId: String, expectedVersion: Long, now: Long): Int

    @Transaction
    suspend fun setFocus(taskId: String, slot: Int, now: Long, assignmentId: String) {
        require(slot >= 0)
        clearSlot(slot)
        removeFocusAssignmentForTask(taskId)
        upsertFocusAssignment(
            FocusAssignmentEntity(
                id = assignmentId,
                taskId = taskId,
                slot = slot,
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    @Transaction
    suspend fun resetSeedData() {
        deleteAllRuns()
    }
}
