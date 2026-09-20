package app.cuckoocue

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp

@Composable
internal fun EmptyRunSearchAction(
    hasCompletedRun: Boolean,
    onSearch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalCuckooColors.current
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = if (hasCompletedRun) "今動いているリストはありません" else "最初のリストを始めましょう",
            color = colors.ink,
            style = MaterialTheme.typography.titleMedium,
        )
        OutlinedButton(
            onClick = onSearch,
            modifier = Modifier.widthIn(max = 320.dp).fillMaxWidth().heightIn(min = 52.dp),
        ) {
            Icon(painterResource(R.drawable.ic_search), contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Webでタスクを探す ↗")
        }
    }
}

@Composable
internal fun CreateListDialog(title: String, onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) },
        text = { OutlinedTextField(value = name, onValueChange = { name = it },
            label = { Text("リスト名") }, singleLine = true) },
        confirmButton = { TextButton(enabled = name.isNotBlank(), onClick = { onCreate(name.trim()) }) { Text("作成") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("キャンセル") } })
}
