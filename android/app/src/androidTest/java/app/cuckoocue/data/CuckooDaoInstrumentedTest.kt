package app.cuckoocue.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteFullException
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.lang.reflect.Proxy
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CuckooDaoInstrumentedTest {
    private lateinit var database: CuckooDatabase
    private lateinit var dao: CuckooDao

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, CuckooDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        dao = database.dao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun completeUsesVersionCasAndKeepsFocusSlot() = runTest {
        seedOneFocusedTask(version = 0)

        val changed = dao.completeTask("task-1", expectedVersion = 0, now = 20)
        val staleChanged = dao.completeTask("task-1", expectedVersion = 0, now = 21)
        val cue = dao.getFocusCues().single()

        assertEquals(1, changed)
        assertEquals(0, staleChanged)
        assertEquals("task-1", cue.taskId)
        assertEquals(1, cue.slot)
        assertEquals(TaskStatus.Completed, cue.status)
        assertEquals(1, cue.version)
    }

    @Test
    fun undoUsesVersionCasAndKeepsFocusSlot() = runTest {
        seedOneFocusedTask(version = 0)
        dao.completeTask("task-1", expectedVersion = 0, now = 20)

        val changed = dao.undoCompleteTask("task-1", expectedVersion = 1, now = 30)
        val staleChanged = dao.undoCompleteTask("task-1", expectedVersion = 1, now = 31)
        val cue = dao.getFocusCues().single()

        assertEquals(1, changed)
        assertEquals(0, staleChanged)
        assertEquals("task-1", cue.taskId)
        assertEquals(1, cue.slot)
        assertEquals(TaskStatus.Pending, cue.status)
        assertEquals(2, cue.version)
    }

    @Test
    fun focusAssignmentsAreNotLimitedToThreeSlots() = runTest {
        dao.insertRun(
            RunEntity(
                id = "run-1",
                title = "Run",
                createdAt = 10,
                updatedAt = 10,
            ),
        )

        repeat(6) { index ->
            val taskId = "task-$index"
            dao.insertTask(
                RunTaskEntity(
                    id = taskId,
                    runId = "run-1",
                    title = "Task $index",
                    sortOrder = index,
                    createdAt = 10L + index,
                    updatedAt = 10L + index,
                ),
            )
            dao.upsertFocusAssignment(
                FocusAssignmentEntity(
                    id = "focus-$index",
                    taskId = taskId,
                    slot = index,
                    createdAt = 20L + index,
                    updatedAt = 20L + index,
                ),
            )
        }

        val cues = dao.getFocusCues()

        assertEquals(6, cues.size)
        assertEquals((0..5).toList(), cues.map { it.slot })
    }

    @Test
    fun focusCueProjectionIncludesPriorityAndCategory() = runTest {
        seedOneFocusedTask(
            version = 0,
            priority = 0,
            categoryKey = "payment",
            categoryLabel = "支払い確認まわりと請求書整理",
            categoryColorKey = "gold",
        )

        val cue = dao.getFocusCues().single()

        assertEquals(0, cue.priority)
        assertEquals("payment", cue.categoryKey)
        assertEquals("支払い確認まわりと請求書整理", cue.categoryLabel)
        assertEquals("gold", cue.categoryColorKey)
    }

    @Test
    fun completeUndoCompleteSequenceUsesCas() = runTest {
        seedOneFocusedTask(version = 0)

        assertEquals(1, dao.completeTask("task-1", expectedVersion = 0, now = 20))
        assertEquals(1, dao.undoCompleteTask("task-1", expectedVersion = 1, now = 21))
        assertEquals(1, dao.completeTask("task-1", expectedVersion = 2, now = 22))
        assertEquals(0, dao.undoCompleteTask("task-1", expectedVersion = 1, now = 23))

        val cue = dao.getFocusCues().single()
        assertEquals(TaskStatus.Completed, cue.status)
        assertEquals(3, cue.version)
    }

    @Test
    fun repositoryCompletePersistsBeforeWidgetRedraw() = runTest {
        seedOneFocusedTask(version = 0)
        val repository = CuckooRepository(dao)

        val completed = repository.completeTask("task-1", expectedVersion = 0)
        val cue = dao.getFocusCues().single()

        assertEquals(true, completed)
        assertEquals(TaskStatus.Completed, cue.status)
        assertEquals(1, cue.version)
        assertEquals("task-1", cue.taskId)
        assertEquals(1, cue.slot)
    }

    @Test
    fun repositoryDoesNotReportSuccessWhenSqliteWriteFails() = runTest {
        val failingDao = failingWriteDao()
        val repository = CuckooRepository(failingDao)

        assertEquals(false, repository.completeTask("task-1", expectedVersion = 0))
        assertEquals(false, repository.undoCompleteTask("task-1", expectedVersion = 1))
    }

    @Test
    fun migrationFromOneToTwoAddsWidgetProjectionColumns() {
        val databaseName = "migration-one-two"
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.deleteDatabase(databaseName)

        SQLiteDatabase.openOrCreateDatabase(context.getDatabasePath(databaseName), null).apply {
            execSQL(
                """
                create table runs(
                    id text not null primary key,
                    title text not null,
                    created_at integer not null,
                    updated_at integer not null
                )
                """.trimIndent(),
            )
            execSQL(
                """
                create table run_tasks(
                    id text not null primary key,
                    run_id text not null,
                    title text not null,
                    status text not null,
                    version integer not null,
                    sort_order integer not null,
                    completed_at integer,
                    created_at integer not null,
                    updated_at integer not null,
                    foreign key(run_id) references runs(id) on delete cascade
                )
                """.trimIndent(),
            )
            execSQL("create index index_run_tasks_run_id on run_tasks(run_id)")
            execSQL(
                """
                create table focus_assignments(
                    id text not null primary key,
                    task_id text not null,
                    slot integer not null,
                    created_at integer not null,
                    updated_at integer not null,
                    foreign key(task_id) references run_tasks(id) on delete cascade
                )
                """.trimIndent(),
            )
            execSQL("create unique index index_focus_assignments_task_id on focus_assignments(task_id)")
            execSQL("create unique index index_focus_assignments_slot on focus_assignments(slot)")
            execSQL(
                """
                insert into runs(id, title, created_at, updated_at)
                values('run-1', 'Run', 10, 10)
                """.trimIndent(),
            )
            execSQL(
                """
                insert into run_tasks(
                    id, run_id, title, status, version, sort_order, completed_at, created_at, updated_at
                ) values('task-1', 'run-1', 'Task', 'pending', 0, 0, null, 10, 10)
                """.trimIndent(),
            )
            version = 1
            close()
        }

        val migratedDatabase = Room.databaseBuilder(context, CuckooDatabase::class.java, databaseName)
            .addMigrations(CuckooDatabase.MIGRATION_1_2)
            .allowMainThreadQueries()
            .build()

        try {
            migratedDatabase.openHelper.readableDatabase.query(
                """
                select priority, category_key, category_label, category_color_key
                from run_tasks where id = 'task-1'
                """.trimIndent(),
            ).use { cursor ->
                cursor.moveToFirst()
                assertEquals(2, cursor.getInt(0))
                assertEquals("focus", cursor.getString(1))
                assertEquals("Focus", cursor.getString(2))
                assertEquals("teal", cursor.getString(3))
            }
        } finally {
            migratedDatabase.close()
        }
    }

    private fun failingWriteDao(): CuckooDao {
        return Proxy.newProxyInstance(
            CuckooDao::class.java.classLoader,
            arrayOf(CuckooDao::class.java),
        ) { _, method, _ ->
            when (method.name) {
                "completeTask", "undoCompleteTask" -> throw SQLiteFullException("simulated full database")
                else -> error("Unexpected DAO call in failure test: ${method.name}")
            }
        } as CuckooDao
    }

    private suspend fun seedOneFocusedTask(
        version: Long,
        priority: Int = 2,
        categoryKey: String = "account",
        categoryLabel: String = "アカウント復旧",
        categoryColorKey: String = "teal",
    ) {
        dao.insertRun(
            RunEntity(
                id = "run-1",
                title = "Run",
                createdAt = 10,
                updatedAt = 10,
            ),
        )
        dao.insertTask(
            RunTaskEntity(
                id = "task-1",
                runId = "run-1",
                title = "2段階認証の復旧手段を確認",
                status = TaskStatus.Pending,
                version = version,
                priority = priority,
                categoryKey = categoryKey,
                categoryLabel = categoryLabel,
                categoryColorKey = categoryColorKey,
                sortOrder = 0,
                createdAt = 10,
                updatedAt = 10,
            ),
        )
        dao.upsertFocusAssignment(
            FocusAssignmentEntity(
                id = "focus-1",
                taskId = "task-1",
                slot = 1,
                createdAt = 10,
                updatedAt = 10,
            ),
        )
    }
}
