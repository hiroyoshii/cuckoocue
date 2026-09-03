package app.cuckoocue.transfer

import android.net.Uri
import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.cuckoocue.data.RunEntity
import app.cuckoocue.data.RunTaskEntity
import java.nio.charset.StandardCharsets
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RunTransferContractInstrumentedTest {
    @Test
    fun parsesVerifiedHttpsImportAndPreservesPriorityAndRelativeRange() {
        val uri = importUri(priority = 0, start = -14, end = -7)

        val payload = RunTransferContract.parseImportUri(uri)

        assertEquals("東京から名古屋への引っ越し", payload?.title)
        assertEquals(LocalDate.of(2026, 10, 1), payload?.targetAnchorDay)
        assertEquals(0, payload?.tasks?.single()?.defaultPriority)
        assertEquals(-14, payload?.tasks?.single()?.relativeStartDay)
        assertEquals(-7, payload?.tasks?.single()?.relativeEndDay)
    }

    @Test
    fun rejectsInvalidPriorityAndInvertedRange() {
        assertNull(RunTransferContract.parseImportUri(importUri(priority = 3, start = -14, end = -7)))
        assertNull(RunTransferContract.parseImportUri(importUri(priority = 0, start = 1, end = -1)))
    }

    @Test
    fun rejectsWrongOriginVersionDateAndOversizedPayload() {
        assertNull(RunTransferContract.parseImportUri(importUri(scheme = "cuckoocue")))
        assertNull(RunTransferContract.parseImportUri(importUri(version = 2)))
        assertNull(RunTransferContract.parseImportUri(importUri(anchorDay = "not-a-date")))
        assertNull(RunTransferContract.parseImportUri(importUri(taskText = "x".repeat(16_000))))
    }

    @Test
    fun acceptsOpenEndedAndSameDayRanges() {
        val openEnded = RunTransferContract.parseImportUri(importUri(start = null, end = -7))
        val sameDay = RunTransferContract.parseImportUri(importUri(start = 0, end = 0))

        assertNull(openEnded?.tasks?.single()?.relativeStartDay)
        assertEquals(-7, openEnded?.tasks?.single()?.relativeEndDay)
        assertEquals(0, sameDay?.tasks?.single()?.relativeStartDay)
        assertEquals(0, sameDay?.tasks?.single()?.relativeEndDay)
    }

    @Test
    fun saveReviewUsesPersistedCompletionAnchorInsteadOfOpenDay() {
        val zone = ZoneId.of("Asia/Tokyo")
        val completionDay = LocalDate.of(2026, 9, 30)
        val completedAt = completionDay.atStartOfDay(zone).toInstant().toEpochMilli()
        val run = RunEntity(
            id = "run",
            title = "完了済み",
            completedAnchorAt = completedAt,
            createdAt = completedAt,
            updatedAt = completedAt,
        )
        val task = RunTaskEntity(
            id = "task",
            runId = "run",
            title = "前日に行う",
            userPriority = 1,
            availableFromAt = completionDay.minusDays(2).atStartOfDay(zone).toInstant().toEpochMilli(),
            dueAt = completionDay.minusDays(1).atStartOfDay(zone).toInstant().toEpochMilli(),
            sortOrder = 0,
            completedAt = completedAt,
            createdAt = completedAt,
            updatedAt = completedAt,
        )

        val uri = RunTransferContract.buildSaveReviewUri(
            webAppUrl = "https://cuckoocue.hiyozoo.com",
            run = run,
            tasks = listOf(task),
            zoneId = zone,
        )
        val root = JSONObject(decode(requireNotNull(uri.getQueryParameter("save"))))
        val exportedTask = root.getJSONArray("tasks").getJSONObject(0)

        assertEquals("2026-09-30", root.getString("source_anchor_day"))
        assertEquals(-2, exportedTask.getInt("relative_start_day"))
        assertEquals(-1, exportedTask.getInt("relative_end_day"))
    }

    private fun importUri(
        priority: Int? = 0,
        start: Int? = -14,
        end: Int? = -7,
        scheme: String = "https",
        version: Int = 1,
        anchorDay: String = "2026-10-01",
        taskText: String = "転入届を出す",
    ): Uri {
        val task = JSONObject()
            .put("title", taskText)
            .put("default_priority", priority ?: JSONObject.NULL)
            .put("relative_start_day", start ?: JSONObject.NULL)
            .put("relative_end_day", end ?: JSONObject.NULL)
        val root = JSONObject()
            .put("version", version)
            .put("title", "東京から名古屋への引っ越し")
            .put("target_anchor_day", anchorDay)
            .put("tasks", JSONArray().put(task))
        val encoded = Base64.encodeToString(
            root.toString().toByteArray(StandardCharsets.UTF_8),
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
        return Uri.parse("$scheme://cuckoocue.hiyozoo.com/import?payload=$encoded")
    }

    private fun decode(value: String): String = String(
        Base64.decode(value, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING),
        StandardCharsets.UTF_8,
    )
}
