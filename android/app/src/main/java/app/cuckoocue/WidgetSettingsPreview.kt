package app.cuckoocue

import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.widget.RemoteViews
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.glance.appwidget.ExperimentalGlanceRemoteViewsApi
import androidx.glance.appwidget.GlanceRemoteViews
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.cuckoocue.appearance.AppearanceSettings
import app.cuckoocue.data.CuckooRepository
import app.cuckoocue.widget.WidgetSettingsPreviewContent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/** Never dispatches touch, keyboard or accessibility actions to real widget PendingIntents. */
private class ReadOnlyWidgetPreview(context: Context) : AppWidgetHostView(context) {
    private var lastViews: RemoteViews? = null
    init {
        val info = AppWidgetManager.getInstance(context).installedProviders.firstOrNull {
            it.provider.className == "app.cuckoocue.widget.CuckooCueWidgetReceiver"
        }
        setAppWidget(AppWidgetManager.INVALID_APPWIDGET_ID, info)
        setPadding(0, 0, 0, 0)
        descendantFocusability = FOCUS_BLOCK_DESCENDANTS
    }
    override fun dispatchTouchEvent(event: MotionEvent): Boolean = true
    override fun onViewAdded(child: View) {
        super.onViewAdded(child)
        child.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }
    fun show(remoteViews: RemoteViews) {
        if (lastViews === remoteViews) return
        lastViews = remoteViews
        updateAppWidget(remoteViews)
    }
}

@OptIn(ExperimentalGlanceRemoteViewsApi::class)
@Composable
internal fun WidgetSettingsPreview(settings: AppearanceSettings) {
    val context = LocalContext.current
    val repository = remember(context) { CuckooRepository.getInstance(context) }
    val cues by repository.widgetCues.collectAsStateWithLifecycle(initialValue = emptyList())
    val systemDark = isSystemInDarkTheme()
    val renderer = remember { GlanceRemoteViews() }
    var views by remember { mutableStateOf<RemoteViews?>(null) }
    var error by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }
    val installed = installedWidgetSizes()
    var selectedId by remember { mutableStateOf<Int?>(null) }
    val selected = installed.firstOrNull { it.id == selectedId } ?: installed.firstOrNull()
    Text("Widgetプレビュー", style = MaterialTheme.typography.titleSmall)
    Text("Widget対象のCue・全リスト／変更は自動保存",
        style = MaterialTheme.typography.bodySmall)
    if (installed.size > 1) {
        Row {
            installed.forEachIndexed { index, widget ->
                TextButton(onClick = { selectedId = widget.id }) { Text("Widget ${index + 1}") }
            }
        }
    }
    Text(selected?.let { "設置済みの寸法 ${it.size.width.value.toInt()} × ${it.size.height.value.toInt()} dp" }
        ?: "未設置：この枠での参考表示", style = MaterialTheme.typography.bodySmall)
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val size = selected?.size ?: DpSize(maxWidth, 180.dp)
        val scale = minOf(1f, maxWidth / size.width, 240.dp / size.height)
        LaunchedEffect(cues, settings, systemDark, size, attempt) {
            views = null
            error = false
            try {
                views = withContext(Dispatchers.Default) {
                    renderer.compose(context, size) {
                        WidgetSettingsPreviewContent(cues, settings, systemDark)
                    }.remoteViews
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { error = true }
        }
        val current = views
        if (current != null) {
            // Measure at the real widget dimensions; scale the whole view only when it cannot fit.
            Layout(content = {
            AndroidView(factory = { ReadOnlyWidgetPreview(it) },
                update = {
                    it.show(current)
                    it.contentDescription = "操作できないWidgetプレビュー。${settings.widgetTextScale.name}、${settings.widgetTheme.name}。" +
                        if (cues.isEmpty()) "表示対象のCueはありません" else cues.joinToString("、") { cue -> cue.title }
                }, modifier = Modifier.fillMaxSize())
            }) { children, _ ->
                val width = size.width.roundToPx()
                val height = size.height.roundToPx()
                val child = children.single().measure(Constraints.fixed(width, height))
                layout((width * scale).roundToInt(), (height * scale).roundToInt()) {
                    child.placeWithLayer(0, 0) {
                        scaleX = scale
                        scaleY = scale
                        transformOrigin = TransformOrigin(0f, 0f)
                    }
                }
            }
        } else if (error) {
            Box(Modifier.height(size.height * scale)) {
                TextButton(onClick = { attempt++ }) { Text("表示できませんでした・再試行") }
            }
        } else Box(Modifier.height(size.height * scale)) { LinearProgressIndicator(Modifier.fillMaxWidth()) }
    }
    Text("全リストの先頭を表示。枠に収まらない場合は全体を縮小します。操作・絞り込みはホーム画面で行います。",
        style = MaterialTheme.typography.bodySmall)
}
