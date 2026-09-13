package app.cuckoocue.transfer

import android.net.Uri
import java.time.LocalDate

data class ImportReference(
    val entryId: String?,
    val revisionId: String?,
    val targetAnchorDay: LocalDate,
)

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
    val originRevisionId: String? = null,
)

object RunTransferContract {
    const val ImportScheme = "https"
    const val ImportHost = "cuckoocue.hiyozoo.com"
    const val ImportPath = "/import"

    fun parseRunId(uri: Uri?): String? {
        if (uri?.scheme != ImportScheme || uri.host != ImportHost || uri.path != ImportPath) return null
        if (uri.queryParameterNames != setOf("run_id")) return null
        if (uri.getQueryParameters("run_id").size != 1) return null
        return uri.getQueryParameter("run_id")?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{1,128}")) }
    }

    fun parseImportUri(uri: Uri?): ImportReference? {
        if (uri?.scheme != ImportScheme || uri.host != ImportHost || uri.path != ImportPath) return null
        val entryId = uri.getQueryParameter("entry_id")?.trim().orEmpty()
        val revisionId = uri.getQueryParameter("revision_id")?.trim().orEmpty()
        val anchor = runCatching {
            LocalDate.parse(uri.getQueryParameter("target_anchor_day"))
        }.getOrNull() ?: return null
        if (entryId.isEmpty() == revisionId.isEmpty()) return null
        return ImportReference(
            entryId = entryId.ifEmpty { null },
            revisionId = revisionId.ifEmpty { null },
            targetAnchorDay = anchor,
        )
    }

    fun buildSaveReviewUri(webAppUrl: String, runId: String): Uri =
        Uri.parse(webAppUrl).buildUpon()
            .appendQueryParameter("run_id", runId)
            .build()

    fun buildCompletedEditorUri(webAppUrl: String, runId: String, taskIds: List<String>): Uri {
        require(taskIds.isNotEmpty() && taskIds.distinct().size == taskIds.size)
        require(taskIds.all { it.matches(Regex("[A-Za-z0-9_-]{1,128}")) })
        // Fragment is not sent to the HTTP server. No task text or dates in the link.
        return buildSaveReviewUri(webAppUrl, runId).buildUpon()
            .fragment("edit_tasks=" + taskIds.joinToString(","))
            .build()
    }
}
