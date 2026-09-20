package app.cuckoocue

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class ListStartUiTest {
    @Test fun emptyCompletedAndActiveScreensAndCreateDialog() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val device = UiDevice.getInstance(instrumentation)
        val out = File(instrumentation.targetContext.getExternalFilesDir(null), "list-start").apply { mkdirs() }
        for (state in listOf("empty", "completed", "active")) {
            instrumentation.targetContext.startActivity(Intent(instrumentation.targetContext, ListStartTestActivity::class.java)
                .putExtra("state", state).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
            assertTrue(device.wait(Until.hasObject(By.desc("新しいリストを作る")), 20_000))
            if (state == "empty") {
                assertTrue(device.wait(Until.hasObject(By.text("最初のリストを始めましょう")), 10_000))
            } else if (state == "completed") {
                assertTrue(device.wait(Until.hasObject(By.text("今動いているリストはありません")), 10_000))
                assertTrue(device.hasObject(By.text("最近完了")))
                assertTrue(device.hasObject(By.text("完了履歴からもう一度使う ↗")))
            } else {
                assertTrue(device.wait(Until.hasObject(By.text("充電器を入れる")), 10_000))
            }
            device.waitForIdle()
            assertFalse(device.hasObject(By.clazz("android.widget.EditText")))
            if (state == "active") {
                assertTrue(device.hasObject(By.desc("Webでタスクを探す")))
                assertFalse(device.hasObject(By.text("Webでタスクを探す ↗")))
            } else {
                assertFalse(device.hasObject(By.desc("Webでタスクを探す")))
                assertTrue(device.hasObject(By.text("Webでタスクを探す ↗")))
            }
            device.takeScreenshot(File(out, "$state.png"))
            device.findObject(By.desc("新しいリストを作る")).click()
            assertTrue(device.wait(Until.hasObject(By.text("リスト名")), 5_000))
            device.findObject(By.clazz("android.widget.EditText")).text = "Weekend"
            assertTrue(device.wait(Until.hasObject(By.text("Weekend")), 5_000))
            device.waitForIdle()
            device.takeScreenshot(File(out, "create-$state.png"))
            device.findObject(By.text("キャンセル")).click()
            assertTrue(device.wait(Until.gone(By.clazz("android.widget.EditText")), 5_000))
            assertFalse(device.hasObject(By.text("Weekend")))
            if (state == "empty") {
                device.findObject(By.desc("新しいリストを作る")).click()
                assertTrue(device.wait(Until.hasObject(By.clazz("android.widget.EditText")), 5_000))
                device.findObject(By.clazz("android.widget.EditText")).text = "Weekend"
                assertTrue(device.wait(Until.hasObject(By.text("Weekend")), 5_000))
                device.findObject(By.text("作成")).click()
                assertTrue(device.wait(Until.gone(By.clazz("android.widget.EditText")), 5_000))
                assertTrue(device.wait(Until.hasObject(By.text("Weekend")), 5_000))
            }
            device.pressBack()
        }
    }
}
