package app.cuckoocue.widget

import android.content.Context
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
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
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
import app.cuckoocue.data.FocusCue
import app.cuckoocue.data.TaskStatus
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import app.cuckoocue.appearance.AppearanceRepository
import app.cuckoocue.appearance.AppearanceSettings
import app.cuckoocue.appearance.AppThemeMode
import app.cuckoocue.appearance.WidgetTextScale
import app.cuckoocue.appearance.WidgetThemeMode
import kotlinx.coroutines.runBlocking

private val FooterCategoryGap = 6.dp
private const val FooterCategoryMinWidthDp = 44
private const val FooterCategoryMaxWidthDp = 100
private const val EstimatedCategoryGlyphWidthDp = 11
private const val MaxCategoryLabelChars = 10
private const val MaxUndoTitleChars = 12

private val TaskIdKey = ActionParameters.Key<String>("task_id")
private val VersionKey = ActionParameters.Key<Long>("version")
private val CategoryKey = ActionParameters.Key<String>("category_key")
private val CategoryStripOffsetPreferenceKey = intPreferencesKey("category_strip_offset")
private val SelectedCategoryKeyPreferenceKey = stringPreferencesKey("selected_category_key")
private val LastUndoTaskIdPreferenceKey = stringPreferencesKey("last_undo_task_id")
private val LastUndoVersionPreferenceKey = longPreferencesKey("last_undo_version")

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
    val categoryRailSize: androidx.compose.ui.unit.TextUnit,
    val categoryMarkWidth: androidx.compose.ui.unit.Dp,
)

class CuckooCueWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CuckooCueWidget()
}

class CuckooCueWidget : GlanceAppWidget() {
    override val stateDefinition: GlanceStateDefinition<*> = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = CuckooRepository.getInstance(context)
        val appearanceSettings = AppearanceRepository.getInstance(context).getSettings()
        val systemDark = context.resources.configuration.uiMode and
            Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        val widgetDark = appearanceSettings.resolveWidgetDark(systemDark)
        val colors = widgetColors(widgetDark)
        val metrics = widgetMetrics(appearanceSettings.widgetTextScale)

        repository.ensureSeedData()

        provideContent {
            val cues by repository.focusCues.collectAsState(initial = emptyList())
            val categoryStripOffset = currentState(CategoryStripOffsetPreferenceKey) ?: 0
            val selectedCategoryKey = currentState(SelectedCategoryKeyPreferenceKey)
            val lastUndoTaskId = currentState(LastUndoTaskIdPreferenceKey)
            val lastUndoVersion = currentState(LastUndoVersionPreferenceKey)
            val lastUndoCue = cues.firstOrNull {
                it.taskId == lastUndoTaskId &&
                    it.version == lastUndoVersion &&
                    it.status == TaskStatus.Completed
            }
            val pendingCues = cues
                .filter { it.status == TaskStatus.Pending }
                .filter {
                    selectedCategoryKey == null ||
                        it.categoryKey == selectedCategoryKey
                }
                .sortedBy { it.slot }
            CuckooCueWidgetContent(
                cues = pendingCues,
                allCues = cues,
                categoryStripOffset = categoryStripOffset,
                selectedCategoryKey = selectedCategoryKey,
                lastUndoCue = lastUndoCue,
                colors = colors,
                metrics = metrics,
            )
        }
    }
}

object CuckooCueWidgetUpdater {
    fun updateAll(context: Context) {
        runBlocking {
            CuckooCueWidget().updateAll(context)
        }
    }

    fun clearTransientUndoAndUpdateAll(context: Context) {
        runBlocking {
            clearTransientUndo(context)
            CuckooCueWidget().updateAll(context)
        }
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

@Composable
private fun CuckooCueWidgetContent(
    cues: List<FocusCue>,
    allCues: List<FocusCue>,
    categoryStripOffset: Int,
    selectedCategoryKey: String?,
    lastUndoCue: FocusCue?,
    colors: WidgetColors,
    metrics: WidgetMetrics,
) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(colors.surfaceBase)
            .cornerRadius(24.dp)
            .padding(start = 8.dp, top = 8.dp, end = 8.dp, bottom = 10.dp),
    ) {
        if (cues.isEmpty()) {
            EmptyState(
                colors = colors,
                modifier = GlanceModifier.defaultWeight(),
            )
        } else {
            LazyColumn(modifier = GlanceModifier.defaultWeight()) {
                items(cues) { cue ->
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

        Footer(
            categories = allCues.categoryTips(),
            categoryStripOffset = categoryStripOffset,
            selectedCategoryKey = selectedCategoryKey,
            lastUndoCue = lastUndoCue,
            colors = colors,
            metrics = metrics,
            modifier = GlanceModifier
                .fillMaxWidth()
                .height(32.dp),
        )
    }
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
                text = "アプリでFocusを置く",
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
    cue: FocusCue,
    colors: WidgetColors,
    metrics: WidgetMetrics,
    modifier: GlanceModifier = GlanceModifier,
) {
    val action = actionRunCallback<CompleteCueAction>(cue.actionParameters)
    val background = if (cue.slot == 0) colors.highlight else colors.transparent
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
            .background(background)
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
                color = cue.categoryColorKey.categoryColor(colors),
                fontSize = metrics.categoryRailSize,
                fontWeight = FontWeight.Bold,
            ),
        )
    }
}

@Composable
private fun Footer(
    categories: List<WidgetCategoryTip>,
    categoryStripOffset: Int,
    selectedCategoryKey: String?,
    lastUndoCue: FocusCue?,
    colors: WidgetColors,
    metrics: WidgetMetrics,
    modifier: GlanceModifier = GlanceModifier,
) {
    val rotatedCategories = categories.rotateBy(categoryStripOffset)

    Box(
        modifier = modifier
            .padding(top = 4.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .padding(end = 34.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (lastUndoCue != null) {
                UndoChip(cue = lastUndoCue, colors = colors)
                Spacer(GlanceModifier.width(14.dp))
            }
            rotatedCategories.forEach { category ->
                CategoryTip(
                    category = category.tip,
                    selected = selectedCategoryKey == category.tip.key,
                    colors = colors,
                    metrics = metrics,
                )
                if (category.index != rotatedCategories.last().index) {
                    Spacer(GlanceModifier.width(FooterCategoryGap))
                }
            }
        }

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
                    .clickable(actionRunCallback<AdvanceCategoryStripAction>()),
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

private data class IndexedCategoryTip(
    val index: Int,
    val tip: WidgetCategoryTip,
)

private fun List<WidgetCategoryTip>.rotateBy(offset: Int): List<IndexedCategoryTip> {
    if (isEmpty()) return emptyList()
    val normalizedOffset = offset.floorMod(size)
    return indices.map { position ->
        val index = (normalizedOffset + position).floorMod(size)
        IndexedCategoryTip(
            index = index,
            tip = this[index],
        )
    }
}

class AdvanceCategoryStripAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val categoryCount = CuckooRepository.getInstance(context)
            .getFocusCues()
            .categoryTips()
            .size
        if (categoryCount == 0) return
        updateAppWidgetState(context, glanceId) { preferences ->
            val currentOffset = preferences[CategoryStripOffsetPreferenceKey] ?: 0
            preferences[CategoryStripOffsetPreferenceKey] =
                (currentOffset + 1).floorMod(categoryCount)
            preferences.clearTransientUndo()
        }
        CuckooCueWidget().updateAll(context)
    }
}
@Composable
private fun UndoChip(
    cue: FocusCue,
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
private fun CategoryTip(
    category: WidgetCategoryTip,
    selected: Boolean,
    colors: WidgetColors,
    metrics: WidgetMetrics,
    modifier: GlanceModifier = GlanceModifier,
) {
    val label = category.label.truncateForWidget(MaxCategoryLabelChars)
    val tipWidth = (label.length * EstimatedCategoryGlyphWidthDp)
        .coerceIn(FooterCategoryMinWidthDp, FooterCategoryMaxWidthDp)
        .dp

    Box(
        modifier = modifier
            .width(tipWidth)
            .height(15.dp)
            .clickable(
                actionRunCallback<ToggleCategoryFilterAction>(
                    actionParametersOf(CategoryKey to category.key),
                ),
            ),
        contentAlignment = Alignment.BottomStart,
    ) {
        Box(
            modifier = GlanceModifier
                .width(metrics.categoryMarkWidth)
                .height(if (selected) 6.dp else 5.dp)
                .background(category.colorKey.categoryMarkColor()),
        ) {}
        Text(
            text = label,
            maxLines = 1,
            style = TextStyle(
                color = if (selected) category.colorKey.categoryColor(colors) else colors.muted,
                fontSize = 11.sp,
                fontWeight = if (selected) FontWeight.Bold else null,
            ),
        )
    }
}

class CompleteCueAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val taskId = parameters[TaskIdKey] ?: return
        val version = parameters[VersionKey] ?: return
        val completed = CuckooRepository.getInstance(context).completeTask(taskId, version)
        updateAppWidgetState(context, glanceId) { preferences ->
            if (completed) {
                preferences[LastUndoTaskIdPreferenceKey] = taskId
                preferences[LastUndoVersionPreferenceKey] = version + 1
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
        val version = parameters[VersionKey] ?: return
        CuckooRepository.getInstance(context).undoCompleteTask(taskId, version)
        updateAppWidgetState(context, glanceId) { preferences ->
            preferences.clearTransientUndo()
        }
        CuckooCueWidget().updateAll(context)
    }
}

class ToggleCategoryFilterAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val categoryKey = parameters[CategoryKey] ?: return
        updateAppWidgetState(context, glanceId) { preferences ->
            val currentCategoryKey = preferences[SelectedCategoryKeyPreferenceKey]
            if (currentCategoryKey == categoryKey) {
                preferences.remove(SelectedCategoryKeyPreferenceKey)
            } else {
                preferences[SelectedCategoryKeyPreferenceKey] = categoryKey
            }
            preferences.clearTransientUndo()
        }
        CuckooCueWidget().updateAll(context)
    }
}

private val FocusCue.actionParameters: ActionParameters
    get() = actionParametersOf(
        TaskIdKey to taskId,
        VersionKey to version,
    )

private fun Int.floorMod(divisor: Int): Int = ((this % divisor) + divisor) % divisor

private fun String.categoryColor(colors: WidgetColors): ColorProvider =
    when (this) {
        "green" -> colors.green
        "gold" -> colors.gold
        else -> colors.teal
    }

private fun String.categoryMarkColor(): ColorProvider =
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

private fun FocusCue.usesTwoLineTitle(metrics: WidgetMetrics): Boolean =
    title.length > metrics.singleLineTitleChars

private fun FocusCue.rowHeight(metrics: WidgetMetrics): androidx.compose.ui.unit.Dp =
    if (usesTwoLineTitle(metrics)) metrics.twoLineRowHeight else metrics.singleLineRowHeight

private fun String.truncateForWidget(maxChars: Int): String =
    if (length <= maxChars) this else take(maxChars).trimEnd() + "..."

private fun MutablePreferences.clearTransientUndo() {
    remove(LastUndoTaskIdPreferenceKey)
    remove(LastUndoVersionPreferenceKey)
}

private fun List<FocusCue>.categoryTips(): List<WidgetCategoryTip> =
    sortedBy { it.slot }
        .distinctBy { it.categoryKey }
        .map { cue ->
            WidgetCategoryTip(
                key = cue.categoryKey,
                label = cue.categoryLabel,
                colorKey = cue.categoryColorKey,
            )
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
            priorityHigh = ColorProvider(Color(0xFF5DB1A8)),
            priorityMedium = ColorProvider(Color(0xCC7FA36B)),
            priorityLow = ColorProvider(Color(0x669DAAA6)),
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
            priorityHigh = ColorProvider(Color(0xFF4F8E87)),
            priorityMedium = ColorProvider(Color(0xCC6F8F5B)),
            priorityLow = ColorProvider(Color(0x80647174)),
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
            categoryRailSize = 17.sp,
            categoryMarkWidth = 10.dp,
        )
        WidgetTextScale.Standard -> WidgetMetrics(
            singleLineRowHeight = 30.dp,
            twoLineRowHeight = 42.dp,
            titleSize = 12.sp,
            singleLineTitleChars = 16,
            maxTaskTitleChars = 34,
            prioritySizes = listOf(15.sp, 10.sp, 6.sp),
            categoryRailSize = 18.sp,
            categoryMarkWidth = 11.dp,
        )
        WidgetTextScale.Large -> WidgetMetrics(
            singleLineRowHeight = 34.dp,
            twoLineRowHeight = 46.dp,
            titleSize = 13.sp,
            singleLineTitleChars = 14,
            maxTaskTitleChars = 30,
            prioritySizes = listOf(16.sp, 11.sp, 7.sp),
            categoryRailSize = 20.sp,
            categoryMarkWidth = 12.dp,
        )
    }

private data class WidgetCategoryTip(
    val key: String,
    val label: String,
    val colorKey: String,
)
