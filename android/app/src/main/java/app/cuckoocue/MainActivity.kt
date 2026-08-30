package app.cuckoocue

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.cuckoocue.appearance.AppearanceRepository
import app.cuckoocue.appearance.AppearanceSettings
import app.cuckoocue.appearance.AppThemeMode
import app.cuckoocue.appearance.WidgetTextScale
import app.cuckoocue.appearance.WidgetThemeMode
import app.cuckoocue.data.CuckooRepository
import app.cuckoocue.data.FocusCue
import app.cuckoocue.data.RunTaskEntity
import app.cuckoocue.data.TaskStatus
import app.cuckoocue.widget.CuckooCueWidgetUpdater
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch

private val Ink = Color(0xFF172126)
private val Muted = Color(0xFF647174)
private val SurfaceBase = Color(0xFFF7F8F4)
private val Panel = Color.White
private val Line = Color(0xFFD8DFDC)
private val Teal = Color(0xFF4F8E87)
private val Green = Color(0xFF6F8F5B)
private val Gold = Color(0xFFC9933F)

private data class CuckooColors(
    val ink: Color,
    val muted: Color,
    val surfaceBase: Color,
    val panel: Color,
    val focusPanel: Color,
    val line: Color,
    val highlight: Color,
    val teal: Color,
    val green: Color,
    val gold: Color,
)

private val LocalCuckooColors = staticCompositionLocalOf { cuckooColors(dark = false) }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as CuckooCueApp
        val repository = app.repository
        val appearanceRepository = app.appearanceRepository

        setContent {
            val settings by appearanceRepository.settings.collectAsStateWithLifecycle(
                initialValue = AppearanceSettings(),
            )
            val systemDark = isSystemInDarkTheme()
            val dark = settings.appTheme.resolve(systemDark)
            val colors = cuckooColors(dark)

            CompositionLocalProvider(LocalCuckooColors provides colors) {
                MaterialTheme(colorScheme = cuckooColorScheme(colors, dark)) {
                    CuckooCueScreen(
                        repository = repository,
                        appearanceRepository = appearanceRepository,
                        appearanceSettings = settings,
                    )
                }
            }
        }
    }
}

private fun cuckooColors(dark: Boolean): CuckooColors =
    if (dark) {
        CuckooColors(
            ink = Color(0xFFEAF1EE),
            muted = Color(0xFF9DAAA6),
            surfaceBase = Color(0xFF101716),
            panel = Color(0xFF17211F),
            focusPanel = Color(0xFF1C2926),
            line = Color(0xFF33413D),
            highlight = Color(0xFF20332F),
            teal = Teal,
            green = Green,
            gold = Gold,
        )
    } else {
        CuckooColors(
            ink = Ink,
            muted = Muted,
            surfaceBase = SurfaceBase,
            panel = Panel,
            focusPanel = Color(0xFFE9EFE8),
            line = Line,
            highlight = Color(0xFFEAF4EF),
            teal = Teal,
            green = Green,
            gold = Gold,
        )
    }

private fun cuckooColorScheme(colors: CuckooColors, dark: Boolean): ColorScheme {
    val base = if (dark) {
        androidx.compose.material3.darkColorScheme()
    } else {
        androidx.compose.material3.lightColorScheme()
    }
    return base.copy(
        primary = colors.teal,
        onPrimary = Color.White,
        secondary = colors.green,
        onSecondary = Color.White,
        tertiary = colors.gold,
        background = colors.surfaceBase,
        onBackground = colors.ink,
        surface = colors.panel,
        onSurface = colors.ink,
        surfaceVariant = colors.focusPanel,
        onSurfaceVariant = colors.muted,
        outline = colors.line,
    )
}

private fun AppThemeMode.resolve(systemDark: Boolean): Boolean =
    when (this) {
        AppThemeMode.System -> systemDark
        AppThemeMode.Light -> false
        AppThemeMode.Dark -> true
    }

@Composable
private fun CuckooCueScreen(
    repository: CuckooRepository,
    appearanceRepository: AppearanceRepository,
    appearanceSettings: AppearanceSettings,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(repository) {
        repository.ensureSeedData()
        CuckooCueWidgetUpdater.clearTransientUndoAndUpdateAll(context)
    }

    val run by repository.firstRun.collectAsStateWithLifecycle(initialValue = null)
    val tasksFlow = remember(run?.id) {
        run?.id?.let(repository::observeTasks) ?: flowOf(emptyList())
    }
    val tasks by tasksFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val focusCues by repository.focusCues.collectAsStateWithLifecycle(initialValue = emptyList())

    CuckooCueContent(
        runTitle = run?.title ?: "手元に置くこと",
        tasks = tasks,
        focusCues = focusCues,
        appearanceSettings = appearanceSettings,
        onAppThemeChange = { mode ->
            scope.launch {
                appearanceRepository.setAppTheme(mode)
                CuckooCueWidgetUpdater.updateAll(context)
            }
        },
        onWidgetThemeChange = { mode ->
            scope.launch {
                appearanceRepository.setWidgetTheme(mode)
                CuckooCueWidgetUpdater.updateAll(context)
            }
        },
        onWidgetTextScaleChange = { scale ->
            scope.launch {
                appearanceRepository.setWidgetTextScale(scale)
                CuckooCueWidgetUpdater.updateAll(context)
            }
        },
        onAddTask = { title ->
            val runId = run?.id ?: return@CuckooCueContent
            scope.launch {
                repository.addTask(runId, title)
                CuckooCueWidgetUpdater.clearTransientUndoAndUpdateAll(context)
            }
        },
        onSetFocus = { taskId, slot ->
            scope.launch {
                repository.setFocus(taskId, slot)
                CuckooCueWidgetUpdater.clearTransientUndoAndUpdateAll(context)
            }
        },
        onComplete = { taskId, version ->
            scope.launch {
                repository.completeTask(taskId, version)
                CuckooCueWidgetUpdater.clearTransientUndoAndUpdateAll(context)
            }
        },
        onUndo = { taskId, version ->
            scope.launch {
                repository.undoCompleteTask(taskId, version)
                CuckooCueWidgetUpdater.clearTransientUndoAndUpdateAll(context)
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CuckooCueContent(
    runTitle: String,
    tasks: List<RunTaskEntity>,
    focusCues: List<FocusCue>,
    appearanceSettings: AppearanceSettings,
    onAppThemeChange: (AppThemeMode) -> Unit,
    onWidgetThemeChange: (WidgetThemeMode) -> Unit,
    onWidgetTextScaleChange: (WidgetTextScale) -> Unit,
    onAddTask: (String) -> Unit,
    onSetFocus: (taskId: String, slot: Int) -> Unit,
    onComplete: (taskId: String, version: Long) -> Unit,
    onUndo: (taskId: String, version: Long) -> Unit,
) {
    val colors = LocalCuckooColors.current
    var newTaskTitle by remember { mutableStateOf("") }
    val nextFocusSlot = (focusCues.maxOfOrNull { it.slot } ?: -1) + 1

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Cuckoo Cue", fontSize = 12.sp, color = colors.teal, fontWeight = FontWeight.Bold)
                        Text(runTitle, color = colors.ink, fontWeight = FontWeight.Bold)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = colors.surfaceBase),
            )
        },
        containerColor = colors.surfaceBase,
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item {
                AppearanceSettingsPanel(
                    settings = appearanceSettings,
                    onAppThemeChange = onAppThemeChange,
                    onWidgetThemeChange = onWidgetThemeChange,
                    onWidgetTextScaleChange = onWidgetTextScaleChange,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }

            item {
                FocusPreview(
                    cues = focusCues,
                    onComplete = onComplete,
                    onUndo = onUndo,
                )
            }

            item {
                AddTaskRow(
                    value = newTaskTitle,
                    onValueChange = { newTaskTitle = it },
                    onAdd = {
                        onAddTask(newTaskTitle)
                        newTaskTitle = ""
                    },
                )
            }

            items(tasks, key = { it.id }) { task ->
                TaskRow(
                    task = task,
                    focusSlot = focusCues.firstOrNull { it.taskId == task.id }?.slot,
                    nextFocusSlot = nextFocusSlot,
                    onSetFocus = { slot -> onSetFocus(task.id, slot) },
                    onComplete = { onComplete(task.id, task.version) },
                    onUndo = { onUndo(task.id, task.version) },
                )
            }

            item {
                Spacer(Modifier.height(20.dp))
            }
        }
    }
}

@Composable
private fun AppearanceSettingsPanel(
    settings: AppearanceSettings,
    onAppThemeChange: (AppThemeMode) -> Unit,
    onWidgetThemeChange: (WidgetThemeMode) -> Unit,
    onWidgetTextScaleChange: (WidgetTextScale) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalCuckooColors.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = colors.panel,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .border(1.dp, colors.line, RoundedCornerShape(8.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("表示", color = colors.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            ChoiceRow(
                label = "本体",
                options = listOf(
                    "System" to AppThemeMode.System,
                    "Light" to AppThemeMode.Light,
                    "Dark" to AppThemeMode.Dark,
                ),
                selected = settings.appTheme,
                onSelect = onAppThemeChange,
            )
            ChoiceRow(
                label = "Widget",
                options = listOf(
                    "Follow" to WidgetThemeMode.FollowApp,
                    "Light" to WidgetThemeMode.Light,
                    "Dark" to WidgetThemeMode.Dark,
                ),
                selected = settings.widgetTheme,
                onSelect = onWidgetThemeChange,
            )
            ChoiceRow(
                label = "Widget text",
                options = listOf(
                    "Compact" to WidgetTextScale.Compact,
                    "Standard" to WidgetTextScale.Standard,
                    "Large" to WidgetTextScale.Large,
                ),
                selected = settings.widgetTextScale,
                onSelect = onWidgetTextScaleChange,
            )
        }
    }
}

@Composable
private fun <T> ChoiceRow(
    label: String,
    options: List<Pair<String, T>>,
    selected: T,
    onSelect: (T) -> Unit,
) {
    val colors = LocalCuckooColors.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = colors.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (text, value) ->
                val isSelected = value == selected
                OutlinedButton(
                    onClick = { onSelect(value) },
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = if (isSelected) colors.highlight else Color.Transparent,
                        contentColor = if (isSelected) colors.teal else colors.muted,
                    ),
                ) {
                    Text(text, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun FocusPreview(
    cues: List<FocusCue>,
    onComplete: (taskId: String, version: Long) -> Unit,
    onUndo: (taskId: String, version: Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalCuckooColors.current
    Column(modifier = modifier.fillMaxWidth()) {
        Text("Widget focus", color = colors.muted, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(26.dp),
            color = colors.focusPanel,
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                if (cues.isEmpty()) {
                    Text("Focus slot is empty", color = colors.muted, modifier = Modifier.padding(12.dp))
                } else {
                    cues.sortedBy { it.slot }.forEach { cue ->
                        FocusCueRow(
                            cue = cue,
                            onComplete = { onComplete(cue.taskId, cue.version) },
                            onUndo = { onUndo(cue.taskId, cue.version) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FocusCueRow(
    cue: FocusCue,
    onComplete: () -> Unit,
    onUndo: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    val isCompleted = cue.status == TaskStatus.Completed
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(15.dp))
            .background(if (cue.slot == 0 && !isCompleted) colors.highlight else Color.Transparent)
            .padding(horizontal = 8.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        MemoryThread(slot = cue.slot)
        Text(
            text = cue.title,
            modifier = Modifier.weight(1f),
            color = if (isCompleted) colors.muted else colors.ink,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textDecoration = if (isCompleted) TextDecoration.LineThrough else TextDecoration.None,
        )
        TextButton(onClick = if (isCompleted) onUndo else onComplete) {
            Text(if (isCompleted) "戻す" else "完了")
        }
    }
}

@Composable
private fun AddTaskRow(
    value: String,
    onValueChange: (String) -> Unit,
    onAdd: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            label = { Text("一行メモ") },
            singleLine = true,
        )
        Button(
            onClick = onAdd,
            enabled = value.isNotBlank(),
            colors = ButtonDefaults.buttonColors(containerColor = colors.teal),
        ) {
            Text("追加")
        }
    }
}

@Composable
private fun TaskRow(
    task: RunTaskEntity,
    focusSlot: Int?,
    nextFocusSlot: Int,
    onSetFocus: (Int) -> Unit,
    onComplete: () -> Unit,
    onUndo: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    val isCompleted = task.status == TaskStatus.Completed
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = colors.panel,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .border(1.dp, colors.line, RoundedCornerShape(8.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = task.title,
                    modifier = Modifier.weight(1f),
                    color = if (isCompleted) colors.muted else colors.ink,
                    fontWeight = FontWeight.SemiBold,
                    textDecoration = if (isCompleted) TextDecoration.LineThrough else TextDecoration.None,
                )
                OutlinedButton(onClick = if (isCompleted) onUndo else onComplete) {
                    Text(if (isCompleted) "戻す" else "完了")
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Focus", color = colors.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                OutlinedButton(
                    onClick = { onSetFocus(focusSlot ?: nextFocusSlot) },
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = if (focusSlot != null) colors.highlight else Color.Transparent,
                    ),
                ) {
                    Text(focusSlot?.let { "Focus ${it + 1}" } ?: "Focusへ追加")
                }
            }
        }
    }
}

@Composable
private fun MemoryThread(slot: Int) {
    val colors = LocalCuckooColors.current
    val color = when (slot) {
        0 -> colors.teal
        1 -> colors.green
        else -> colors.gold
    }
    Box(
        modifier = Modifier
            .size(width = 4.dp, height = 24.dp)
            .clip(CircleShape)
            .background(color),
    )
}
