package app.cuckoocue.memory

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject

class MemoryEventClient(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
) {
    suspend fun ingest(kind: String, text: String) {
        val user = auth.currentUser ?: return
        runCatching {
            val token = user.getIdToken(false).await().token ?: return
            withContext(Dispatchers.IO) {
                val connection = URL("https://cuckoocue.hiyozoo.com/api/memory-events")
                    .openConnection() as HttpURLConnection
                try {
                    connection.requestMethod = "POST"
                    connection.connectTimeout = 8_000
                    connection.readTimeout = 10_000
                    connection.doOutput = true
                    connection.setRequestProperty("Authorization", "Bearer $token")
                    connection.setRequestProperty("Content-Type", "application/json")
                    val body = JSONObject()
                        .put("event_id", UUID.randomUUID().toString())
                        .put("kind", kind)
                        .put("text", text.trim())
                        .put("occurred_at", Instant.now().toString())
                    connection.outputStream.use { it.write(body.toString().toByteArray()) }
                    if (connection.responseCode !in 200..299) {
                        error("Memory event failed with HTTP ${connection.responseCode}")
                    }
                } finally {
                    connection.disconnect()
                }
            }
        }.onFailure { error ->
            Log.w("CuckooMemory", "Memory event was not accepted", error)
        }
    }
}
