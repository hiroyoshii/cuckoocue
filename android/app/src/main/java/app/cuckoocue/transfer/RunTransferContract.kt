package app.cuckoocue.transfer

import android.net.Uri
import android.util.Base64
import app.cuckoocue.data.RunEntity
import app.cuckoocue.data.RunTaskEntity
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import org.json.JSONArray
import org.json.JSONObject

data class ImportedRunTask(
    val title: String,
    val defaultPriority: Int?,
    val relativeStartDay: Int?,
    val relativeEndDay: Int?,
)

data class ImportedRunPayload(
    val title: String,
    val targetAnchorDay: LocalDate,
    val tasks: List<ImportedRunTask>,
)

object RunTransferContract {
    const val ImportScheme = "https"
    const val ImportHost = "cuckoocue.hiyozoo.com"
    const val ImportPath = "/import"
    private const val Version = 1

    fun parseImportUri(uri: Uri?): ImportedRunPayload? {
        if (uri?.scheme != ImportScheme || uri.host != ImportHost || uri.path != ImportPath) return null
        val encoded = uri.getQueryParameter("payload") ?: return null
        val json = decode(encoded) ?: return null
        val root = runCatching { JSONObject(json) }.getOrNull() ?: return null
        if (root.optInt("version") != Version || encoded.length > MaxEncodedLength) return null

        val title = root.optString("title").trim()
        val anchor = runCatching { LocalDate.parse(root.optString("target_anchor_day")) }.getOrNull()
            ?: return null
        val taskArray = root.optJSONArray("tasks") ?: return null
        if (taskArray.length() !in 1..MaxTaskCount) return null
        val tasks = buildList {
            for (index in 0 until taskArray.length()) {
                val task = taskArray.optJSONObject(index) ?: continue
                val taskTitle = task.optString("title").trim()
                if (taskTitle.isBlank() || taskTitle.length > 240) return null
                if (!task.has("default_priority") || !task.has("relative_start_day") || !task.has("relative_end_day")) return null
                val priority = task.strictNullableInt("default_priority") ?: if (task.isNull("default_priority")) null else return null
                val start = task.strictNullableInt("relative_start_day") ?: if (task.isNull("relative_start_day")) null else return null
                val end = task.strictNullableInt("relative_end_day") ?: if (task.isNull("relative_end_day")) null else return null
                if (priority != null && priority !in 0..2) return null
                if (start != null && start !in -3650..3650) return null
                if (end != null && end !in -3650..3650) return null
                if (start != null && end != null && start > end) return null
                add(
                    ImportedRunTask(
                        title = taskTitle,
                        defaultPriority = priority,
                        relativeStartDay = start,
                        relativeEndDay = end,
                    ),
                )
            }
        }
        if (title.isBlank() || tasks.isEmpty()) return null
        return ImportedRunPayload(title = title, targetAnchorDay = anchor, tasks = tasks)
    }

    fun buildSaveReviewUri(
        webAppUrl: String,
        run: RunEntity,
        tasks: List<RunTaskEntity>,
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): Uri {
        val anchorDay = run.completedAnchorAt
            ?.let { Instant.ofEpochMilli(it).atZone(zoneId).toLocalDate() }
            ?: error("Completed run has no stable completion anchor")
        val taskArray = JSONArray()
        tasks.sortedBy { it.sortOrder }.forEach { task ->
            taskArray.put(
                JSONObject()
                    .put("text", task.title)
                    .putNullable("default_priority", task.userPriority)
                    .putNullable("relative_start_day", task.availableFromAt.relativeDay(anchorDay, zoneId))
                    .putNullable("relative_end_day", task.dueAt.relativeDay(anchorDay, zoneId)),
            )
        }
        val payload = JSONObject()
            .put("version", Version)
            .put("title", run.title)
            .put("source_anchor_day", anchorDay.toString())
            .put("tasks", taskArray)

        return Uri.parse(webAppUrl).buildUpon()
            .appendQueryParameter("save", encode(payload.toString()))
            .build()
    }

    private fun encode(value: String): String =
        Base64.encodeToString(
            value.toByteArray(StandardCharsets.UTF_8),
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )

    private fun decode(value: String): String? = runCatching {
        String(
            Base64.decode(value, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING),
            StandardCharsets.UTF_8,
        )
    }.getOrNull()

    private const val MaxEncodedLength = 16_000
    private const val MaxTaskCount = 50
}

private fun JSONObject.strictNullableInt(key: String): Int? =
    if (!has(key) || isNull(key)) null else get(key).let { if (it is Number) it.toInt() else null }

private fun JSONObject.putNullable(key: String, value: Int?): JSONObject =
    put(key, value ?: JSONObject.NULL)

private fun Long?.relativeDay(anchorDay: LocalDate, zoneId: ZoneId): Int? =
    this?.let {
        ChronoUnit.DAYS.between(
            anchorDay,
            Instant.ofEpochMilli(it).atZone(zoneId).toLocalDate(),
        ).toInt()
    }
