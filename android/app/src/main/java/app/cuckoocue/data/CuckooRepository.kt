package app.cuckoocue.data

import android.content.Context
import android.database.sqlite.SQLiteException
import java.util.UUID
import kotlinx.coroutines.flow.Flow

class CuckooRepository internal constructor(
    private val dao: CuckooDao,
) {

    val focusCues: Flow<List<FocusCue>>
        get() = dao.observeFocusCues()
    val firstRun: Flow<RunEntity?>
        get() = dao.observeFirstRun()

    fun observeTasks(runId: String): Flow<List<RunTaskEntity>> = dao.observeTasks(runId)

    suspend fun ensureSeedData(clock: () -> Long = { System.currentTimeMillis() }) {
        if (dao.runCount() > 0) return

        val now = clock()
        dao.insertRun(
            RunEntity(
                id = SeedData.RunId,
                title = SeedData.RunTitle,
                createdAt = now,
                updatedAt = now,
            ),
        )

        val tasks = SeedData.tasks.mapIndexed { index, seedTask ->
            RunTaskEntity(
                id = UUID.randomUUID().toString(),
                runId = SeedData.RunId,
                title = seedTask.title,
                priority = seedTask.priority,
                categoryKey = seedTask.categoryKey,
                categoryLabel = seedTask.categoryLabel,
                categoryColorKey = seedTask.categoryColorKey,
                sortOrder = index,
                createdAt = now + index,
                updatedAt = now + index,
            )
        }

        tasks.forEach { dao.insertTask(it) }
        tasks.forEachIndexed { slot, task ->
            dao.upsertFocusAssignment(
                FocusAssignmentEntity(
                    id = UUID.randomUUID().toString(),
                    taskId = task.id,
                    slot = slot,
                    createdAt = now,
                    updatedAt = now,
                ),
            )
        }
    }

    suspend fun resetToSeedData(clock: () -> Long = { System.currentTimeMillis() }) {
        dao.resetSeedData()
        ensureSeedData(clock)
    }

    suspend fun addTask(runId: String, title: String, clock: () -> Long = { System.currentTimeMillis() }) {
        val cleanTitle = title.trim()
        if (cleanTitle.isEmpty()) return

        val now = clock()
        val nextOrder = (dao.maxSortOrder(runId) ?: -1) + 1
        dao.insertTask(
            RunTaskEntity(
                id = UUID.randomUUID().toString(),
                runId = runId,
                title = cleanTitle,
                sortOrder = nextOrder,
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    suspend fun setFocus(taskId: String, slot: Int, clock: () -> Long = { System.currentTimeMillis() }) {
        dao.setFocus(
            taskId = taskId,
            slot = slot,
            now = clock(),
            assignmentId = UUID.randomUUID().toString(),
        )
    }

    suspend fun completeTask(taskId: String, expectedVersion: Long): Boolean =
        try {
            dao.completeTask(taskId, expectedVersion, System.currentTimeMillis()) == 1
        } catch (_: SQLiteException) {
            false
        }

    suspend fun undoCompleteTask(taskId: String, expectedVersion: Long): Boolean =
        try {
            dao.undoCompleteTask(taskId, expectedVersion, System.currentTimeMillis()) == 1
        } catch (_: SQLiteException) {
            false
        }

    suspend fun getFocusCues(): List<FocusCue> = dao.getFocusCues()

    companion object {
        @Volatile private var instance: CuckooRepository? = null

        fun getInstance(context: Context): CuckooRepository =
            instance ?: synchronized(this) {
                instance ?: CuckooRepository(
                    CuckooDatabase.getInstance(context).dao(),
                ).also { instance = it }
            }
    }
}
