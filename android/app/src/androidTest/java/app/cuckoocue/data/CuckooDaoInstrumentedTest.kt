package app.cuckoocue.data

import android.content.Context
import android.database.sqlite.SQLiteFullException
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.lang.reflect.Proxy
import kotlinx.coroutines.flow.first
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
    fun repositoryCreatesWidgetCueCacheForVisiblePriorityTasks() = runTest {
        seedRun()
        val repository = repository()

        repository.addTask("run-1", "強いCue", priority = PriorityExposure.Strong, clock = { 100 })
        repository.addTask("run-1", "静かなTask", priority = PriorityExposure.Quiet, clock = { 101 })

        val tasks = dao.observeTasks("run-1").first()
        val cues = dao.getWidgetCues()

        assertEquals(2, tasks.size)
        assertEquals(listOf("強いCue"), cues.map { it.title })
        assertEquals(listOf(PriorityExposure.Strong), cues.map { it.priority })
        assertEquals(listOf("run-1"), cues.map { it.runId })
    }

    @Test
    fun repositoryUpdatesWidgetCueCacheWhenTaskTitleOrPriorityChanges() = runTest {
        seedRun()
        val repository = repository()
        repository.addTask("run-1", "古い表示", priority = PriorityExposure.Strong, clock = { 100 })
        val task = dao.observeTasks("run-1").first().single()

        repository.updateTask(
            taskId = task.id,
            title = "新しい表示",
            dueAt = null,
            priority = PriorityExposure.Medium,
            clock = { 200 },
        )

        val cue = dao.getWidgetCues().single()

        assertEquals(task.id, cue.taskId)
        assertEquals("新しい表示", cue.title)
        assertEquals(PriorityExposure.Medium, cue.priority)
    }

    @Test
    fun repositoryRemovesWidgetCueCacheWhenPriorityBecomesQuiet() = runTest {
        seedRun()
        val repository = repository()
        repository.addTask("run-1", "Widgetから外す", priority = PriorityExposure.Strong, clock = { 100 })
        val task = dao.observeTasks("run-1").first().single()

        repository.updateTask(
            taskId = task.id,
            title = task.title,
            dueAt = null,
            priority = PriorityExposure.Quiet,
            clock = { 200 },
        )

        assertEquals(0, dao.getWidgetCues().size)
    }

    @Test
    fun widgetCuesAreNotLimitedToThreeRows() = runTest {
        seedRun()

        repeat(6) { index ->
            seedTaskAndWidgetCue(
                runId = "run-1",
                taskId = "task-$index",
                title = "Task $index",
                priority = PriorityExposure.Strong,
                sortOrder = index,
            )
        }

        val cues = dao.getWidgetCues()

        assertEquals(6, cues.size)
        assertEquals((0..5).toList(), cues.map { it.taskId.removePrefix("task-").toInt() })
    }

    @Test
    fun widgetCueCacheCanBeReadByRunOrAcrossRuns() = runTest {
        seedRun(id = "run-a", title = "朝", now = 10)
        seedRun(id = "run-b", title = "夜", now = 11)
        seedTaskAndWidgetCue("run-a", "task-a", "朝のCue", PriorityExposure.Strong, sortOrder = 0)
        seedTaskAndWidgetCue("run-b", "task-b", "夜のCue", PriorityExposure.Medium, sortOrder = 1)

        val runA = dao.observeWidgetCuesForRun("run-a").first()
        val runB = dao.observeWidgetCuesForRun("run-b").first()
        val all = dao.getWidgetCues()

        assertEquals(listOf("task-a"), runA.map { it.taskId })
        assertEquals(listOf("task-b"), runB.map { it.taskId })
        assertEquals(listOf("task-a", "task-b"), all.map { it.taskId })
    }

    @Test
    fun movingTaskCopiesPriorityFromTheRowAbove() = runTest {
        seedRun()
        seedTask("run-1", "task-a", "上の強い項目", PriorityExposure.Strong, sortOrder = 0)
        seedTask("run-1", "task-b", "中くらいの項目", PriorityExposure.Medium, sortOrder = 1)
        seedTask("run-1", "task-c", "下の静かな項目", PriorityExposure.Quiet, sortOrder = 2)
        val repository = repository()
        repository.rebuildWidgetCues(now = 100)

        repository.movePendingTask("run-1", "task-c", -2)

        val tasks = dao.observeTasks("run-1").first()
        val moved = tasks.first { it.id == "task-c" }
        val cues = dao.getWidgetCues()

        assertEquals(listOf("task-c", "task-a", "task-b"), tasks.map { it.id })
        assertEquals(PriorityExposure.Strong, moved.userPriority)
        assertEquals(listOf("task-c", "task-a", "task-b"), cues.map { it.taskId })
    }

    @Test
    fun addingTaskAfterExistingTaskInsertsDirectlyBelowIt() = runTest {
        seedRun()
        seedTask("run-1", "task-a", "上の項目", PriorityExposure.Strong, sortOrder = 0)
        seedTask("run-1", "task-b", "下の項目", PriorityExposure.Medium, sortOrder = 1)
        val repository = repository()

        val insertedTaskId = repository.addTaskAfter(
            afterTaskId = "task-a",
            title = "直下に追加した項目",
            priority = PriorityExposure.Strong,
            clock = { 100 },
        )

        val tasks = dao.observeTasks("run-1").first()
        val inserted = tasks.first { it.id == insertedTaskId }

        assertEquals(listOf("task-a", insertedTaskId, "task-b"), tasks.map { it.id })
        assertEquals(1, inserted.sortOrder)
        assertEquals(2, tasks.first { it.id == "task-b" }.sortOrder)
    }

    @Test
    fun blankTaskCanBeSavedButIsExcludedFromWidgetCueCache() = runTest {
        seedRun()
        seedTaskAndWidgetCue("run-1", "task-a", "上の項目", PriorityExposure.Strong, sortOrder = 0)
        val repository = repository()

        val blankTaskId = repository.addTaskAfter(
            afterTaskId = "task-a",
            title = "",
            priority = PriorityExposure.Strong,
            clock = { 100 },
        )

        val tasks = dao.observeTasks("run-1").first()
        val blankTask = tasks.first { it.id == blankTaskId }
        val cues = dao.getWidgetCues()

        assertEquals("", blankTask.title)
        assertEquals(listOf("task-a"), cues.map { it.taskId })
    }

    @Test
    fun completeRemovesWidgetCueCacheAndUndoRestoresIt() = runTest {
        seedRun()
        seedTaskAndWidgetCue("run-1", "task-1", "戻せるCue", PriorityExposure.Strong, sortOrder = 1)
        val repository = repository()

        val result = repository.completeTask("task-1")
        assertEquals(true, result.completed)
        assertEquals(true, result.removedFromWidget)
        assertEquals(0, dao.getWidgetCues().size)

        val changed = repository.undoCompleteTask("task-1")
        val cue = dao.getWidgetCues().single()

        assertEquals(true, changed)
        assertEquals("task-1", cue.taskId)
        assertEquals("戻せるCue", cue.title)
    }

    @Test
    fun completeUndoCompleteSequenceIsIdempotentByState() = runTest {
        seedRun()
        seedTaskAndWidgetCue("run-1", "task-1", "Cue", PriorityExposure.Strong, sortOrder = 0)
        val repository = repository()

        val firstComplete = repository.completeTask("task-1")
        val duplicateComplete = repository.completeTask("task-1")
        val undo = repository.undoCompleteTask("task-1")
        val secondComplete = repository.completeTask("task-1")

        assertEquals(true, firstComplete.completed)
        assertEquals(false, duplicateComplete.completed)
        assertEquals(true, undo)
        assertEquals(true, secondComplete.completed)
        assertEquals(0, dao.isWidgetCue("task-1"))
    }

    @Test
    fun repositoryDoesNotReportSuccessWhenSqliteWriteFails() = runTest {
        val failingDao = failingWriteDao()
        val repository = CuckooRepository(failingDao)

        assertEquals(false, repository.completeTask("task-1").completed)
        assertEquals(false, repository.undoCompleteTask("task-1"))
    }

    private fun failingWriteDao(): CuckooDao {
        return Proxy.newProxyInstance(
            CuckooDao::class.java.classLoader,
            arrayOf(CuckooDao::class.java),
        ) { _, method, _ ->
            when (method.name) {
                "completeTaskAndRemoveWidgetCue", "taskById", "undoCompleteTaskAndRestoreWidgetCue" ->
                    throw SQLiteFullException("simulated full database")
                else -> error("Unexpected DAO call in failure test: ${method.name}")
            }
        } as CuckooDao
    }

    private fun repository() = CuckooRepository(dao)

    private suspend fun seedRun(
        id: String = "run-1",
        title: String = "Run",
        now: Long = 10,
    ) {
        dao.insertRun(
            RunEntity(
                id = id,
                title = title,
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    private suspend fun seedTaskAndWidgetCue(
        runId: String,
        taskId: String,
        title: String,
        priority: Int,
        sortOrder: Int,
    ) {
        seedTask(runId, taskId, title, priority, sortOrder)
        dao.upsertWidgetCue(
            WidgetCueEntity(
                runId = runId,
                taskId = taskId,
                priority = priority,
                createdAt = 30L + sortOrder,
                updatedAt = 30L + sortOrder,
            ),
        )
    }

    private suspend fun seedTask(
        runId: String,
        taskId: String,
        title: String,
        priority: Int,
        sortOrder: Int,
    ) {
        dao.insertTask(
            RunTaskEntity(
                id = taskId,
                runId = runId,
                title = title,
                userPriority = priority,
                sortOrder = sortOrder,
                createdAt = 20L + sortOrder,
                updatedAt = 20L + sortOrder,
            ),
        )
    }
}
