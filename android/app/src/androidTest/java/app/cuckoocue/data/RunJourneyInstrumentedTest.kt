package app.cuckoocue.data

import android.content.Intent
import android.net.Uri
import android.net.ConnectivityManager
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import app.cuckoocue.MainActivity
import app.cuckoocue.transfer.RunTransferContract
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in: real Android UI/Room/HTTP, local Firebase Auth, driver-selected Firestore, real BQ. */
@RunWith(AndroidJUnit4::class)
class RunJourneyInstrumentedTest {
    @Test
    fun receiveExecuteAndReturnToWeb() = runBlocking {
        val args = InstrumentationRegistry.getArguments()
        val runId = args.getString("journeyRunId")
        assumeTrue("Requires the Web journey driver", runId != null)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        check(context.getString(app.cuckoocue.R.string.cuckoo_cue_web_url) == "http://127.0.0.1:3113")
        val auth = FirebaseAuth.getInstance()
        auth.useEmulator("127.0.0.1", 9099)
        auth.signInWithCredential(GoogleAuthProvider.getCredential(requireNotNull(args.getString("journeyGoogleToken")), null)).await()
        assertEquals(args.getString("journeyOwner"), auth.currentUser!!.uid)
        val repository = CuckooRepository.getInstance(context)
        val dao = CuckooDatabase.getInstance(context).dao()
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val out = File(context.getExternalFilesDir(null), "run-journey").apply { mkdirs() }
        val uri = Uri.parse("https://cuckoocue.hiyozoo.com/import?run_id=$runId")
        assertEquals(runId, RunTransferContract.parseRunId(uri))
        assertNull(RunTransferContract.parseRunId(Uri.parse("$uri&run_id=other")))
        val intent = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        assertEquals("app.cuckoocue", intent.resolveActivity(context.packageManager)?.packageName)
        context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        run {
            eventually { dao.runById(runId!!) != null }
            val before = requireNotNull(dao.runSyncSnapshot(runId!!))
            assertTrue(before.second.isNotEmpty())
            device.takeScreenshot(File(out, "android-list-received.png"))
            context.startActivity(intent)
            assertTrue(device.wait(Until.hasObject(By.text(before.first.title)), 20_000))
            assertTrue(device.wait(Until.hasObject(By.text("□")), 20_000))
            device.takeScreenshot(File(out, "android-received.png"))
            File(out, "received.json").writeText(before.first.toSyncJson(before.second, "Asia/Tokyo").toString(2))
            assertTrue(dao.getWidgetCues().any { it.runId == runId })
            // Execute via the same checkbox the user operates, not an API completion fixture.
            val wifi = device.executeShellCommand("settings get global wifi_on").trim() == "1"
            val mobileData = device.executeShellCommand("settings get global mobile_data").trim() == "1"
            try {
                device.executeShellCommand("svc wifi disable")
                device.executeShellCommand("svc data disable")
                eventually { context.getSystemService(ConnectivityManager::class.java).activeNetwork == null }
                repeat(before.second.size) {
                    val checkbox = device.wait(Until.findObject(By.text("□")), 15_000)
                    assertNotNull("Pending task checkbox", checkbox)
                    checkbox.click()
                    eventually { dao.pendingTaskCountForRun(runId) == before.second.size - it - 1 }
                }
                val pending = WorkManager.getInstance(context).getWorkInfosForUniqueWork("run-sync:${auth.currentUser!!.uid}:$runId").get()
                assertTrue(pending.any { work -> work.state == WorkInfo.State.ENQUEUED || work.state == WorkInfo.State.BLOCKED })
                File(out, "offline-work.json").writeText(JSONObject().put("run_id", runId).put("queued", true).put("work_count", pending.size).toString(2))
            } finally {
                if (wifi) device.executeShellCommand("svc wifi enable")
                if (mobileData) device.executeShellCommand("svc data enable")
            }
            eventually { device.hasObject(By.text("再利用用に整える ↗")) }
            device.takeScreenshot(File(out, "android-completed.png"))
            val completed = requireNotNull(dao.runSyncSnapshot(runId))
            assertNotNull(completed.first.completedAnchorAt)
            assertTrue(completed.second.all { task -> task.completedAt != null })
            assertEquals(before.first.id, completed.first.id)
            assertEquals(before.first.sourceCuebookId, completed.first.sourceCuebookId)
            assertEquals(before.first.targetAnchorDay, completed.first.targetAnchorDay)
            assertEquals(before.second.map { task -> listOf(task.id, task.sourceTaskId, task.availableFromAt, task.dueAt, task.userPriority) }, completed.second.map { task -> listOf(task.id, task.sourceTaskId, task.availableFromAt, task.dueAt, task.userPriority) })
            // Reopening the saved link must not restore pre-completion state.
            repository.receiveRun(runId)
            assertEquals(completed, dao.runSyncSnapshot(runId))
            eventually { remote(auth, "/api/runs/$runId/snapshot").getJSONObject("run").getJSONArray("tasks").let { tasks -> (0 until tasks.length()).all { index -> !tasks.getJSONObject(index).isNull("completed_at") } } }
            File(out, "completed.json").writeText(completed.first.toSyncJson(completed.second, "Asia/Tokyo").toString(2))
            device.findObject(By.text("再利用用に整える ↗")).click()
            eventually { device.currentPackageName == "com.android.chrome" }
            assertTrue(device.wait(Until.hasObject(By.res("com.android.chrome", "url_bar")), 20_000))
            device.takeScreenshot(File(out, "android-web-return.png"))
            val firstTask = before.second.first()
            assertTrue(repository.undoCompleteTask(firstTask.id))
            eventually { remote(auth, "/api/runs").getJSONArray("runs").let { rows -> (0 until rows.length()).none { index -> rows.getJSONObject(index).getString("id") == runId } } }
            File(out, "undone.json").writeText(requireNotNull(dao.runSyncSnapshot(runId)).let { snapshot -> snapshot.first.toSyncJson(snapshot.second, "Asia/Tokyo") }.toString(2))
            assertTrue(repository.completeTask(firstTask.id).completed)
            eventually { remote(auth, "/api/runs").getJSONArray("runs").let { rows -> (0 until rows.length()).any { index -> rows.getJSONObject(index).getString("id") == runId } } }
            File(out, "result.json").writeText(JSONObject().put("passed", true).put("run_id", runId).put("owner", auth.currentUser!!.uid).toString(2))
        }
    }

    private suspend fun eventually(predicate: suspend () -> Boolean) {
        repeat(200) { if (predicate()) return; delay(300) }
        assertTrue("Condition did not become true", predicate())
    }

    private suspend fun remote(auth: FirebaseAuth, path: String): JSONObject {
        val token = auth.currentUser!!.getIdToken(false).await().token!!
        return withContext(Dispatchers.IO) {
            val connection = URL("http://127.0.0.1:3113$path").openConnection() as HttpURLConnection
            try {
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.connectTimeout = 5_000; connection.readTimeout = 10_000
                assertEquals(200, connection.responseCode)
                JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            } finally { connection.disconnect() }
        }
    }
}
