package app.cuckoocue.transfer

import android.net.Uri
import java.time.LocalDate

data class ImportReference(
    val entryId: String,
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
)

object RunTransferContract {
    const val ImportScheme = "https"
    const val ImportHost = "cuckoocue.hiyozoo.com"
    const val ImportPath = "/import"

    fun parseImportUri(uri: Uri?): ImportReference? {
        if (uri?.scheme != ImportScheme || uri.host != ImportHost || uri.path != ImportPath) return null
        val entryId = uri.getQueryParameter("entry_id")?.trim().orEmpty()
        val anchor = runCatching {
            LocalDate.parse(uri.getQueryParameter("target_anchor_day"))
        }.getOrNull() ?: return null
        if (entryId.isEmpty()) return null
        return ImportReference(entryId, anchor)
    }

    fun buildSaveReviewUri(webAppUrl: String, runId: String): Uri =
        Uri.parse(webAppUrl).buildUpon()
            .appendQueryParameter("run_id", runId)
            .build()
}
