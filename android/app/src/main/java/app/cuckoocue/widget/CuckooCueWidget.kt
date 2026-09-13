package app.cuckoocue.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import app.cuckoocue.MainActivity
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.semantics.semantics
import androidx.glance.semantics.contentDescription
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.glance.state.GlanceStateDefinition
import androidx.glance.state.PreferencesGlanceStateDefinition
import app.cuckoocue.data.CuckooRepository
import app.cuckoocue.data.WidgetCue
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import app.cuckoocue.appearance.AppearanceRepository
import app.cuckoocue.appearance.AppearanceSettings
import app.cuckoocue.appearance.AppThemeMode
import app.cuckoocue.appearance.WidgetTextScale
import app.cuckoocue.appearance.WidgetThemeMode

private val FooterTipGap = 6.dp
private const val FooterVisibleTipCount = 3
private const val FooterTipMinWidthDp = 58
private const val FooterTipMaxWidthDp = 116
private const val EstimatedFooterTipGlyphWidthDp = 10
private const val MaxFooterTipLabelChars = 8
private const val MaxUndoTitleChars = 12

private val TaskIdKey = ActionParameters.Key<String>("task_id")
private val TaskTitleKey = ActionParameters.Key<String>("task_title")
private val FooterTipKey = ActionParameters.Key<String>("footer_tip_key")
private val FooterTipStripOffsetPreferenceKey = intPreferencesKey("footer_tip_strip_offset")
private val SelectedFooterTipKeyPreferenceKey = stringPreferencesKey("selected_footer_tip_key")
private val LastUndoTaskIdPreferenceKey = stringPreferencesKey("last_undo_task_id")
private val LastUndoTitlePreferenceKey = stringPreferencesKey("last_undo_title")

private val Ink = ColorProvider(Color(0xFF172126))
private val Muted = ColorProvider(Color(0xFF647174))
private val SurfaceBase = ColorProvider(Color(0xFFF7F8F4))
private val Highlight = ColorProvider(Color(0xFFEAF4EF))
private val Transparent = ColorProvider(Color(0x00000000))
private val Teal = ColorProvider(Color(0xFF4F8E87))
private val Green = ColorProvider(Color(0xFF6F8F5B))
private val Gold = ColorProvider(Color(0xFFC9933F))
private val TealMark = ColorProvider(Color(0xCC4F8E87))
private val GreenMark = ColorProvider(Color(0xCC6F8F5B))
private val GoldMark = ColorProvider(Color(0xCCC9933F))

private data class WidgetColors(
    val ink: ColorProvider,
    val muted: ColorProvider,
    val surfaceBase: ColorProvider,
    val highlight: ColorProvider,
    val transparent: ColorProvider,
    val teal: ColorProvider,
    val green: ColorProvider,
    val gold: ColorProvider,
    val priorityHigh: ColorProvider,
    val priorityMedium: ColorProvider,
    val priorityLow: ColorProvider,
)

private data class WidgetMetrics(
    val singleLineRowHeight: androidx.compose.ui.unit.Dp,
    val twoLineRowHeight: androidx.compose.ui.unit.Dp,
    val titleSize: androidx.compose.ui.unit.TextUnit,
    val singleLineTitleChars: Int,
    val maxTaskTitleChars: Int,
    val prioritySizes: List<androidx.compose.ui.unit.TextUnit>,
    val contextRailSize: androidx.compose.ui.unit.TextUnit,
    val footerMarkWidth: androidx.compose.ui.unit.Dp,
)

private data class UndoCueUi(
    val taskId: String,
    val title: String,
)

class CuckooCueWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CuckooCueWidget()
}

class CuckooCueWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override val stateDefinition: GlanceStateDefinition<*> = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = CuckooRepository.getInstance(context)
        val appearanceRepository = AppearanceRepository.getInstance(context)
        val initialAppearance = appearanceRepository.getSettings()
        val systemDark = context.resources.configuration.uiMode and
            Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        provideContent {
            val appearanceSettings by appearanceRepository.settings.collectAsState(initial = initialAppearance)
            val colors = widgetColors(appearanceSettings.resolveWidgetDark(systemDark))
            val metrics = widgetMetrics(appearanceSettings.widgetTextScale)
            val cues by repository.widgetCues.collectAsState(initial = emptyList())
            val footerTipStripOffset = currentState(FooterTipStripOffsetPreferenceKey) ?: 0
            val selectedFooterTipKey = currentState(SelectedFooterTipKeyPreferenceKey)
            val activeFooterTipKey = selectedFooterTipKey
                ?.takeIf { selectedRunId -> cues.any { it.runId == selectedRunId } }
            val lastUndoTaskId = currentState(LastUndoTaskIdPreferenceKey)
            val lastUndoTitle = currentState(LastUndoTitlePreferenceKey)
            val lastUndoCue = if (
                lastUndoTaskId != null &&
                lastUndoTitle != null
            ) {
                UndoCueUi(
                    taskId = lastUndoTaskId,
                    title = lastUndoTitle,
                )
            } else {
                null
            }
            val pendingCues = cues
                .filter {
                    activeFooterTipKey == null ||
                        it.runId == activeFooterTipKey
                }
            CuckooCueWidgetContent(
                cues = pendingCues,
                allCues = cues,
                footerTipStripOffset = footerTipStripOffset,
                selectedFooterTipKey = activeFooterTipKey,
                lastUndoCue = lastUndoCue,
                colors = colors,
                metrics = metrics,
            )
        }
    }
}

object CuckooCueWidgetUpdater {
    suspend fun updateAll(context: Context) {
        CuckooCueWidget().updateAll(context)
    }

    suspend fun clearTransientUndoAndUpdateAll(context: Context) {
        clearTransientUndo(context)
        CuckooCueWidget().updateAll(context)
    }

    private suspend fun clearTransientUndo(context: Context) {
        GlanceAppWidgetManager(context)
            .getGlanceIds(CuckooCueWidget::class.java)
            .forEach { glanceId ->
                updateAppWidgetState(context, glanceId) { preferences ->
                    preferences.clearTransientUndo()
                }
            }
    }
}

/** The settings preview uses the production renderer and aggregate Cue projection. */
@Composable
internal fun WidgetSettingsPreviewContent(cues: List<WidgetCue>, settings: AppearanceSettings, systemDark: Boolean) {
    CuckooCueWidgetContent(cues, cues, 0, null, null,
        widgetColors(settings.resolveWidgetDark(systemDark)), widgetMetrics(settings.widgetTextScale))
}

@Composable
private fun CuckooCueWidgetContent(
    cues: List<WidgetCue>,
    allCues: List<WidgetCue>,
    footerTipStripOffset: Int,
    selectedFooterTipKey: String?,
    lastUndoCue: UndoCueUi?,
    colors: WidgetColors,
    metrics: WidgetMetrics,
) {
    val context = LocalContext.current
    val selectedRun = allCues.firstOrNull { it.runId == selectedFooterTipKey }
    val contentHeight = cues.fold(if (selectedRun != null) 48.dp else 0.dp) { height, cue ->
        height + cue.rowHeight(metrics)
    }
    val listHeight = contentHeight.coerceAtMost((LocalSize.current.height - 50.dp).coerceAtLeast(1.dp))
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(colors.surfaceBase)
            .cornerRadius(24.dp)
            .clickable(actionStartActivity(widgetOpenIntent(context)))
            .padding(start = 8.dp, top = 8.dp, end = 8.dp, bottom = 10.dp),
    ) {
        // Keep static controls before collection descendants in the RemoteViews tree.
        // This prevents reapply from resolving a footer view ID inside a recycled list row.
        Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.BottomStart) {
            Footer(
                footerTips = allCues.footerTips(),
                footerTipStripOffset = footerTipStripOffset,
                selectedFooterTipKey = selectedFooterTipKey,
                lastUndoCue = lastUndoCue,
                colors = colors,
                metrics = metrics,
                modifier = GlanceModifier.fillMaxWidth().height(32.dp),
            )
        }
        Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.TopStart) {
            if (cues.isEmpty()) {
                EmptyState(
                    colors = colors,
                    modifier = GlanceModifier.height((LocalSize.current.height - 50.dp).coerceAtLeast(1.dp)),
                )
            } else {
                LazyColumn(modifier = GlanceModifier.fillMaxWidth().height(listHeight)) {
                    if (selectedRun != null) {
                        item(itemId = Long.MAX_VALUE) {
                            Box(
                                modifier = GlanceModifier.fillMaxWidth().height(48.dp)
                                    .semantics { contentDescription = "${selectedRun.runTitle}をアプリで開く" }
                                    .clickable(actionStartActivity(widgetOpenIntent(context, selectedRun.runId)))
                                    .padding(horizontal = 8.dp),
                                contentAlignment = Alignment.CenterStart,
                            ) {
                                Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Text(selectedRun.runTitle, modifier = GlanceModifier.defaultWeight(), maxLines = 1,
                                        style = TextStyle(color = colors.teal, fontSize = 13.sp, fontWeight = FontWeight.Bold))
                                    Text("↗", style = TextStyle(color = colors.teal, fontSize = 18.sp))
                                }
                            }
                        }
                    }
                    items(cues, itemId = { it.taskId.hashCode().toLong() and 0xffffffffL }) { cue ->
                        CueRow(
                            cue = cue,
                            colors = colors,
                            metrics = metrics,
                            modifier = GlanceModifier
                                .fillMaxWidth()
                                .height(cue.rowHeight(metrics)),
                        )
                    }
                }
            }
        }
    }
}

private fun widgetOpenIntent(context: Context, runId: String? = null): Intent =
    Intent(context, MainActivity::class.java).apply {
        action = "app.cuckoocue.OPEN_WIDGET"
        data = Uri.Builder().scheme("cuckoocue").authority("local")
            .appendPath(runId ?: "top").build()
        putExtra("widget_run_id", runId)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

@Composable
private fun EmptyState(
    colors: WidgetColors,
    modifier: GlanceModifier = GlanceModifier,
) {
    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "Cuckoo Cue",
                style = TextStyle(
                    color = colors.ink,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                ),
            )
            Text(
                text = "アプリで項目を作る",
                style = TextStyle(
                    color = colors.muted,
                    fontSize = 12.sp,
                ),
            )
        }
    }
}

@Composable
private fun CueRow(
    cue: WidgetCue,
    colors: WidgetColors,
    metrics: WidgetMetrics,
    modifier: GlanceModifier = GlanceModifier,
) {
    val action = actionRunCallback<CompleteCueAction>(cue.actionParameters)
    val usesTwoLines = cue.usesTwoLineTitle(metrics)
    val titleMaxChars = if (usesTwoLines) {
        metrics.maxTaskTitleChars
    } else {
        metrics.singleLineTitleChars
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 1.dp)
            .background(colors.transparent)
            .cornerRadius(10.dp)
            .clickable(action)
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "□",
            style = TextStyle(
                color = colors.muted,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            ),
        )
        Spacer(GlanceModifier.width(7.dp))
        Text(
            text = "●",
            style = TextStyle(
                color = cue.priority.priorityColor(colors),
                fontSize = cue.priority.prioritySize(metrics),
                fontWeight = FontWeight.Bold,
            ),
        )
        Spacer(GlanceModifier.width(8.dp))
        Text(
            text = cue.title.truncateForWidget(titleMaxChars),
            maxLines = if (usesTwoLines) 2 else 1,
            style = TextStyle(
                color = colors.ink,
                fontSize = metrics.titleSize,
                fontWeight = FontWeight.Bold,
            ),
            modifier = GlanceModifier.defaultWeight(),
        )
        Spacer(GlanceModifier.width(8.dp))
        Text(
            text = "┃",
            style = TextStyle(
                color = cue.groupColorKey().cueGroupColor(colors),
                fontSize = metrics.contextRailSize,
                fontWeight = FontWeight.Bold,
            ),
        )
    }
}

@Composable
private fun Footer(
    footerTips: List<WidgetFooterTip>,
    footerTipStripOffset: Int,
    selectedFooterTipKey: String?,
    lastUndoCue: UndoCueUi?,
    colors: WidgetColors,
    metrics: WidgetMetrics,
    modifier: GlanceModifier = GlanceModifier,
) {
    val rotatedFooterTips = footerTips.rotateBy(footerTipStripOffset)
    val visibleFooterTips = rotatedFooterTips.take(FooterVisibleTipCount)
    val showAdvance = footerTips.size > visibleFooterTips.size

    Box(
        modifier = modifier
            .padding(top = 3.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .padding(end = if (showAdvance) 34.dp else 0.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (lastUndoCue != null) {
                UndoChip(cue = lastUndoCue, colors = colors)
                Spacer(GlanceModifier.width(14.dp))
            }
            visibleFooterTips.forEach { footerTip ->
                FooterTip(
                    footerTip = footerTip.tip,
                    selected = selectedFooterTipKey == footerTip.tip.key,
                    colors = colors,
                    metrics = metrics,
                )
                if (footerTip.index != visibleFooterTips.last().index) {
                    Spacer(GlanceModifier.width(FooterTipGap))
                }
            }
        }

        if (showAdvance) {
            Box(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .height(30.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Box(
                    modifier = GlanceModifier
                        .width(32.dp)
                        .height(30.dp)
                        .background(colors.surfaceBase)
                        .clickable(actionRunCallback<AdvanceFooterTipStripAction>()),
                    contentAlignment = Alignment.CenterEnd,
                ) {
                    Text(
                        text = "›",
                        style = TextStyle(
                            color = colors.ink,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                    )
                }
            }
        }
    }
}

private data class IndexedFooterTip(
    val index: Int,
    val tip: WidgetFooterTip,
)

private fun List<WidgetFooterTip>.rotateBy(offset: Int): List<IndexedFooterTip> {
    if (isEmpty()) return emptyList()
    val normalizedOffset = offset.floorMod(size)
    return indices.map { position ->
        val index = (normalizedOffset + position).floorMod(size)
        IndexedFooterTip(
            index = index,
            tip = this[index],
        )
    }
}

class AdvanceFooterTipStripAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val footerTipCount = CuckooRepository.getInstance(context)
            .getWidgetCues()
            .footerTips()
            .size
        if (footerTipCount == 0) return
        updateAppWidgetState(context, glanceId) { preferences ->
            val currentFooterTipOffset = preferences[FooterTipStripOffsetPreferenceKey] ?: 0
            preferences[FooterTipStripOffsetPreferenceKey] =
                (currentFooterTipOffset + 1).floorMod(footerTipCount)
            preferences.clearTransientUndo()
        }
        CuckooCueWidget().updateAll(context)
    }
}
@Composable
private fun UndoChip(
    cue: UndoCueUi,
    colors: WidgetColors,
    modifier: GlanceModifier = GlanceModifier,
) {
    Row(
        modifier = modifier
            .clickable(actionRunCallback<UndoCueAction>(cue.actionParameters))
            .padding(top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "↶",
            style = TextStyle(
                color = colors.teal,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            ),
        )
        Spacer(GlanceModifier.width(10.dp))
        Text(
            text = "戻す",
            style = TextStyle(
                color = colors.teal,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
            ),
        )
        Spacer(GlanceModifier.width(8.dp))
        Text(
            text = cue.title.truncateForWidget(MaxUndoTitleChars),
            maxLines = 1,
            style = TextStyle(
                color = colors.muted,
                fontSize = 11.sp,
            ),
            modifier = GlanceModifier.defaultWeight(),
        )
    }
}

@Composable
private fun FooterTip(
    footerTip: WidgetFooterTip,
    selected: Boolean,
    colors: WidgetColors,
    metrics: WidgetMetrics,
    modifier: GlanceModifier = GlanceModifier,
) {
    val label = footerTip.label.truncateForWidget(MaxFooterTipLabelChars)
    val tipWidth = (label.length * EstimatedFooterTipGlyphWidthDp)
        .coerceIn(FooterTipMinWidthDp, FooterTipMaxWidthDp)
        .dp

    Box(
        modifier = modifier
            .width(tipWidth)
            .height(20.dp)
            .clickable(
                actionRunCallback<ToggleFooterTipFilterAction>(
                    actionParametersOf(FooterTipKey to footerTip.key),
                ),
            ),
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            modifier = GlanceModifier
                .width(metrics.footerMarkWidth)
                .height(if (selected) 7.dp else 5.dp)
                .background(footerTip.colorKey.cueGroupMarkColor()),
        ) {}
        Text(
            text = label,
            maxLines = 1,
            style = TextStyle(
                color = if (selected) footerTip.colorKey.cueGroupColor(colors) else colors.muted,
                fontSize = 11.sp,
                fontWeight = if (selected) FontWeight.Bold else null,
            ),
        )
    }
}

class CompleteCueAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val taskId = parameters[TaskIdKey] ?: return
        val title = parameters[TaskTitleKey] ?: ""
        val result = CuckooRepository.getInstance(context).completeTask(taskId)
        updateAppWidgetState(context, glanceId) { preferences ->
            if (result.completed) {
                preferences[LastUndoTaskIdPreferenceKey] = taskId
                preferences[LastUndoTitlePreferenceKey] = title
            } else {
                preferences.clearTransientUndo()
            }
        }
        CuckooCueWidget().updateAll(context)
    }
}

class UndoCueAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val taskId = parameters[TaskIdKey] ?: return
        CuckooRepository.getInstance(context).undoCompleteTask(taskId)
        updateAppWidgetState(context, glanceId) { preferences ->
            preferences.clearTransientUndo()
        }
        CuckooCueWidget().updateAll(context)
    }
}

class ToggleFooterTipFilterAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val footerTipKey = parameters[FooterTipKey] ?: return
        updateAppWidgetState(context, glanceId) { preferences ->
            val currentFooterTipKey = preferences[SelectedFooterTipKeyPreferenceKey]
            if (currentFooterTipKey == footerTipKey) {
                preferences.remove(SelectedFooterTipKeyPreferenceKey)
            } else {
                preferences[SelectedFooterTipKeyPreferenceKey] = footerTipKey
            }
            preferences.clearTransientUndo()
        }
        CuckooCueWidget().updateAll(context)
    }
}

private val WidgetCue.actionParameters: ActionParameters
    get() = actionParametersOf(
        TaskIdKey to taskId,
        TaskTitleKey to title,
    )

private val UndoCueUi.actionParameters: ActionParameters
    get() = actionParametersOf(TaskIdKey to taskId)

private fun Int.floorMod(divisor: Int): Int = ((this % divisor) + divisor) % divisor

private fun String.cueGroupColor(colors: WidgetColors): ColorProvider =
    when (this) {
        "green" -> colors.green
        "gold" -> colors.gold
        else -> colors.teal
    }

private fun String.cueGroupMarkColor(): ColorProvider =
    when (this) {
        "green" -> GreenMark
        "gold" -> GoldMark
        else -> TealMark
    }

private fun Int.priorityColor(colors: WidgetColors): ColorProvider =
    when (this) {
        0 -> colors.priorityHigh
        1 -> colors.priorityMedium
        else -> colors.priorityLow
    }

private fun Int.prioritySize(metrics: WidgetMetrics): androidx.compose.ui.unit.TextUnit =
    metrics.prioritySizes.getOrElse(this) { metrics.prioritySizes.last() }

private fun WidgetCue.usesTwoLineTitle(metrics: WidgetMetrics): Boolean =
    title.length > metrics.singleLineTitleChars

private fun WidgetCue.rowHeight(metrics: WidgetMetrics): androidx.compose.ui.unit.Dp =
    if (usesTwoLineTitle(metrics)) metrics.twoLineRowHeight else metrics.singleLineRowHeight

private fun String.truncateForWidget(maxChars: Int): String =
    if (length <= maxChars) this else take(maxChars).trimEnd() + "..."

private fun MutablePreferences.clearTransientUndo() {
    remove(LastUndoTaskIdPreferenceKey)
    remove(LastUndoTitlePreferenceKey)
}

private fun List<WidgetCue>.footerTips(): List<WidgetFooterTip> =
    distinctBy { cue -> cue.runId }
        .map { cue ->
            WidgetFooterTip(
                key = cue.runId,
                label = cue.runTitle,
                colorKey = cue.groupColorKey(),
            )
        }

private fun WidgetCue.groupColorKey(): String =
    when (runId.fold(0) { acc, char -> acc + char.code }.floorMod(3)) {
        1 -> "green"
        2 -> "gold"
        else -> "teal"
    }

private fun AppearanceSettings.resolveWidgetDark(systemDark: Boolean): Boolean =
    when (widgetTheme) {
        WidgetThemeMode.FollowApp -> appTheme.resolve(systemDark)
        WidgetThemeMode.Light -> false
        WidgetThemeMode.Dark -> true
    }

private fun AppThemeMode.resolve(systemDark: Boolean): Boolean =
    when (this) {
        AppThemeMode.System -> systemDark
        AppThemeMode.Light -> false
        AppThemeMode.Dark -> true
    }

private fun widgetColors(dark: Boolean): WidgetColors =
    if (dark) {
        WidgetColors(
            ink = ColorProvider(Color(0xFFEAF1EE)),
            muted = ColorProvider(Color(0xFF9DAAA6)),
            surfaceBase = ColorProvider(Color(0xFF101716)),
            highlight = ColorProvider(Color(0xFF20332F)),
            transparent = Transparent,
            teal = Teal,
            green = Green,
            gold = Gold,
            priorityHigh = ColorProvider(Color(0x99A3B5B0)),
            priorityMedium = ColorProvider(Color(0x66A3B5B0)),
            priorityLow = ColorProvider(Color(0x40A3B5B0)),
        )
    } else {
        WidgetColors(
            ink = Ink,
            muted = Muted,
            surfaceBase = SurfaceBase,
            highlight = Highlight,
            transparent = Transparent,
            teal = Teal,
            green = Green,
            gold = Gold,
            priorityHigh = ColorProvider(Color(0x99566D69)),
            priorityMedium = ColorProvider(Color(0x66566D69)),
            priorityLow = ColorProvider(Color(0x33566D69)),
        )
    }

private fun widgetMetrics(scale: WidgetTextScale): WidgetMetrics =
    when (scale) {
        WidgetTextScale.Compact -> WidgetMetrics(
            singleLineRowHeight = 28.dp,
            twoLineRowHeight = 40.dp,
            titleSize = 11.sp,
            singleLineTitleChars = 18,
            maxTaskTitleChars = 38,
            prioritySizes = listOf(14.sp, 10.sp, 6.sp),
            contextRailSize = 17.sp,
            footerMarkWidth = 10.dp,
        )
        WidgetTextScale.Standard -> WidgetMetrics(
            singleLineRowHeight = 30.dp,
            twoLineRowHeight = 42.dp,
            titleSize = 12.sp,
            singleLineTitleChars = 16,
            maxTaskTitleChars = 34,
            prioritySizes = listOf(15.sp, 10.sp, 6.sp),
            contextRailSize = 18.sp,
            footerMarkWidth = 11.dp,
        )
        WidgetTextScale.Large -> WidgetMetrics(
            singleLineRowHeight = 34.dp,
            twoLineRowHeight = 46.dp,
            titleSize = 13.sp,
            singleLineTitleChars = 14,
            maxTaskTitleChars = 30,
            prioritySizes = listOf(16.sp, 11.sp, 7.sp),
            contextRailSize = 20.sp,
            footerMarkWidth = 12.dp,
        )
    }

private data class WidgetFooterTip(
    val key: String,
    val label: String,
    val colorKey: String,
)
