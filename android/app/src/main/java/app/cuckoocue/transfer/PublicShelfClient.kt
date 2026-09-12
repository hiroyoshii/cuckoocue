package app.cuckoocue.transfer

import app.cuckoocue.data.CuebookSnapshot
import com.google.firebase.auth.FirebaseAuth
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class EditableShelfSummary(
    val id: String,
    val title: String,
    val context: String,
)

class PublicShelfClient(
    private val apiBaseUrl: String,
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
) {
    suspend fun editableShelves(): List<EditableShelfSummary> {
        val user = auth.currentUser ?: error("Googleアカウントでログインしてください")
        val token = user.getIdToken(false).await().token ?: error("ログイン情報を取得できませんでした")
        val root = requestJson(
            path = "/api/shelves",
            method = "GET",
            token = token,
        )
        val shelves = root.optJSONArray("shelves") ?: JSONArray()
        return buildList {
            for (index in 0 until shelves.length()) {
                val shelf = shelves.getJSONObject(index)
                if (shelf.optString("created_by") == user.uid) {
                    add(
                        EditableShelfSummary(
                            id = shelf.getString("id"),
                            title = shelf.optString("title"),
                            context = shelf.optString("context"),
                        ),
                    )
                }
            }
        }
    }

    suspend fun publishCuebook(
        shelfId: String,
        snapshot: CuebookSnapshot,
    ): String {
        val user = auth.currentUser ?: error("Googleアカウントでログインしてください")
        val token = user.getIdToken(false).await().token ?: error("ログイン情報を取得できませんでした")
        val revisionId = UUID.randomUUID().toString()
        val body = JSONObject()
            .put("revision_id", revisionId)
            .put("source_cuebook_id", snapshot.id)
            .put("shelf_id", shelfId)
            .put("title", snapshot.title)
            .put(
                "tasks",
                JSONArray(
                    snapshot.tasks.map { task ->
                        JSONObject()
                            .put("title", task.title)
                            .put("default_priority", task.defaultPriority)
                            .put("relative_start_day", task.relativeStartDay)
                            .put("relative_end_day", task.relativeEndDay)
                    },
                ),
            )
        val root = requestJson(
            path = "/api/cuebook-revisions",
            method = "POST",
            token = token,
            body = body,
        )
        return root.getJSONObject("revision").getString("id")
    }

    private suspend fun requestJson(
        path: String,
        method: String,
        token: String,
        body: JSONObject? = null,
    ): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL("${apiBaseUrl.trimEnd('/')}$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 8_000
            connection.readTimeout = 12_000
            connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { stream ->
                    stream.write(body.toString().toByteArray(Charsets.UTF_8))
                }
            }
            val responseCode = connection.responseCode
            val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (responseCode !in 200..299) {
                error(JSONObject(text.ifBlank { "{}" }).optString("error", "本棚の処理に失敗しました"))
            }
            JSONObject(text.ifBlank { "{}" })
        } finally {
            connection.disconnect()
        }
    }
}
