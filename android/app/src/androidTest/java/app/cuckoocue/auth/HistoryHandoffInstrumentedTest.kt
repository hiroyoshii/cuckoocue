package app.cuckoocue.auth

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HistoryHandoffInstrumentedTest {
    @Test fun loginContinuesTheOriginalRunExactlyOnce() = runTest {
        var signedIn = false
        val events = mutableListOf<String>()
        openHistoryAfterSignIn("original", { signedIn }, { events += "login"; signedIn = true },
            { events += "sync:$it"; true }, { events += "open:$it" })
        assertEquals(listOf("login", "sync:original", "open:original"), events)
    }

    @Test fun signedInUserSkipsLogin() = runTest {
        val events = mutableListOf<String>()
        openHistoryAfterSignIn("original", { true }, { error("Unexpected login") },
            { events += "sync:$it"; true }, { events += "open:$it" })
        assertEquals(listOf("sync:original", "open:original"), events)
    }

    @Test fun cancelledLoginDoesNotSyncOrOpen() = runTest {
        val result = runCatching {
            openHistoryAfterSignIn("original", { false }, { throw IllegalStateException("cancelled") },
                { error("Must not sync") }, { error("Must not open") })
        }
        assertEquals("cancelled", result.exceptionOrNull()?.message)
    }

    @Test fun failedSyncDoesNotOpenAndCanBeRetried() = runTest {
        val opened = mutableListOf<String>()
        val result = runCatching {
            openHistoryAfterSignIn("original", { true }, {}, { false }, { opened += it })
        }
        assertEquals(true, result.isFailure)
        assertEquals(emptyList<String>(), opened)
        openHistoryAfterSignIn("original", { true }, {}, { true }, { opened += it })
        assertEquals(listOf("original"), opened)
    }
}
