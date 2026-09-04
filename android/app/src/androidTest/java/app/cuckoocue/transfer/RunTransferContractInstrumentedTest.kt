package app.cuckoocue.transfer

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RunTransferContractInstrumentedTest {
    @Test
    fun parsesVerifiedHttpsImportReference() {
        val uri = Uri.parse(
            "https://cuckoocue.hiyozoo.com/import?entry_id=entry-1&target_anchor_day=2026-10-01",
        )

        val reference = RunTransferContract.parseImportUri(uri)

        assertEquals("entry-1", reference?.entryId)
        assertEquals(LocalDate.of(2026, 10, 1), reference?.targetAnchorDay)
    }

    @Test
    fun rejectsWrongOriginAndInvalidReference() {
        assertNull(
            RunTransferContract.parseImportUri(
                Uri.parse("cuckoocue://cuckoocue.hiyozoo.com/import?entry_id=entry-1&target_anchor_day=2026-10-01"),
            ),
        )
        assertNull(
            RunTransferContract.parseImportUri(
                Uri.parse("https://cuckoocue.hiyozoo.com/import?target_anchor_day=2026-10-01"),
            ),
        )
        assertNull(
            RunTransferContract.parseImportUri(
                Uri.parse("https://cuckoocue.hiyozoo.com/import?entry_id=entry-1&target_anchor_day=not-a-date"),
            ),
        )
    }

    @Test
    fun saveReviewUrlContainsOnlyRunReference() {
        val uri = RunTransferContract.buildSaveReviewUri(
            webAppUrl = "https://cuckoocue.hiyozoo.com",
            runId = "run-1",
        )

        assertEquals("run-1", uri.getQueryParameter("run_id"))
        assertEquals(1, uri.queryParameterNames.size)
    }
}
