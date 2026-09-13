package app.cuckoocue

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.res.Configuration
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.cuckoocue.widget.CuckooCueWidgetReceiver

internal data class InstalledWidgetSize(val id: Int, val size: DpSize)

/** Same orientation dimensions used by Glance's Exact size mode. Refresh on return from launcher. */
@Composable
internal fun installedWidgetSizes(): List<InstalledWidgetSize> {
    val context = LocalContext.current
    val landscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var revision by remember { mutableIntStateOf(0) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) revision++ }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    return remember(context, landscape, revision) {
        val manager = AppWidgetManager.getInstance(context)
        manager.getAppWidgetIds(ComponentName(context, CuckooCueWidgetReceiver::class.java)).sorted().mapNotNull { id ->
            val options = manager.getAppWidgetOptions(id)
            val width = options.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH else AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
            val height = options.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
            if (width > 0 && height > 0) InstalledWidgetSize(id, DpSize(width.dp, height.dp)) else null
        }
    }
}
