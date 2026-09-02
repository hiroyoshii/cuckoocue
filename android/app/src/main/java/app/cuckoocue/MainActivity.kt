package app.cuckoocue

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.cuckoocue.appearance.AppearanceRepository
import app.cuckoocue.appearance.AppearanceSettings
import app.cuckoocue.appearance.AppThemeMode
import app.cuckoocue.appearance.WidgetTextScale
import app.cuckoocue.appearance.WidgetThemeMode
import app.cuckoocue.data.CuckooRepository
import app.cuckoocue.data.PriorityExposure
import app.cuckoocue.data.RunEntity
import app.cuckoocue.data.RunTaskEntity
import app.cuckoocue.widget.CuckooCueWidgetUpdater
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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
    val cuePanel: Color,
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
            cuePanel = Color(0xFF1C2926),
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
            cuePanel = Color(0xFFE9EFE8),
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
        surfaceVariant = colors.cuePanel,
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

private class WidgetRedrawScheduler(
    private val scope: CoroutineScope,
    context: Context,
) {
    private val appContext = context.applicationContext
    private val lock = Any()
    private var requested = false
    private var clearUndoRequested = false
    private var job: Job? = null

    fun request(clearUndo: Boolean = true) {
        synchronized(lock) {
            requested = true
            clearUndoRequested = clearUndoRequested || clearUndo
            if (job?.isActive == true) return
            job = scope.launch(Dispatchers.Default) { drainRequests() }
        }
    }

    private suspend fun drainRequests() {
        while (true) {
            delay(120)
            val clearUndo = synchronized(lock) {
                if (!requested) {
                    job = null
                    return
                }
                requested = false
                clearUndoRequested.also { clearUndoRequested = false }
            }
            if (clearUndo) {
                CuckooCueWidgetUpdater.clearTransientUndoAndUpdateAll(appContext)
            } else {
                CuckooCueWidgetUpdater.updateAll(appContext)
            }
        }
    }
}

@Composable
private fun CuckooCueScreen(
    repository: CuckooRepository,
    appearanceRepository: AppearanceRepository,
    appearanceSettings: AppearanceSettings,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val widgetRedrawScheduler = remember(scope, context) { WidgetRedrawScheduler(scope, context) }
    val runs by repository.runs.collectAsStateWithLifecycle(initialValue = emptyList())
    var selectedRunId by remember { mutableStateOf<String?>(null) }
    var showAppearance by remember { mutableStateOf(false) }

    LaunchedEffect(repository) {
        widgetRedrawScheduler.request()
    }

    val selectedRun = runs.firstOrNull { it.id == selectedRunId }
    if (selectedRunId != null && selectedRun == null) {
        selectedRunId = null
    }

    if (selectedRun != null) {
        BackHandler { selectedRunId = null }
        RunDetailScreen(
            repository = repository,
            run = selectedRun,
            onBack = { selectedRunId = null },
            onRenameRun = { title ->
                scope.launch {
                    repository.renameRun(selectedRun.id, title)
                    widgetRedrawScheduler.request(clearUndo = false)
                }
            },
            onArchiveRun = {
                scope.launch {
                    repository.archiveRun(selectedRun.id)
                    selectedRunId = null
                    widgetRedrawScheduler.request()
                }
            },
            onAddTask = { title, dueAt, priority ->
                scope.launch {
                    repository.addTask(selectedRun.id, title, dueAt, priority)
                    widgetRedrawScheduler.request()
                }
            },
            onUpdateTaskAndAddBlankAfter = { taskId, title, dueAt, priority, onAdded ->
                scope.launch {
                    repository.updateTask(taskId, title, dueAt, priority)
                    val addedTaskId = repository.addTaskAfter(taskId, "")
                    widgetRedrawScheduler.request()
                    onAdded(addedTaskId)
                }
            },
            onUpdateTask = { taskId, title, dueAt, priority ->
                scope.launch {
                    repository.updateTask(taskId, title, dueAt, priority)
                    widgetRedrawScheduler.request()
                }
            },
            onMoveTask = { taskId, delta ->
                scope.launch {
                    repository.movePendingTask(selectedRun.id, taskId, delta)
                    widgetRedrawScheduler.request()
                }
            },
            onDeleteTask = { taskId ->
                scope.launch {
                    repository.deleteTask(taskId)
                    widgetRedrawScheduler.request()
                }
            },
            onComplete = { taskId ->
                scope.launch {
                    repository.completeTask(taskId)
                    widgetRedrawScheduler.request()
                }
            },
            onUndo = { taskId ->
                scope.launch {
                    repository.undoCompleteTask(taskId)
                    widgetRedrawScheduler.request()
                }
            },
        )
    } else {
        RunListScreen(
            repository = repository,
            runs = runs,
            appearanceSettings = appearanceSettings,
            showAppearance = showAppearance,
            onToggleAppearance = { showAppearance = !showAppearance },
            onOpenRun = { selectedRunId = it.id },
            onCreateRun = { title ->
                scope.launch {
                    repository.createRun(title)?.let { selectedRunId = it }
                    widgetRedrawScheduler.request()
                }
            },
            onAppThemeChange = { mode ->
                scope.launch {
                    appearanceRepository.setAppTheme(mode)
                    widgetRedrawScheduler.request(clearUndo = false)
                }
            },
            onWidgetThemeChange = { mode ->
                scope.launch {
                    appearanceRepository.setWidgetTheme(mode)
                    widgetRedrawScheduler.request(clearUndo = false)
                }
            },
            onWidgetTextScaleChange = { scale ->
                scope.launch {
                    appearanceRepository.setWidgetTextScale(scale)
                    widgetRedrawScheduler.request(clearUndo = false)
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RunListScreen(
    repository: CuckooRepository,
    runs: List<RunEntity>,
    appearanceSettings: AppearanceSettings,
    showAppearance: Boolean,
    onToggleAppearance: () -> Unit,
    onOpenRun: (RunEntity) -> Unit,
    onCreateRun: (String) -> Unit,
    onAppThemeChange: (AppThemeMode) -> Unit,
    onWidgetThemeChange: (WidgetThemeMode) -> Unit,
    onWidgetTextScaleChange: (WidgetTextScale) -> Unit,
) {
    val colors = LocalCuckooColors.current
    var runDraft by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Cuckoo Cue", fontSize = 12.sp, color = colors.teal, fontWeight = FontWeight.Bold)
                        Text("リスト", color = colors.ink, fontWeight = FontWeight.Bold)
                    }
                },
                actions = {
                    TextButton(onClick = onToggleAppearance) {
                        Text("表示", color = colors.muted)
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
                .padding(horizontal = 18.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                NewRunComposer(
                    value = runDraft,
                    onValueChange = { runDraft = it },
                    onCreate = {
                        onCreateRun(runDraft)
                        runDraft = ""
                    },
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            items(runs, key = { it.id }) { run ->
                RunCard(repository = repository, run = run, onOpen = { onOpenRun(run) })
            }
            if (showAppearance) {
                item {
                    AppearanceSettingsPanel(
                        settings = appearanceSettings,
                        onAppThemeChange = onAppThemeChange,
                        onWidgetThemeChange = onWidgetThemeChange,
                        onWidgetTextScaleChange = onWidgetTextScaleChange,
                    )
                }
            }
            item { Spacer(Modifier.height(20.dp)) }
        }
    }
}

@Composable
private fun NewRunComposer(
    value: String,
    onValueChange: (String) -> Unit,
    onCreate: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalCuckooColors.current
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            label = { Text("新しいリスト") },
            singleLine = true,
        )
        Button(
            onClick = onCreate,
            enabled = value.isNotBlank(),
            colors = ButtonDefaults.buttonColors(containerColor = colors.teal),
        ) {
            Text("作成")
        }
    }
}

@Composable
private fun RunCard(
    repository: CuckooRepository,
    run: RunEntity,
    onOpen: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    val previewTasks by repository.observeTaskPreview(run.id).collectAsStateWithLifecycle(initialValue = emptyList())

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
        shape = RoundedCornerShape(8.dp),
        color = colors.panel,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .border(1.dp, colors.line, RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = run.title,
                    modifier = Modifier.weight(1f),
                    color = colors.ink,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text("›", color = colors.muted, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
            previewTasks.forEach { task -> MiniTaskPreview(task = task) }
        }
    }
}

@Composable
private fun MiniTaskPreview(task: RunTaskEntity) {
    val colors = LocalCuckooColors.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        ExposureDot(priority = task.effectivePriority(), modifier = Modifier.size(8.dp))
        Spacer(Modifier.width(7.dp))
        Text(
            text = task.title,
            modifier = Modifier.weight(1f),
            color = colors.ink,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RunDetailScreen(
    repository: CuckooRepository,
    run: RunEntity,
    onBack: () -> Unit,
    onRenameRun: (String) -> Unit,
    onArchiveRun: () -> Unit,
    onAddTask: (String, Long?, Int?) -> Unit,
    onUpdateTaskAndAddBlankAfter: (String, String, Long?, Int?, (String?) -> Unit) -> Unit,
    onUpdateTask: (String, String, Long?, Int?) -> Unit,
    onMoveTask: (String, Int) -> Unit,
    onDeleteTask: (String) -> Unit,
    onComplete: (String) -> Unit,
    onUndo: (String) -> Unit,
) {
    val colors = LocalCuckooColors.current
    val tasks by repository.observeTasks(run.id).collectAsStateWithLifecycle(initialValue = emptyList())
    val pending = remember(tasks) { tasks.filter { it.completedAt == null } }
    val completed = remember(tasks) { tasks.filter { it.completedAt != null } }
    var titleDraft by remember(run.id, run.updatedAt) { mutableStateOf(run.title) }
    var isRunTitleEditing by remember(run.id) { mutableStateOf(false) }
    var showCompleted by remember { mutableStateOf(false) }
    var expandedTaskId by remember(run.id) { mutableStateOf<String?>(null) }
    var pendingDragOrderIds by remember(run.id) { mutableStateOf<List<String>?>(null) }
    val runTitleFocusRequester = remember { FocusRequester() }
    val visiblePending = remember(pendingDragOrderIds, pending) {
        val orderedIds = pendingDragOrderIds ?: return@remember pending
        val tasksById = pending.associateBy { it.id }
        orderedIds.mapNotNull { taskId -> tasksById[taskId] }
    }

    fun previewMoveTask(taskId: String, delta: Int) {
        val currentIds = pendingDragOrderIds ?: pending.map { it.id }
        val fromIndex = currentIds.indexOf(taskId)
        if (fromIndex < 0) return
        val toIndex = (fromIndex + delta).coerceIn(0, currentIds.lastIndex)
        if (fromIndex == toIndex) return
        pendingDragOrderIds = currentIds.toMutableList().also { ids ->
            val moved = ids.removeAt(fromIndex)
            ids.add(toIndex, moved)
        }
    }

    fun commitPreviewedMove(taskId: String) {
        val previewIds = pendingDragOrderIds
        val fromIndex = pending.indexOfFirst { it.id == taskId }
        val toIndex = previewIds?.indexOf(taskId) ?: -1
        pendingDragOrderIds = null
        if (fromIndex >= 0 && toIndex >= 0 && fromIndex != toIndex) {
            onMoveTask(taskId, toIndex - fromIndex)
        }
    }

    fun cancelPreviewedMove() {
        pendingDragOrderIds = null
    }

    fun saveRunTitle() {
        val cleanTitle = titleDraft.trim()
        if (cleanTitle.isBlank()) {
            titleDraft = run.title
        } else if (cleanTitle != run.title) {
            titleDraft = cleanTitle
            onRenameRun(cleanTitle)
        }
        isRunTitleEditing = false
    }

    LaunchedEffect(isRunTitleEditing) {
        if (isRunTitleEditing) {
            runTitleFocusRequester.requestFocus()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("")
                },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text("‹", color = colors.ink, fontSize = 28.sp) }
                },
                actions = {
                    TextButton(onClick = onArchiveRun) { Text("閉じる", color = colors.muted) }
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
                .padding(horizontal = 18.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            item {
                RunTitleEditor(
                    title = run.title,
                    draft = titleDraft,
                    isEditing = isRunTitleEditing,
                    focusRequester = runTitleFocusRequester,
                    onDraftChange = { titleDraft = it },
                    onStartEditing = {
                        titleDraft = run.title
                        isRunTitleEditing = true
                    },
                    onSave = ::saveRunTitle,
                    modifier = Modifier.padding(top = 8.dp, bottom = 6.dp),
                )
            }
            item {
                AddTaskComposer(
                    onAdd = onAddTask,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }
            items(visiblePending, key = { it.id }) { task ->
                TaskRow(
                    task = task,
                    onUpdate = { title, dueAt, priority -> onUpdateTask(task.id, title, dueAt, priority) },
                    onSubmitAndCreateNext = { title, dueAt, priority ->
                        onUpdateTaskAndAddBlankAfter(task.id, title, dueAt, priority) { addedTaskId ->
                            expandedTaskId = addedTaskId
                        }
                    },
                    onDragStart = {
                        pendingDragOrderIds = pending.map { it.id }
                    },
                    onPreviewMoveBy = { delta -> previewMoveTask(task.id, delta) },
                    onDragFinished = { commitPreviewedMove(task.id) },
                    onDragCanceled = ::cancelPreviewedMove,
                    onMoveUp = { onMoveTask(task.id, -1) },
                    onDelete = { onDeleteTask(task.id) },
                    onComplete = { onComplete(task.id) },
                    onUndo = { onUndo(task.id) },
                    startExpanded = expandedTaskId == task.id,
                    requestTitleFocus = expandedTaskId == task.id,
                    onExpansionHandled = {
                        if (expandedTaskId == task.id) {
                            expandedTaskId = null
                        }
                    },
                )
            }
            item {
                TextButton(onClick = { showCompleted = !showCompleted }) {
                    Text(
                        text = if (showCompleted) "完了済みを閉じる (${completed.size})" else "完了済み (${completed.size})",
                        color = colors.muted,
                    )
                }
            }
            if (showCompleted) {
                items(completed, key = { it.id }) { task ->
                    TaskRow(
                        task = task,
                        onUpdate = { title, dueAt, priority -> onUpdateTask(task.id, title, dueAt, priority) },
                        onSubmitAndCreateNext = { title, dueAt, priority -> onUpdateTask(task.id, title, dueAt, priority) },
                        onDragStart = {},
                        onPreviewMoveBy = {},
                        onDragFinished = {},
                        onDragCanceled = {},
                        onMoveUp = {},
                        onDelete = { onDeleteTask(task.id) },
                        onComplete = { onComplete(task.id) },
                        onUndo = { onUndo(task.id) },
                    )
                }
            }
            item { Spacer(Modifier.height(20.dp)) }
        }
    }
}

@Composable
private fun AddTaskComposer(
    onAdd: (String, Long?, Int?) -> Unit,
    modifier: Modifier = Modifier,
    requestInitialFocus: Boolean = false,
) {
    var title by remember { mutableStateOf("") }
    val colors = LocalCuckooColors.current
    val focusRequester = remember { FocusRequester() }

    fun submit() {
        if (title.isNotBlank()) {
            onAdd(title, null, null)
            title = ""
        }
    }

    LaunchedEffect(requestInitialFocus) {
        if (requestInitialFocus) {
            focusRequester.requestFocus()
        }
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(46.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(colors.highlight)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = title,
            onValueChange = { title = it },
            modifier = Modifier
                .weight(1f)
                .focusRequester(focusRequester)
                .onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyUp && event.key == Key.Enter) {
                        submit()
                        true
                    } else {
                        false
                    }
                },
            singleLine = true,
            textStyle = TextStyle(color = colors.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold),
            cursorBrush = SolidColor(colors.teal),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            decorationBox = { innerTextField ->
                if (title.isBlank()) {
                    Text("新しい項目", color = colors.muted, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
                innerTextField()
            },
        )
    }
}

@Composable
private fun RunTitleEditor(
    title: String,
    draft: String,
    isEditing: Boolean,
    focusRequester: FocusRequester,
    onDraftChange: (String) -> Unit,
    onStartEditing: () -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalCuckooColors.current
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(colors.surfaceBase)
            .padding(horizontal = 4.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        BasicTextField(
            value = if (isEditing) draft else title,
            onValueChange = onDraftChange,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focusRequester)
                .onFocusChanged { focusState ->
                    if (focusState.isFocused && !isEditing) {
                        onStartEditing()
                    } else if (!focusState.isFocused && isEditing) {
                        onSave()
                    }
                }
                .onPreviewKeyEvent { event ->
                    if (
                        event.type == KeyEventType.KeyUp &&
                        (event.key == Key.Enter || event.key == Key.NumPadEnter)
                    ) {
                        onSave()
                        true
                    } else {
                        false
                    }
                },
            singleLine = true,
            textStyle = TextStyle(color = colors.ink, fontSize = 22.sp, fontWeight = FontWeight.Bold),
            cursorBrush = SolidColor(colors.teal),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onSave() }),
        )
    }
}

@Composable
private fun TaskRow(
    task: RunTaskEntity,
    onUpdate: (String, Long?, Int?) -> Unit,
    onSubmitAndCreateNext: (String, Long?, Int?) -> Unit,
    onDragStart: () -> Unit,
    onPreviewMoveBy: (Int) -> Unit,
    onDragFinished: () -> Unit,
    onDragCanceled: () -> Unit,
    onMoveUp: () -> Unit,
    onDelete: () -> Unit,
    onComplete: () -> Unit,
    onUndo: () -> Unit,
    startExpanded: Boolean = false,
    requestTitleFocus: Boolean = false,
    onExpansionHandled: () -> Unit = {},
) {
    val colors = LocalCuckooColors.current
    val isCompleted = task.completedAt != null
    var isTitleEditing by remember(task.id) { mutableStateOf(false) }
    var isControlsOpen by remember(task.id) { mutableStateOf(false) }
    var titleDraft by remember(task.id, task.updatedAt) { mutableStateOf(task.title) }
    var dueDateDraft by remember(task.id, task.updatedAt) { mutableStateOf(task.dueAt.dueInputLabel()) }
    var priorityDraft by remember(task.id, task.updatedAt) { mutableStateOf(task.userPriority ?: task.effectivePriority()) }
    var isDragging by remember(task.id) { mutableStateOf(false) }
    val titleFocusRequester = remember { FocusRequester() }
    val displayPriority = if (isTitleEditing || isControlsOpen) {
        PriorityExposure.normalize(priorityDraft)
    } else {
        task.effectivePriority()
    }
    fun submitAndCreateNext() {
        onSubmitAndCreateNext(titleDraft, dueDateDraft.toDueAt(), priorityDraft)
        isTitleEditing = false
        isControlsOpen = false
    }

    LaunchedEffect(startExpanded) {
        if (startExpanded) {
            isTitleEditing = true
        }
    }

    LaunchedEffect(isTitleEditing, requestTitleFocus) {
        if (isTitleEditing) {
            titleFocusRequester.requestFocus()
        }
        if (isTitleEditing && requestTitleFocus) {
            onExpansionHandled()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.surfaceBase)
            .padding(horizontal = 2.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(if ((if (isTitleEditing) titleDraft else task.title).length > 22) 52.dp else 36.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(if (isDragging) colors.highlight else Color.Transparent)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DragHandle(
                isDragging = isDragging,
                isEnabled = !isCompleted,
                onTap = onMoveUp,
                onDragStart = {
                    isDragging = true
                    onDragStart()
                },
                onDragEnd = {
                    isDragging = false
                    onDragFinished()
                },
                onDragCancel = {
                    isDragging = false
                    onDragCanceled()
                },
                onPreviewMoveBy = onPreviewMoveBy,
            )
            CheckPriorityControl(
                isCompleted = isCompleted,
                priority = displayPriority,
                onClick = { if (isCompleted) onUndo() else onComplete() },
            )
            Spacer(Modifier.width(8.dp))
            if (isTitleEditing) {
                TaskTitleEditor(
                    title = titleDraft,
                    dueAt = dueDateDraft.toDueAt(),
                    isCompleted = isCompleted,
                    focusRequester = titleFocusRequester,
                    onTitleChange = { titleDraft = it },
                    onSubmit = ::submitAndCreateNext,
                    onDelete = onDelete,
                    modifier = Modifier.weight(1f),
                )
            } else {
                TaskTitleText(
                    title = task.title.ifBlank { "新しい項目" },
                    dueAt = task.dueAt,
                    isCompleted = isCompleted,
                    modifier = Modifier.weight(1f).clickable { isTitleEditing = true },
                )
            }
            Box(
                modifier = Modifier
                    .width(28.dp)
                    .height(34.dp)
                    .clickable {
                        isControlsOpen = !isControlsOpen
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "⋯",
                    color = colors.muted,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        if (isControlsOpen) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 50.dp, end = 4.dp, bottom = 4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                TaskMetaControls(
                    dueDateText = dueDateDraft,
                    priority = priorityDraft,
                    onDueDateTextChange = { dueDateDraft = it },
                    onPriorityChange = { priorityDraft = it },
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    EditActionButton(
                        label = "削除",
                        filled = false,
                        onClick = onDelete,
                    )
                    Spacer(Modifier.width(6.dp))
                    EditActionButton(
                        label = "保存",
                        filled = true,
                        onClick = {
                            onUpdate(titleDraft, dueDateDraft.toDueAt(), priorityDraft)
                            isTitleEditing = false
                            isControlsOpen = false
                        },
                    )
                }
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(colors.line),
        )
    }
}

@Composable
private fun DragHandle(
    isDragging: Boolean,
    isEnabled: Boolean,
    onTap: () -> Unit,
    onDragStart: () -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
    onPreviewMoveBy: (Int) -> Unit,
) {
    val colors = LocalCuckooColors.current
    Box(
        modifier = Modifier
            .width(30.dp)
            .height(34.dp)
            .clickable(enabled = isEnabled, onClick = onTap)
            .pointerInput(isEnabled) {
                if (isEnabled) {
                    var accumulatedDrag = 0f
                    detectDragGestures(
                        onDragStart = {
                            accumulatedDrag = 0f
                            onDragStart()
                        },
                        onDragEnd = {
                            accumulatedDrag = 0f
                            onDragEnd()
                        },
                        onDragCancel = {
                            accumulatedDrag = 0f
                            onDragCancel()
                        },
                        onDrag = { _, dragAmount ->
                            accumulatedDrag += dragAmount.y
                            if (accumulatedDrag <= -36f) {
                                onPreviewMoveBy(-1)
                                accumulatedDrag = 0f
                            } else if (accumulatedDrag >= 36f) {
                                onPreviewMoveBy(1)
                                accumulatedDrag = 0f
                            }
                        },
                    )
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "≡",
            color = if (isDragging) colors.teal else colors.muted,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun TaskTitleEditor(
    title: String,
    dueAt: Long?,
    isCompleted: Boolean,
    focusRequester: FocusRequester,
    onTitleChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalCuckooColors.current
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        DueLabel(dueAt = dueAt, trailingGap = 4.dp)
        BasicTextField(
            value = title,
            onValueChange = onTitleChange,
            modifier = Modifier
                .weight(1f)
                .focusRequester(focusRequester)
                .onPreviewKeyEvent { event ->
                    when {
                        event.type == KeyEventType.KeyUp &&
                            (event.key == Key.Enter || event.key == Key.NumPadEnter) -> {
                            onSubmit()
                            true
                        }

                        title.isEmpty() &&
                            event.type == KeyEventType.KeyDown &&
                            (event.key == Key.Backspace || event.key == Key.Delete) -> {
                            onDelete()
                            true
                        }

                        else -> false
                    }
                },
            singleLine = false,
            maxLines = 2,
            textStyle = TextStyle(
                color = if (isCompleted) colors.muted else colors.ink,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                textDecoration = if (isCompleted) TextDecoration.LineThrough else TextDecoration.None,
            ),
            cursorBrush = SolidColor(colors.teal),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
            decorationBox = { innerTextField ->
                if (title.isBlank()) {
                    Text("新しい項目", color = colors.muted, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
                innerTextField()
            },
        )
    }
}

@Composable
private fun TaskTitleText(
    title: String,
    dueAt: Long?,
    isCompleted: Boolean,
    modifier: Modifier = Modifier,
) {
    val colors = LocalCuckooColors.current
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        DueLabel(dueAt = dueAt, trailingGap = 4.dp)
        Text(
            text = title,
            modifier = Modifier.weight(1f),
            color = if (isCompleted || title.isBlank()) colors.muted else colors.ink,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textDecoration = if (isCompleted) TextDecoration.LineThrough else TextDecoration.None,
        )
    }
}

@Composable
private fun DueLabel(
    dueAt: Long?,
    trailingGap: androidx.compose.ui.unit.Dp,
) {
    val colors = LocalCuckooColors.current
    val label = dueAt.dueLabel() ?: return
    Text(
        text = label,
        color = colors.teal,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(end = trailingGap),
        maxLines = 1,
        overflow = TextOverflow.Clip,
    )
}

@Composable
private fun EditActionButton(
    label: String,
    filled: Boolean,
    onClick: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    val shape = RoundedCornerShape(7.dp)
    Surface(
        modifier = Modifier
            .height(28.dp)
            .width(60.dp)
            .clip(shape)
            .clickable(onClick = onClick),
        shape = shape,
        color = if (filled) colors.teal else Color.Transparent,
        border = if (filled) null else androidx.compose.foundation.BorderStroke(1.dp, colors.line),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = label,
                color = if (filled) colors.panel else colors.muted,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun CheckPriorityControl(
    isCompleted: Boolean,
    priority: Int,
    onClick: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    Box(
        modifier = Modifier
            .width(32.dp)
            .height(34.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        ExposureDot(
            priority = priority,
            modifier = Modifier
                .align(Alignment.CenterStart)
                .offset(x = 6.dp, y = 1.dp),
            compact = false,
        )
        Text(
            text = if (isCompleted) "■" else "□",
            color = colors.muted,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun TaskMetaControls(
    dueDateText: String,
    priority: Int,
    onDueDateTextChange: (String) -> Unit,
    onPriorityChange: (Int) -> Unit,
) {
    val colors = LocalCuckooColors.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("日付", color = colors.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(48.dp))
            Box(
                modifier = Modifier
                    .width(96.dp)
                    .height(26.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(colors.panel)
                    .border(1.dp, colors.line, RoundedCornerShape(6.dp))
                    .padding(horizontal = 8.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                BasicTextField(
                    value = dueDateText,
                    onValueChange = onDueDateTextChange,
                    singleLine = true,
                    textStyle = TextStyle(color = colors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold),
                    cursorBrush = SolidColor(colors.teal),
                    decorationBox = { innerTextField ->
                        if (dueDateText.isBlank()) {
                            Text("M/d", color = colors.muted, fontSize = 13.sp)
                        }
                        innerTextField()
                    },
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("強さ", color = colors.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(48.dp))
            UnderlineChoice("弱", selected = priority == PriorityExposure.Quiet, color = colors.muted) {
                onPriorityChange(PriorityExposure.Quiet)
            }
            UnderlineChoice("中", selected = priority == PriorityExposure.Medium, color = colors.green) {
                onPriorityChange(PriorityExposure.Medium)
            }
            UnderlineChoice("強", selected = priority == PriorityExposure.Strong, color = colors.teal) {
                onPriorityChange(PriorityExposure.Strong)
            }
        }
    }
}

@Composable
private fun UnderlineChoice(
    text: String,
    selected: Boolean,
    color: Color,
    onClick: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    Box(
        modifier = Modifier
            .width(if (text.length <= 2) 48.dp else 58.dp)
            .height(24.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.BottomCenter,
    ) {
        if (selected) {
            Box(
                modifier = Modifier
                    .width(14.dp)
                    .height(6.dp)
                    .background(color.copy(alpha = 0.35f)),
            )
        }
        Text(
            text = text,
            color = if (selected) colors.ink else colors.muted,
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        )
    }
}

@Composable
private fun ExposureDot(priority: Int, modifier: Modifier = Modifier, compact: Boolean = false) {
    val colors = LocalCuckooColors.current
    val size = when (priority) {
        PriorityExposure.Strong -> if (compact) 10.dp else 16.dp
        PriorityExposure.Medium -> if (compact) 7.dp else 12.dp
        else -> if (compact) 5.dp else 8.dp
    }
    val color = when (priority) {
        PriorityExposure.Strong -> colors.teal.copy(alpha = 0.66f)
        PriorityExposure.Medium -> colors.green.copy(alpha = 0.6f)
        else -> colors.muted.copy(alpha = 0.52f)
    }
    Box(modifier = modifier.size(size).clip(CircleShape).background(color))
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

private fun RunTaskEntity.effectivePriority(): Int =
    userPriority?.let { PriorityExposure.normalize(it) } ?: PriorityExposure.compute(dueAt)

private fun Long?.dueLabel(): String? =
    this?.let {
        DateTimeFormatter.ofPattern("M/d")
            .format(Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()))
    }

private fun Long?.dueInputLabel(): String = dueLabel().orEmpty()

private fun String.toDueAt(): Long? {
    val clean = trim()
    if (clean.isEmpty()) return null
    val parts = clean
        .replace('-', '/')
        .split('/')
        .mapNotNull { it.toIntOrNull() }
    val zoneId = ZoneId.systemDefault()
    val today = LocalDate.now(zoneId)
    val date = try {
        when (parts.size) {
            2 -> LocalDate.of(today.year, parts[0], parts[1])
            3 -> LocalDate.of(parts[0], parts[1], parts[2])
            else -> return null
        }
    } catch (_: RuntimeException) {
        return null
    }
    return date.atStartOfDay(zoneId).toInstant().toEpochMilli()
}
