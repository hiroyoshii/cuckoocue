package app.cuckoocue.data

import android.content.Context
import android.database.sqlite.SQLiteFullException
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.cuckoocue.transfer.ImportedRunPayload
import app.cuckoocue.transfer.ImportedRunTask
import java.lang.reflect.Proxy
import java.time.LocalDate
import java.time.ZoneOffset
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

    @Test
    fun receivingSameRunPreservesIdsDatesAndExistingLocalEdits() = runTest {
        val run = RunEntity(id = "shared-run", title = "Webのリスト", sourceCuebookId = "source-cuebook", targetAnchorDay = 5000L, createdAt = 1L, updatedAt = 2L)
        val task = RunTaskEntity(id = "shared-task", runId = run.id, sourceTaskId = "source-task", title = "予約する", userPriority = null, availableFromAt = 3000L, dueAt = null, sortOrder = 0, createdAt = 1L, updatedAt = 2L)
        assertEquals(true, dao.receiveNewRun(run, listOf(task), 3L))
        assertEquals(run, dao.runById(run.id))
        assertEquals(listOf(task), dao.tasksForRun(run.id))
        assertEquals(false, dao.receiveNewRun(run.copy(title = "古い別の内容"), emptyList(), 4L))
        assertEquals(run, dao.runById(run.id))
        assertEquals(listOf(task), dao.tasksForRun(run.id))
    }

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
            availableFromAt = null,
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
            availableFromAt = null,
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
        assertEquals(listOf("朝", "夜"), all.map { it.runTitle })
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
    fun finalCompletionSetsStableRunAnchorAndUndoClearsIt() = runTest {
        seedRun()
        seedTask("run-1", "task-1", "最後の項目", PriorityExposure.Strong, sortOrder = 0)

        dao.completeTaskAndRemoveWidgetCue("task-1", 123_000)
        assertEquals(123_000L, dao.observeRuns().first().single().completedAnchorAt)

        dao.undoCompleteTaskAndRestoreWidgetCue(
            taskId = "task-1",
            now = 124_000,
            priority = PriorityExposure.Strong,
        )
        assertEquals(null, dao.observeRuns().first().single().completedAnchorAt)
    }

    @Test
    fun completedRunCanBeReusedWithDatesShiftedToNewAnchor() = runTest {
        val sourceAnchorDay = LocalDate.of(2026, 10, 1)
        val targetAnchorDay = LocalDate.of(2027, 4, 15)
        seedRun(
            id = "source-run",
            title = "引っ越し準備",
            now = 10,
            completedAnchorAt = sourceAnchorDay.epochMillis(),
        )
        dao.insertTask(
            RunTaskEntity(
                id = "source-task-a",
                runId = "source-run",
                title = "業者を決める",
                userPriority = PriorityExposure.Strong,
                availableFromAt = LocalDate.of(2026, 8, 20).epochMillis(),
                dueAt = LocalDate.of(2026, 8, 25).epochMillis(),
                sortOrder = 0,
                completedAt = LocalDate.of(2026, 8, 24).epochMillis(),
                createdAt = 20,
                updatedAt = 30,
            ),
        )
        dao.insertTask(
            RunTaskEntity(
                id = "source-task-b",
                runId = "source-run",
                title = "郵便転送を申し込む",
                userPriority = PriorityExposure.Medium,
                dueAt = LocalDate.of(2026, 9, 17).epochMillis(),
                sortOrder = 1,
                completedAt = LocalDate.of(2026, 9, 17).epochMillis(),
                createdAt = 21,
                updatedAt = 31,
            ),
        )
        val repository = repository()

        val reusedRunId = requireNotNull(
            repository.reuseCompletedRun(
                sourceRunId = "source-run",
                targetAnchorDay = targetAnchorDay,
                clock = { 1_000 },
                zoneId = ZoneOffset.UTC,
            ),
        )

        val reusedRun = requireNotNull(dao.runById(reusedRunId))
        val reusedTasks = dao.tasksForRun(reusedRunId)
        assertEquals("引っ越し準備", reusedRun.title)
        assertEquals(null, reusedRun.completedAnchorAt)
        assertEquals(listOf("業者を決める", "郵便転送を申し込む"), reusedTasks.map { it.title })
        assertEquals(LocalDate.of(2027, 3, 4).epochMillis(), reusedTasks[0].availableFromAt)
        assertEquals(LocalDate.of(2027, 3, 9).epochMillis(), reusedTasks[0].dueAt)
        assertEquals(LocalDate.of(2027, 4, 1).epochMillis(), reusedTasks[1].dueAt)
        assertEquals(listOf(null, null), reusedTasks.map { it.completedAt })
        assertEquals(
            listOf(PriorityExposure.Strong, PriorityExposure.Medium),
            reusedTasks.map { it.userPriority },
        )
        assertEquals(2, dao.getWidgetCues().count { it.runId == reusedRunId })
        assertEquals(sourceAnchorDay.epochMillis(), dao.runById("source-run")?.completedAnchorAt)
        assertEquals(listOf(true, true), dao.tasksForRun("source-run").map { it.completedAt != null })
    }

    @Test
    fun importedRevisionCreatesPrivateCuebookAndRun() = runTest {
        val repository = repository()

        val runId = requireNotNull(
            repository.importRun(
                payload = ImportedRunPayload(
                    title = "猫と引っ越す42日",
                    targetAnchorDay = LocalDate.of(2026, 10, 1),
                    originRevisionId = "revision-1",
                    tasks = listOf(
                        ImportedRunTask(
                            title = "動物病院で診療記録を受け取る",
                            defaultPriority = PriorityExposure.Strong,
                            relativeStartDay = -30,
                            relativeEndDay = -21,
                        ),
                    ),
                ),
                clock = { 500 },
                zoneId = ZoneOffset.UTC,
            ),
        )

        val run = requireNotNull(dao.runById(runId))
        val cuebook = dao.observeCuebooks().first().single()
        val cuebookTask = dao.tasksForCuebook(cuebook.id).single()
        val runTask = dao.tasksForRun(runId).single()

        assertEquals(1, dao.cuebookCount())
        assertEquals("revision-1", cuebook.originRevisionId)
        assertEquals(cuebook.id, run.sourceCuebookId)
        assertEquals(LocalDate.of(2026, 10, 1).epochMillis(), run.targetAnchorDay)
        assertEquals(cuebookTask.id, runTask.sourceTaskId)
        assertEquals(LocalDate.of(2026, 9, 1).epochMillis(), runTask.availableFromAt)
        assertEquals(LocalDate.of(2026, 9, 10).epochMillis(), runTask.dueAt)
    }

    @Test
    fun incompleteRunCannotBeReused() = runTest {
        seedRun()
        seedTask("run-1", "task-1", "未完了", PriorityExposure.Strong, sortOrder = 0)

        val reusedRunId = repository().reuseCompletedRun(
            sourceRunId = "run-1",
            targetAnchorDay = LocalDate.of(2027, 4, 15),
            zoneId = ZoneOffset.UTC,
        )

        assertEquals(null, reusedRunId)
        assertEquals(1, dao.runCount())
    }

    @Test
    fun cuebookCreatesIndependentRunsWithSourceBindings() = runTest {
        val repository = repository()
        val cuebookId = requireNotNull(
            repository.createCuebook(
                title = "海外出張準備",
                tasks = listOf(
                    CuebookTaskDraft(
                        title = "ホテル予約を確認する",
                        defaultPriority = PriorityExposure.Strong,
                        relativeStartDay = -10,
                        relativeEndDay = -7,
                    ),
                    CuebookTaskDraft(
                        title = "パスポートをかばんに入れる",
                        defaultPriority = PriorityExposure.Medium,
                        relativeEndDay = -1,
                    ),
                ),
                clock = { 100 },
            ),
        )

        val runA = requireNotNull(
            repository.createRunFromCuebook(
                cuebookId = cuebookId,
                targetAnchorDay = LocalDate.of(2026, 11, 20),
                clock = { 200 },
                zoneId = ZoneOffset.UTC,
            ),
        )
        val runB = requireNotNull(
            repository.createRunFromCuebook(
                cuebookId = cuebookId,
                targetAnchorDay = LocalDate.of(2027, 1, 15),
                clock = { 300 },
                zoneId = ZoneOffset.UTC,
            ),
        )
        val sourceTasks = dao.tasksForCuebook(cuebookId)

        repository.updateTask(
            taskId = dao.tasksForRun(runA).first().id,
            title = "今回だけホテル予約を2日前に確認する",
            availableFromAt = LocalDate.of(2026, 11, 18).epochMillis(),
            dueAt = LocalDate.of(2026, 11, 18).epochMillis(),
            priority = PriorityExposure.Strong,
            clock = { 400 },
        )
        repository.completeTask(dao.tasksForRun(runA).last().id)

        val runAEntity = requireNotNull(dao.runById(runA))
        val runBEntity = requireNotNull(dao.runById(runB))
        val runATasks = dao.tasksForRun(runA)
        val runBTasks = dao.tasksForRun(runB)

        assertEquals(cuebookId, runAEntity.sourceCuebookId)
        assertEquals(cuebookId, runBEntity.sourceCuebookId)
        assertEquals(LocalDate.of(2026, 11, 20).epochMillis(), runAEntity.targetAnchorDay)
        assertEquals(LocalDate.of(2027, 1, 15).epochMillis(), runBEntity.targetAnchorDay)
        assertEquals(sourceTasks.map { it.id }, runATasks.map { it.sourceTaskId })
        assertEquals(sourceTasks.map { it.id }, runBTasks.map { it.sourceTaskId })
        assertEquals(LocalDate.of(2026, 11, 18).epochMillis(), runATasks[0].availableFromAt)
        assertEquals(LocalDate.of(2026, 11, 18).epochMillis(), runATasks[0].dueAt)
        assertEquals(LocalDate.of(2027, 1, 5).epochMillis(), runBTasks[0].availableFromAt)
        assertEquals(LocalDate.of(2027, 1, 8).epochMillis(), runBTasks[0].dueAt)
        assertEquals(
            listOf("ホテル予約を確認する", "パスポートをかばんに入れる"),
            sourceTasks.map { it.title },
        )
        assertEquals("今回だけホテル予約を2日前に確認する", runATasks[0].title)
        assertEquals("ホテル予約を確認する", runBTasks[0].title)
        assertEquals(null, runBTasks[1].completedAt)
    }

    @Test
    fun repositoryPersistsValidDateRangeAndRejectsInvertedRange() = runTest {
        seedRun()
        seedTask("run-1", "task-1", "期間付き", PriorityExposure.Strong, sortOrder = 0)
        val repository = repository()

        val changed = repository.updateTask(
            taskId = "task-1",
            title = "期間付き",
            availableFromAt = 100,
            dueAt = 200,
            priority = PriorityExposure.Strong,
            clock = { 300 },
        )
        val rejected = repository.updateTask(
            taskId = "task-1",
            title = "期間付き",
            availableFromAt = 300,
            dueAt = 200,
            priority = PriorityExposure.Strong,
            clock = { 400 },
        )

        assertEquals(true, changed)
        assertEquals(false, rejected)
        assertEquals(100L, dao.taskById("task-1")?.availableFromAt)
        assertEquals(200L, dao.taskById("task-1")?.dueAt)
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
        completedAnchorAt: Long? = null,
    ) {
        dao.insertRun(
            RunEntity(
                id = id,
                title = title,
                completedAnchorAt = completedAnchorAt,
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

private fun LocalDate.epochMillis(): Long =
    atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
