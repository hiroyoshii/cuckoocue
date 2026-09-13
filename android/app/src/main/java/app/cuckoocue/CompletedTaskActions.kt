package app.cuckoocue

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
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
    var selecting by rememberSaveable(runId) { mutableStateOf(false) }
    var selected by rememberSaveable(runId) { mutableStateOf(arrayListOf<String>()) }
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
                selecting = false
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                error = failure.localizedMessage ?: "操作できませんでした。もう一度お試しください。"
            } finally {
                busy = false
            }
        }
    }

    fun select() {
        selected = ArrayList(completed.map { it.id })
        error = null
        selecting = true
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
                TextButton(onClick = { act(completed.map { it.id }, true) }, enabled = !busy) { Text("再利用用に整える ↗") }
            }
            TextButton(onClick = ::select, enabled = !busy) { Text("内容を選んで使う") }
            if (!selecting) {
                if (busy) {
                    Text(busyLabel, style = MaterialTheme.typography.bodySmall)
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        }
    }
    if (selecting) {
        AlertDialog(
            onDismissRequest = { if (!busy) selecting = false },
            title = { Text("内容を選んで使う") },
            text = {
                Column {
                    LazyColumn(Modifier.weight(1f, fill = false).heightIn(max = 360.dp)) {
                        items(completed, key = { it.id }) { task ->
                            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                                value = task.id in selected, enabled = !busy, role = Role.Checkbox,
                                onValueChange = { checked -> selected = ArrayList(if (checked) selected + task.id else selected - task.id) },
                            ), verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(checked = task.id in selected, onCheckedChange = null, enabled = !busy)
                                Text(task.title, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                    Text("${selected.size}件選択", style = MaterialTheme.typography.bodySmall)
                    Text("もう一度使う：日付・優先度をリセット\n整える：Webで日程の目安も編集", style = MaterialTheme.typography.bodySmall)
                    if (busy) {
                        Text(busyLabel, style = MaterialTheme.typography.bodySmall)
                        LinearProgressIndicator(Modifier.fillMaxWidth())
                    }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = {
                Column {
                    Button(onClick = { act(selected, false) }, enabled = !busy && selected.isNotEmpty()) { Text("もう一度使う") }
                    TextButton(onClick = { act(selected, true) }, enabled = !busy && selected.isNotEmpty()) { Text("再利用用に整える ↗") }
                }
            },
            dismissButton = { TextButton(onClick = { selecting = false }, enabled = !busy) { Text("閉じる") } },
        )
    }
}
