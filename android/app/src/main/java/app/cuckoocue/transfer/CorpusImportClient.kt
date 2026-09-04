package app.cuckoocue.transfer

import com.google.firebase.auth.FirebaseAuth
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject

class CorpusImportClient(
    private val apiBaseUrl: String,
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
) {
    suspend fun fetch(reference: ImportReference): ImportedRunPayload {
        val user = auth.currentUser ?: error("Googleアカウントでログインしてください")
        val token = user.getIdToken(false).await().token ?: error("ログイン情報を取得できませんでした")
        val entryId = URLEncoder.encode(reference.entryId, StandardCharsets.UTF_8.name())
        val anchorDay = URLEncoder.encode(reference.targetAnchorDay.toString(), StandardCharsets.UTF_8.name())
        val body = withContext(Dispatchers.IO) {
            val connection = URL(
                "${apiBaseUrl.trimEnd('/')}/api/import-payload/$entryId?target_anchor_day=$anchorDay",
            ).openConnection() as HttpURLConnection
            try {
                connection.requestMethod = "GET"
                connection.connectTimeout = 8_000
                connection.readTimeout = 12_000
                connection.setRequestProperty("Authorization", "Bearer $token")
                val responseCode = connection.responseCode
                val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
                val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
                if (responseCode !in 200..299) {
                    error(JSONObject(text.ifBlank { "{}" }).optString("error", "取り込みに失敗しました"))
                }
                text
            } finally {
                connection.disconnect()
            }
        }
        return parsePayload(JSONObject(body).getJSONObject("importPayload"))
    }
}

private fun parsePayload(root: JSONObject): ImportedRunPayload {
    if (root.optInt("version") != 1) error("未対応の取り込み形式です")
    val title = root.optString("title").trim()
    val anchor = runCatching { LocalDate.parse(root.optString("target_anchor_day")) }.getOrNull()
        ?: error("基準日が不正です")
    val values = root.optJSONArray("tasks") ?: error("タスクがありません")
    val tasks = buildList {
        for (index in 0 until values.length()) {
            val task = values.getJSONObject(index)
            val taskTitle = task.optString("title").trim()
            if (taskTitle.isEmpty()) error("空のタスクは取り込めません")
            val priority = task.nullableInt("default_priority")
            val start = task.nullableInt("relative_start_day")
            val end = task.nullableInt("relative_end_day")
            if (priority != null && priority !in 0..2) error("優先度が不正です")
            if (start != null && end != null && start > end) error("日付範囲が不正です")
            add(ImportedRunTask(taskTitle, priority, start, end))
        }
    }
    if (title.isEmpty() || tasks.isEmpty()) error("取り込み内容が空です")
    return ImportedRunPayload(title, anchor, tasks)
}

private fun JSONObject.nullableInt(key: String): Int? =
    if (!has(key) || isNull(key)) null else getInt(key)
