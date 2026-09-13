package app.cuckoocue

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cuckoocue.data.RunTaskEntity
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Execution stays local; only the explicit edit action signs in and hands off to Web. */
@Composable
internal fun CompletedTaskActions(
    runId: String,
    completed: List<RunTaskEntity>,
    fullyCompleted: Boolean,
    onReuse: suspend (List<String>) -> Unit,
    onEdit: suspend (List<String>) -> Unit,
) {
    val colors = LocalCuckooColors.current
    val scope = rememberCoroutineScope()
    var busy by remember(runId) { mutableStateOf(false) }
    var busyLabel by remember(runId) { mutableStateOf("") }
    var error by remember(runId) { mutableStateOf<String?>(null) }

    fun act(ids: List<String>, edit: Boolean) {
        if (busy || ids.isEmpty()) return
        busy = true
        busyLabel = if (edit) "Webに渡す準備中…" else "新しいリストを作成中…"
        error = null
        val captured = ids.toList()
        scope.launch {
            try {
                if (edit) onEdit(captured) else onReuse(captured)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                error = failure.localizedMessage ?: "操作できませんでした。もう一度お試しください。"
            } finally {
                busy = false
            }
        }
    }

    Surface(color = colors.panel, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, colors.line)) {
        Column(Modifier.fillMaxWidth().padding(14.dp)) {
            Text(if (fullyCompleted) "このリストは完了しました" else "完了したタスクを再利用", color = colors.ink)
            if (fullyCompleted) {
                Button(onClick = { act(completed.map { it.id }, false) }, enabled = !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = colors.teal), modifier = Modifier.fillMaxWidth()) {
                    Text("もう一度使う")
                }
                Text("日付・優先度・完了状態をリセットしてコピー", style = MaterialTheme.typography.bodySmall, color = colors.muted)
            }
            TextButton(onClick = { act(completed.map { it.id }, true) }, enabled = !busy) { Text("再利用用に整える ↗") }
            if (busy) {
                Text(busyLabel, style = MaterialTheme.typography.bodySmall)
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}
