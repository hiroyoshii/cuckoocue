package app.cuckoocue.data

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import app.cuckoocue.MainActivity
import com.google.firebase.auth.FirebaseAuth
import java.io.File
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CompletedReuseUiTest {
    @Test
    fun reuseAllCompletedTasksWithoutSelectionLoginOrDateDialog(): Unit = runBlocking {
        // Never upload test content into a signed-in user's account.
        assumeTrue("Local UI fixture requires signed-out app", FirebaseAuth.getInstance().currentUser == null)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = CuckooDatabase.getInstance(context)
        val dao = database.dao()
        val sourceId = "reuse-ui-${UUID.randomUUID()}"
        val beforeIds = dao.allRunIds().toSet()
        val now = System.currentTimeMillis()
        val source = RunEntity(id = sourceId, title = "旅行の持ち物を確認", completedAnchorAt = now, createdAt = now, updatedAt = now)
        val tasks = listOf("充電器を入れる", "予約番号を控える", "家の鍵を確認する").mapIndexed { i, title ->
            RunTaskEntity(id = "$sourceId-$i", runId = sourceId, title = title, userPriority = 2, dueAt = now,
                completedAt = now, sortOrder = i, createdAt = now, updatedAt = now)
        }
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val out = File(context.getExternalFilesDir(null), "completed-reuse").apply { mkdirs() }
        var createdCopyId: String? = null
        try {
            dao.insertRunAndTasks(source, tasks, now)
            context.startActivity(Intent(context, MainActivity::class.java).setAction("app.cuckoocue.OPEN_WIDGET")
                .putExtra("widget_run_id", sourceId).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            assertTrue(device.wait(Until.hasObject(By.text("このリストは完了しました")), 20_000))
            device.waitForIdle()
            assertFalse(device.hasObject(By.text("表示例")))
            assertFalse(device.hasObject(By.text("ホーム画面にWidgetを追加")))
            device.takeScreenshot(File(out, "completed-actions.png"))
            assertFalse(device.hasObject(By.text("内容を選んで使う")))
            assertTrue(device.hasObject(By.text("再利用用に整える ↗")))
            device.findObject(By.text("もう一度使う")).click()
            var copyId: String? = null
            repeat(100) {
                copyId = dao.allRunIds().firstOrNull { it !in beforeIds && it != sourceId }
                if (copyId != null) return@repeat
                delay(100)
            }
            val copy = requireNotNull(dao.runById(requireNotNull(copyId)))
            createdCopyId = copy.id
            val copied = dao.tasksForRun(copy.id)
            assertEquals(tasks.map { it.title }, copied.map { it.title })
            assertTrue(copied.all { it.completedAt == null && it.dueAt == null && it.userPriority == null })
            assertNull(copy.targetAnchorDay)
            assertEquals(tasks, dao.tasksForRun(sourceId))
            assertTrue(device.wait(Until.hasObject(By.text("家の鍵を確認する")), 10_000))
            device.waitForIdle()
            device.takeScreenshot(File(out, "reused-run.png"))
            context.startActivity(Intent(context, MainActivity::class.java).setAction("app.cuckoocue.OPEN_WIDGET")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            assertTrue(device.wait(Until.hasObject(By.text("新しいリスト")), 10_000))
            assertFalse(device.hasObject(By.text("表示例")))
            device.findObject(By.text("表示")).click()
            assertTrue(device.wait(Until.hasObject(By.text("Widget text")), 10_000))
            device.waitForIdle()
            device.takeScreenshot(File(out, "widget-settings.png"))
        } finally {
            // Remove only this test's newly created Runs; retain all pre-existing data and widget placement.
            for (id in listOfNotNull(sourceId, createdCopyId)) {
                database.openHelper.writableDatabase.execSQL("DELETE FROM runs WHERE id = ?", arrayOf(id))
            }
        }
    }
}
