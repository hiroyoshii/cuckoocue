package app.cuckoocue.data

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import java.net.HttpURLConnection
import java.net.URL
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

internal class RunSyncClient(
    private val dao: CuckooDao,
    private val apiBaseUrl: String,
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val queue = Channel<String>(Channel.UNLIMITED)
    private val syncMutex = Mutex()

    init {
        scope.launch {
            for (runId in queue) {
                sync(runId)
            }
        }
    }

    fun enqueue(runId: String) {
        queue.trySend(runId)
    }

    fun enqueueAll() {
        scope.launch { dao.allRunIds().forEach(queue::trySend) }
    }

    suspend fun sync(runId: String): Boolean {
        repeat(3) { attempt ->
            if (syncOnce(runId)) return true
            if (attempt < 2) delay(500L * (attempt + 1))
        }
        return false
    }

    private suspend fun syncOnce(runId: String): Boolean = syncMutex.withLock {
        val user = auth.currentUser ?: return@withLock false
        val run = dao.runById(runId) ?: return@withLock false
        val tasks = dao.tasksForRun(runId).filter { it.title.isNotBlank() }
        val token = runCatching { user.getIdToken(false).await().token }.getOrNull()
            ?: return@withLock false

        runCatching {
            withContext(Dispatchers.IO) {
                val connection = URL("${apiBaseUrl.trimEnd('/')}/api/runs/${run.id}")
                    .openConnection() as HttpURLConnection
                try {
                    connection.requestMethod = "PUT"
                    connection.connectTimeout = 8_000
                    connection.readTimeout = 12_000
                    connection.doOutput = true
                    connection.setRequestProperty("Authorization", "Bearer $token")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.outputStream.use {
                        it.write(run.toSyncJson(tasks).toString().toByteArray())
                    }
                    if (connection.responseCode !in 200..299) {
                        error("Run sync failed with HTTP ${connection.responseCode}")
                    }
                } finally {
                    connection.disconnect()
                }
            }
        }.onFailure { Log.w("CuckooRunSync", "Run $runId was not synced", it) }
            .isSuccess
    }
}

private fun RunEntity.toSyncJson(tasks: List<RunTaskEntity>) = JSONObject()
    .put("id", id)
    .put("title", title)
    .put("sort_order", sortOrder)
    .putNullable("archived_at", archivedAt)
    .putNullable("completed_anchor_at", completedAnchorAt)
    .put("time_zone", ZoneId.systemDefault().id)
    .put("created_at", createdAt)
    .put("updated_at", updatedAt)
    .put("tasks", JSONArray(tasks.map(RunTaskEntity::toSyncJson)))

private fun RunTaskEntity.toSyncJson() = JSONObject()
    .put("id", id)
    .put("title", title)
    .putNullable("user_priority", userPriority)
    .putNullable("available_from_at", availableFromAt)
    .putNullable("due_at", dueAt)
    .put("sort_order", sortOrder)
    .putNullable("completed_at", completedAt)
    .put("created_at", createdAt)
    .put("updated_at", updatedAt)

private fun JSONObject.putNullable(key: String, value: Any?): JSONObject =
    put(key, value ?: JSONObject.NULL)
