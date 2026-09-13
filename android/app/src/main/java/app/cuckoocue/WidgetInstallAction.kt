package app.cuckoocue

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.cuckoocue.widget.CuckooCueWidgetReceiver

/** Adds the real widget through the launcher; no in-app rendering or preview. */
@Composable
internal fun WidgetInstallAction() {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val manager = remember(context) { AppWidgetManager.getInstance(context) }
    val provider = remember(context) { ComponentName(context, CuckooCueWidgetReceiver::class.java) }
    var installed by remember { mutableStateOf(manager.getAppWidgetIds(provider).isNotEmpty()) }
    var showInstructions by remember { mutableStateOf(false) }

    DisposableEffect(lifecycleOwner, manager) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) installed = manager.getAppWidgetIds(provider).isNotEmpty()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    if (!installed) {
        TextButton(onClick = {
            val requested = runCatching {
                manager.isRequestPinAppWidgetSupported && manager.requestPinAppWidget(provider, null, null)
            }.getOrDefault(false)
            if (!requested) showInstructions = true
        }) { Text("ホーム画面にWidgetを追加") }
    }
    if (showInstructions) {
        AlertDialog(
            onDismissRequest = { showInstructions = false },
            title = { Text("ホーム画面に追加") },
            text = { Text("ホーム画面の空いている場所を長押しし、ウィジェット一覧からCuckoo Cueを選んでください。操作はホームアプリによって異なります。") },
            confirmButton = { TextButton(onClick = { showInstructions = false }) { Text("閉じる") } },
        )
    }
}
