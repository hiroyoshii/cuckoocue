package app.cuckoocue.data

import android.util.Log
import android.content.SharedPreferences
import com.google.firebase.auth.FirebaseAuth
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
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
    private val syncState: SharedPreferences,
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val schedule: (String, String) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val syncMutex = Mutex()

    fun enqueue(runId: String) {
        val owner = auth.currentUser?.uid ?: return
        val knownOwner = syncState.getString("owner:$runId", null)
        if (knownOwner != null && knownOwner != owner) return
        if (knownOwner == null) syncState.edit().putString("owner:$runId", owner).commit()
        schedule(owner, runId)
    }

    fun enqueueAll() {
        val owner = auth.currentUser?.uid ?: return
        scope.launch {
            dao.allRunIds().filter { syncState.getString("owner:$it", null) == owner }
                .forEach { if (auth.currentUser?.uid == owner) enqueue(it) }
        }
    }

    suspend fun receiveAll() {
        val owner = auth.currentUser?.uid ?: return
        var cursor: String? = null
        do {
            check(auth.currentUser?.uid == owner) { "アカウントが変更されました" }
            val token = auth.currentUser?.getIdToken(false)?.await()?.token ?: error("認証できませんでした")
            val page = withContext(Dispatchers.IO) {
                val suffix = cursor?.let { "&cursor=${URLEncoder.encode(it, "UTF-8")}" }.orEmpty()
                val connection = URL("${apiBaseUrl.trimEnd('/')}/api/runs?state=all$suffix").openConnection() as HttpURLConnection
                try {
                    connection.connectTimeout = 8_000; connection.readTimeout = 12_000
                    connection.setRequestProperty("Authorization", "Bearer $token")
                    check(connection.responseCode == 200) { "リスト一覧を受信できませんでした" }
                    JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                } finally { connection.disconnect() }
            }
            val runs = page.getJSONArray("runs")
            for (index in 0 until runs.length()) {
                check(auth.currentUser?.uid == owner) { "アカウントが変更されました" }
                val id = runs.getJSONObject(index).getString("id")
                if (dao.runById(id) == null) receive(id)
            }
            cursor = page.nullableString("nextCursor")
        } while (cursor != null)
    }

    suspend fun receive(runId: String) = syncMutex.withLock {
        require(runId.matches(Regex("[A-Za-z0-9_-]{1,128}")))
        val user = auth.currentUser ?: error("Webと同じアカウントでログインしてください")
        val knownOwner = syncState.getString("owner:$runId", null)
        check(knownOwner == null || knownOwner == user.uid) { "別のアカウントのリストです" }
        val token = user.getIdToken(false).await().token ?: error("認証できませんでした")
        val (snapshot, etag) = withContext(Dispatchers.IO) {
            val connection = URL("${apiBaseUrl.trimEnd('/')}/api/runs/$runId/snapshot").openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 8_000
                connection.readTimeout = 12_000
                connection.setRequestProperty("Authorization", "Bearer $token")
                check(connection.responseCode == 200) { "保存したリストを取得できませんでした（${connection.responseCode}）" }
                JSONObject(connection.inputStream.bufferedReader().use { it.readText() }).getJSONObject("run") to connection.getHeaderField("ETag")
            } finally { connection.disconnect() }
        }
        check(auth.currentUser?.uid == user.uid) { "アカウントが変更されました" }
        check(snapshot.getString("id") == runId)
        val run = RunEntity(
            id = runId, title = snapshot.getString("title"),
            sourceCuebookId = snapshot.nullableString("source_cuebook_id"),
            targetAnchorDay = snapshot.nullableLong("target_anchor_day"),
            sortOrder = snapshot.getInt("sort_order"), archivedAt = snapshot.nullableLong("archived_at"),
            completedAnchorAt = snapshot.nullableLong("completed_anchor_at"),
            createdAt = snapshot.getLong("created_at"), updatedAt = snapshot.getLong("updated_at"),
        )
        val jsonTasks = snapshot.getJSONArray("tasks")
        val tasks = (0 until jsonTasks.length()).map { index ->
            val task = jsonTasks.getJSONObject(index)
            RunTaskEntity(
                id = task.getString("id"), runId = runId, sourceTaskId = task.nullableString("source_task_id"),
                title = task.getString("title"), userPriority = task.nullableLong("user_priority")?.toInt(),
                availableFromAt = task.nullableLong("available_from_at"), dueAt = task.nullableLong("due_at"),
                sortOrder = task.getInt("sort_order"), completedAt = task.nullableLong("completed_at"),
                createdAt = task.getLong("created_at"), updatedAt = task.getLong("updated_at"),
            )
        }
        check(tasks.map { it.id }.distinct().size == tasks.size)
        if (dao.runById(runId) == null) {
            check(!etag.isNullOrBlank()) { "同期元の版を確認できませんでした" }
            check(syncState.edit().putString("owner:$runId", user.uid).putString("etag:${user.uid}:$runId", etag)
                .putString("zone:$runId", snapshot.getString("time_zone")).commit())
            dao.receiveNewRun(run, tasks, System.currentTimeMillis())
        } else {
            check(knownOwner == user.uid) { "既存のリストの所有者を確認できませんでした" }
        }
    }

    suspend fun sync(runId: String): Boolean = syncResult(runId) == RunSyncResult.Synced

    suspend fun syncResult(runId: String): RunSyncResult {
        repeat(3) { attempt ->
            val result = syncOnce(runId)
            if (result != RunSyncResult.Retry) return result
            if (attempt < 2) delay(500L * (attempt + 1))
        }
        return RunSyncResult.Retry
    }

    private suspend fun syncOnce(runId: String): RunSyncResult = syncMutex.withLock {
        val user = auth.currentUser ?: return@withLock RunSyncResult.Blocked
        val knownOwner = syncState.getString("owner:$runId", null)
        if (knownOwner != null && knownOwner != user.uid) return@withLock RunSyncResult.Blocked
        val snapshot = dao.runSyncSnapshot(runId) ?: return@withLock RunSyncResult.Synced
        val run = snapshot.first
        val tasks = snapshot.second.filter { it.title.isNotBlank() }
        val token = try { user.getIdToken(false).await().token } catch (it: Exception) {
            if (it is kotlinx.coroutines.CancellationException) throw it
            return@withLock if (it is com.google.firebase.FirebaseNetworkException || it is com.google.firebase.FirebaseTooManyRequestsException) RunSyncResult.Retry else RunSyncResult.Blocked
        }
            ?: return@withLock RunSyncResult.Blocked

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
                    syncState.getString("etag:${user.uid}:$runId", null)?.let { connection.setRequestProperty("If-Match", it) }
                    check(auth.currentUser?.uid == user.uid) { "アカウントが変更されました" }
                    connection.outputStream.use {
                        it.write(run.toSyncJson(tasks, syncState.getString("zone:$runId", null) ?: ZoneId.systemDefault().id).toString().toByteArray())
                    }
                    if (connection.responseCode in listOf(400, 401, 403, 404, 409)) {
                        return@withContext RunSyncResult.Blocked
                    }
                    if (connection.responseCode !in 200..299) {
                        error("Run sync failed with HTTP ${connection.responseCode}")
                    }
                    syncState.edit().putString("owner:$runId", user.uid)
                        .putString("etag:${user.uid}:$runId", connection.getHeaderField("ETag")).commit()
                    RunSyncResult.Synced
                } finally {
                    connection.disconnect()
                }
            }
        }.onFailure { Log.w("CuckooRunSync", "Run $runId was not synced", it) }
            .getOrElse { if (it is kotlinx.coroutines.CancellationException) throw it else RunSyncResult.Retry }
    }
}

internal enum class RunSyncResult { Synced, Retry, Blocked }

internal fun RunEntity.toSyncJson(tasks: List<RunTaskEntity>, timeZone: String) = JSONObject()
    .put("id", id)
    .put("title", title)
    .putNullable("source_cuebook_id", sourceCuebookId)
    .putNullable("target_anchor_day", targetAnchorDay)
    .put("sort_order", sortOrder)
    .putNullable("archived_at", archivedAt)
    .putNullable("completed_anchor_at", completedAnchorAt)
    .put("time_zone", timeZone)
    .put("created_at", createdAt)
    .put("updated_at", updatedAt)
    .put("tasks", JSONArray(tasks.map(RunTaskEntity::toSyncJson)))

private fun RunTaskEntity.toSyncJson() = JSONObject()
    .put("id", id)
    .put("title", title)
    .putNullable("source_task_id", sourceTaskId)
    .putNullable("user_priority", userPriority)
    .putNullable("available_from_at", availableFromAt)
    .putNullable("due_at", dueAt)
    .put("sort_order", sortOrder)
    .putNullable("completed_at", completedAt)
    .put("created_at", createdAt)
    .put("updated_at", updatedAt)

private fun JSONObject.putNullable(key: String, value: Any?): JSONObject =
    put(key, value ?: JSONObject.NULL)

private fun JSONObject.nullableLong(key: String): Long? = if (isNull(key)) null else getLong(key)
private fun JSONObject.nullableString(key: String): String? = if (isNull(key)) null else getString(key)
