package app.cuckoocue

import android.app.DatePickerDialog
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
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
import androidx.compose.foundation.Image
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
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
import app.cuckoocue.auth.CuckooAuth
import app.cuckoocue.data.CuebookEntity
import app.cuckoocue.data.CuebookTaskDraft
import app.cuckoocue.data.CuebookTaskEntity
import app.cuckoocue.data.CuckooRepository
import app.cuckoocue.data.PriorityExposure
import app.cuckoocue.data.RunEntity
import app.cuckoocue.data.RunTaskEntity
import app.cuckoocue.transfer.ImportedRunPayload
import app.cuckoocue.transfer.CorpusImportClient
import app.cuckoocue.transfer.EditableShelfSummary
import app.cuckoocue.transfer.ImportReference
import app.cuckoocue.transfer.PublicShelfClient
import app.cuckoocue.transfer.RunTransferContract
import app.cuckoocue.memory.MemoryEventClient
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
import kotlinx.coroutines.flow.MutableStateFlow
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser

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
    private val incomingImport = MutableStateFlow<ImportedRunPayload?>(null)
    private val receivedRunId = MutableStateFlow<String?>(null)
    private var pendingRunId: String? = null
    private var pendingImportReference: ImportReference? = null
    private var importJob: Job? = null
    private var receiveJob: Job? = null
    private val authUser = MutableStateFlow<FirebaseUser?>(null)
    private val authError = MutableStateFlow<String?>(null)
    private val transferError = MutableStateFlow<String?>(null)
    private val receiving = MutableStateFlow(false)
    private val cuckooAuth = CuckooAuth()
    private lateinit var repository: CuckooRepository
    private lateinit var importClient: CorpusImportClient
    private lateinit var shelfClient: PublicShelfClient
    private val authListener = FirebaseAuth.AuthStateListener { auth ->
        authUser.value = auth.currentUser
        if (auth.currentUser != null && ::repository.isInitialized) {
            refreshSharedRuns()
            loadPendingImport()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as CuckooCueApp
        repository = app.repository
        importClient = CorpusImportClient(getString(R.string.cuckoo_cue_web_url))
        shelfClient = PublicShelfClient(getString(R.string.cuckoo_cue_web_url))
        pendingImportReference = RunTransferContract.parseImportUri(intent?.data)
        pendingRunId = RunTransferContract.parseRunId(intent?.data)
        cuckooAuth.addListener(authListener)
        authUser.value = cuckooAuth.currentUser
        if (pendingImportReference?.revisionId != null || cuckooAuth.currentUser != null) loadPendingImport()
        val appearanceRepository = app.appearanceRepository

        setContent {
            val settings by appearanceRepository.settings.collectAsStateWithLifecycle(
                initialValue = AppearanceSettings(),
            )
            val importPayload by incomingImport.collectAsStateWithLifecycle()
            val syncedRunId by receivedRunId.collectAsStateWithLifecycle()
            val signedInUser by authUser.collectAsStateWithLifecycle()
            val signInError by authError.collectAsStateWithLifecycle()
            val receiveError by transferError.collectAsStateWithLifecycle()
            val isReceiving by receiving.collectAsStateWithLifecycle()
            val systemDark = isSystemInDarkTheme()
            val dark = settings.appTheme.resolve(systemDark)
            val colors = cuckooColors(dark)

            CompositionLocalProvider(LocalCuckooColors provides colors) {
                MaterialTheme(colorScheme = cuckooColorScheme(colors, dark)) {
                    if (receiveError != null) {
                        AlertDialog(
                            onDismissRequest = { transferError.value = null },
                            title = { Text("リストを受信できませんでした") },
                            text = { Text(receiveError!!) },
                            confirmButton = { TextButton(enabled = !isReceiving, onClick = { loadPendingImport() }) { Text("再試行") } },
                            dismissButton = { TextButton(onClick = {
                                transferError.value = null
                                lifecycleScope.launch { runCatching { cuckooAuth.signIn(this@MainActivity) }.onFailure { authError.value = it.localizedMessage } }
                            }) { Text("アカウントを選ぶ") } },
                        )
                    }
                    CuckooCueScreen(
                        repository = repository,
                        shelfClient = shelfClient,
                        appearanceRepository = appearanceRepository,
                        appearanceSettings = settings,
                        incomingImport = importPayload,
                        onImportConsumed = { incomingImport.value = null },
                        receivedRunId = syncedRunId,
                        onReceivedRunConsumed = { receivedRunId.value = null },
                        signedInUser = signedInUser,
                        signInError = signInError,
                        onSignIn = {
                            lifecycleScope.launch {
                                authError.value = null
                                runCatching { cuckooAuth.signIn(this@MainActivity) }
                                    .onFailure { authError.value = it.localizedMessage ?: "Google ログインに失敗しました" }
                            }
                        },
                        onSignOut = {
                            lifecycleScope.launch { cuckooAuth.signOut(this@MainActivity) }
                        },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingImportReference = RunTransferContract.parseImportUri(intent.data)
        pendingRunId = RunTransferContract.parseRunId(intent.data)
        loadPendingImport()
    }

    override fun onResume() {
        super.onResume()
        refreshSharedRuns()
        if (pendingRunId != null && importJob?.isActive != true) loadPendingImport()
    }

    private fun refreshSharedRuns() {
        if (!::repository.isInitialized || cuckooAuth.currentUser == null || receiveJob?.isActive == true) return
        receiveJob = lifecycleScope.launch {
            runCatching {
                repository.syncAllRuns()
                repository.receiveRuns()
                CuckooCueWidgetUpdater.updateAll(applicationContext)
            }.onFailure { authError.value = it.localizedMessage ?: "保存したリストを受信できませんでした" }
        }
    }

    override fun onDestroy() {
        cuckooAuth.removeListener(authListener)
        super.onDestroy()
    }

    private fun loadPendingImport() {
        pendingRunId?.let { runId ->
            if (cuckooAuth.currentUser == null) {
                transferError.value = "Webと同じアカウントでログインしてください"
                return
            }
            importJob?.cancel()
            importJob = lifecycleScope.launch {
                receiving.value = true
                transferError.value = null
                runCatching { repository.receiveRun(runId) }
                    .onSuccess {
                        pendingRunId = null; receivedRunId.value = runId; authError.value = null
                        CuckooCueWidgetUpdater.updateAll(applicationContext)
                    }
                    .onFailure { if (it !is kotlinx.coroutines.CancellationException) transferError.value = it.localizedMessage ?: "リストを取得できませんでした" }
                receiving.value = false
            }
            return
        }
        val reference = pendingImportReference ?: return
        if (reference.entryId != null && cuckooAuth.currentUser == null) return
        if (!::importClient.isInitialized) return
        importJob?.cancel()
        importJob = lifecycleScope.launch {
            runCatching { importClient.fetch(reference) }
                .onSuccess {
                    pendingImportReference = null
                    incomingImport.value = it
                    authError.value = null
                }
                .onFailure {
                    authError.value = it.localizedMessage ?: "取り込み内容を取得できませんでした"
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
    shelfClient: PublicShelfClient,
    appearanceRepository: AppearanceRepository,
    appearanceSettings: AppearanceSettings,
    incomingImport: ImportedRunPayload?,
    onImportConsumed: () -> Unit,
    receivedRunId: String?,
    onReceivedRunConsumed: () -> Unit,
    signedInUser: FirebaseUser?,
    signInError: String?,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
) {
    val context = LocalContext.current
    val webAppUrl = stringResource(R.string.cuckoo_cue_web_url)
    val scope = rememberCoroutineScope()
    val widgetRedrawScheduler = remember(scope, context) { WidgetRedrawScheduler(scope, context) }
    val memoryEventClient = remember { MemoryEventClient() }
    val runs by repository.runs.collectAsStateWithLifecycle(initialValue = emptyList())
    val cuebooks by repository.cuebooks.collectAsStateWithLifecycle(initialValue = emptyList())
    var selectedRunId by remember { mutableStateOf<String?>(null) }
    var selectedCuebookId by remember { mutableStateOf<String?>(null) }
    var importedRunId by remember { mutableStateOf<String?>(null) }
    var pendingOpenRunId by remember { mutableStateOf<String?>(null) }
    var showAppearance by remember { mutableStateOf(false) }
    var publishingCuebook by remember { mutableStateOf<CuebookEntity?>(null) }
    var publishShelves by remember { mutableStateOf<List<EditableShelfSummary>>(emptyList()) }
    var isLoadingPublishShelves by remember { mutableStateOf(false) }
    var isPublishingCuebook by remember { mutableStateOf(false) }

    LaunchedEffect(repository) {
        widgetRedrawScheduler.request()
    }

    LaunchedEffect(receivedRunId) {
        if (receivedRunId != null) {
            pendingOpenRunId = receivedRunId
            onReceivedRunConsumed()
            widgetRedrawScheduler.request()
        }
    }

    if (incomingImport != null) {
        AlertDialog(
            onDismissRequest = onImportConsumed,
            title = { Text("リストを取り込みますか") },
            text = { Text("${incomingImport.title}（${incomingImport.tasks.size}件）") },
            confirmButton = {
                TextButton(onClick = {
                    val payload = incomingImport
                    onImportConsumed()
                    scope.launch {
                        repository.importRun(payload)?.let { runId ->
                            importedRunId = runId
                            pendingOpenRunId = runId
                            widgetRedrawScheduler.request()
                        }
                    }
                }) { Text("取り込む") }
            },
            dismissButton = { TextButton(onClick = onImportConsumed) { Text("キャンセル") } },
        )
    }

    publishingCuebook?.let { cuebook ->
        PublishCuebookDialog(
            cuebook = cuebook,
            shelves = publishShelves,
            isLoading = isLoadingPublishShelves,
            isPublishing = isPublishingCuebook,
            onDismiss = {
                publishingCuebook = null
                publishShelves = emptyList()
            },
            onPublish = { shelf ->
                scope.launch {
                    val snapshot = repository.cuebookSnapshot(cuebook.id)
                    if (snapshot == null) {
                        Toast.makeText(context, "公開できるCueがありません", Toast.LENGTH_LONG).show()
                        return@launch
                    }
                    isPublishingCuebook = true
                    runCatching { shelfClient.publishCuebook(shelf.id, snapshot) }
                        .onSuccess {
                            Toast.makeText(context, "まとまりへ置きました", Toast.LENGTH_SHORT).show()
                            publishingCuebook = null
                            publishShelves = emptyList()
                        }
                        .onFailure {
                            Toast.makeText(context, it.localizedMessage ?: "まとまりへ置けませんでした", Toast.LENGTH_LONG).show()
                        }
                    isPublishingCuebook = false
                }
            },
        )
    }

    LaunchedEffect(pendingOpenRunId, runs) {
        val pendingRunId = pendingOpenRunId ?: return@LaunchedEffect
        if (runs.any { it.id == pendingRunId }) {
            selectedRunId = pendingRunId
            pendingOpenRunId = null
        }
    }

    val selectedRun = runs.firstOrNull { it.id == selectedRunId }
    if (selectedRunId != null && selectedRun == null) {
        selectedRunId = null
    }
    val selectedCuebook = cuebooks.firstOrNull { it.id == selectedCuebookId }
    if (selectedCuebookId != null && selectedCuebook == null) {
        selectedCuebookId = null
    }

    if (selectedRun != null) {
        BackHandler { selectedRunId = null }
        RunDetailScreen(
            repository = repository,
            run = selectedRun,
            isImported = selectedRun.id == importedRunId,
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
            onReuseRun = { targetAnchorDay ->
                scope.launch {
                    val reusedRunId = repository.reuseCompletedRun(
                        sourceRunId = selectedRun.id,
                        targetAnchorDay = targetAnchorDay,
                    )
                    if (reusedRunId == null) {
                        Toast.makeText(context, "このリストを再利用できませんでした", Toast.LENGTH_LONG).show()
                        return@launch
                    }
                    pendingOpenRunId = reusedRunId
                    widgetRedrawScheduler.request()
                    Toast.makeText(context, "新しい日程で作成しました", Toast.LENGTH_SHORT).show()
                }
            },
            onShareRun = {
                scope.launch {
                    if (signedInUser == null) {
                        Toast.makeText(context, "先にGoogleアカウントでログインしてください", Toast.LENGTH_SHORT).show()
                        onSignIn()
                        return@launch
                    }
                    if (!repository.syncRunNow(selectedRun.id)) {
                        Toast.makeText(context, "同期できませんでした。通信を確認して再試行してください", Toast.LENGTH_LONG).show()
                        return@launch
                    }
                    val uri = RunTransferContract.buildSaveReviewUri(
                        webAppUrl = webAppUrl,
                        runId = selectedRun.id,
                    )
                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                }
            },
            onAddTask = { title, dueAt, priority ->
                scope.launch {
                    val added = repository.addTask(selectedRun.id, title, dueAt, priority)
                    if (added != null) memoryEventClient.ingest("android_task_added", "タスクを追加: $title")
                    widgetRedrawScheduler.request()
                }
            },
            onUpdateTaskAndAddBlankAfter = { taskId, title, availableFromAt, dueAt, priority, onAdded ->
                scope.launch {
                    val before = repository.getTask(taskId)
                    val updated = repository.updateTask(taskId, title, availableFromAt, dueAt, priority)
                    if (updated) sendTaskEditEvents(memoryEventClient, before, title, availableFromAt, dueAt, priority)
                    val addedTaskId = repository.addTaskAfter(taskId, "")
                    widgetRedrawScheduler.request()
                    onAdded(addedTaskId)
                }
            },
            onUpdateTask = { taskId, title, availableFromAt, dueAt, priority ->
                scope.launch {
                    val before = repository.getTask(taskId)
                    val updated = repository.updateTask(taskId, title, availableFromAt, dueAt, priority)
                    if (updated) sendTaskEditEvents(memoryEventClient, before, title, availableFromAt, dueAt, priority)
                    widgetRedrawScheduler.request()
                }
            },
            onMoveTask = { taskId, delta ->
                scope.launch {
                    val task = repository.getTask(taskId)
                    val moved = repository.movePendingTask(selectedRun.id, taskId, delta)
                    if (moved) memoryEventClient.ingest("android_task_reordered", "タスクの順序を変更: ${task?.title.orEmpty()}")
                    widgetRedrawScheduler.request()
                }
            },
            onDeleteTask = { taskId ->
                scope.launch {
                    val task = repository.getTask(taskId)
                    repository.deleteTask(taskId)
                    memoryEventClient.ingest("android_task_deleted", "タスクを削除: ${task?.title.orEmpty()}")
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
    } else if (selectedCuebook != null) {
        BackHandler { selectedCuebookId = null }
        CuebookDetailScreen(
            repository = repository,
            cuebook = selectedCuebook,
            onBack = { selectedCuebookId = null },
            onRenameCuebook = { title ->
                scope.launch { repository.renameCuebook(selectedCuebook.id, title) }
            },
            onCreateRun = { targetAnchorDay ->
                scope.launch {
                    val runId = repository.createRunFromCuebook(
                        cuebookId = selectedCuebook.id,
                        targetAnchorDay = targetAnchorDay,
                    )
                    if (runId == null) {
                        Toast.makeText(context, "実行リストを作成できませんでした", Toast.LENGTH_LONG).show()
                        return@launch
                    }
                    selectedCuebookId = null
                    pendingOpenRunId = runId
                    widgetRedrawScheduler.request()
                }
            },
            onAddTask = { title, priority, relativeStartDay, relativeEndDay ->
                scope.launch {
                    repository.addCuebookTask(
                        cuebookId = selectedCuebook.id,
                        title = title,
                        defaultPriority = priority,
                        relativeStartDay = relativeStartDay,
                        relativeEndDay = relativeEndDay,
                    )
                }
            },
            onUpdateTask = { taskId, title, priority, relativeStartDay, relativeEndDay ->
                scope.launch {
                    repository.updateCuebookTask(
                        cuebookId = selectedCuebook.id,
                        taskId = taskId,
                        title = title,
                        defaultPriority = priority,
                        relativeStartDay = relativeStartDay,
                        relativeEndDay = relativeEndDay,
                    )
                }
            },
            onDeleteTask = { taskId ->
                scope.launch { repository.deleteCuebookTask(selectedCuebook.id, taskId) }
            },
            onPublish = {
                scope.launch {
                    if (signedInUser == null) {
                        Toast.makeText(context, "先にGoogleアカウントでログインしてください", Toast.LENGTH_SHORT).show()
                        onSignIn()
                        return@launch
                    }
                    publishingCuebook = selectedCuebook
                    publishShelves = emptyList()
                    isLoadingPublishShelves = true
                    runCatching { shelfClient.editableShelves() }
                        .onSuccess { publishShelves = it }
                        .onFailure {
                            Toast.makeText(context, it.localizedMessage ?: "まとまりを読み込めませんでした", Toast.LENGTH_LONG).show()
                        }
                    isLoadingPublishShelves = false
                }
            },
        )
    } else {
        RunListScreen(
            repository = repository,
            runs = runs,
            cuebooks = cuebooks,
            appearanceSettings = appearanceSettings,
            signedInUser = signedInUser,
            signInError = signInError,
            showAppearance = showAppearance,
            onToggleAppearance = { showAppearance = !showAppearance },
            onSignIn = onSignIn,
            onSignOut = onSignOut,
            onOpenRun = { selectedRunId = it.id },
            onOpenCuebook = { selectedCuebookId = it.id },
            onCreateRun = { title ->
                scope.launch {
                    repository.createRun(title)?.let { selectedRunId = it }
                    widgetRedrawScheduler.request()
                }
            },
            onCreateCuebook = { title ->
                scope.launch {
                    repository.createCuebook(
                        title = title,
                        tasks = listOf(CuebookTaskDraft(title = "最初のCue")),
                    )?.let { selectedCuebookId = it }
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
    cuebooks: List<CuebookEntity>,
    appearanceSettings: AppearanceSettings,
    signedInUser: FirebaseUser?,
    signInError: String?,
    showAppearance: Boolean,
    onToggleAppearance: () -> Unit,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
    onOpenRun: (RunEntity) -> Unit,
    onOpenCuebook: (CuebookEntity) -> Unit,
    onCreateRun: (String) -> Unit,
    onCreateCuebook: (String) -> Unit,
    onAppThemeChange: (AppThemeMode) -> Unit,
    onWidgetThemeChange: (WidgetThemeMode) -> Unit,
    onWidgetTextScaleChange: (WidgetTextScale) -> Unit,
) {
    val colors = LocalCuckooColors.current
    var runDraft by remember { mutableStateOf("") }
    var cuebookDraft by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf("runs") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Image(
                            painter = painterResource(R.drawable.ic_cuckoo_cue_brand),
                            contentDescription = null,
                            modifier = Modifier.size(34.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text("Cuckoo Cue", fontSize = 12.sp, color = colors.teal, fontWeight = FontWeight.Bold)
                            Text("リスト", color = colors.ink, fontWeight = FontWeight.Bold)
                        }
                    }
                },
                actions = {
                    TextButton(onClick = if (signedInUser == null) onSignIn else onSignOut) {
                        Text(if (signedInUser == null) "ログイン" else "ログアウト", color = colors.teal)
                    }
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
            if (signedInUser != null || signInError != null) {
                item {
                    Text(
                        text = signInError ?: "${signedInUser?.displayName ?: signedInUser?.email} でログイン中",
                        color = if (signInError == null) colors.muted else MaterialTheme.colorScheme.error,
                        fontSize = 12.sp,
                    )
                }
            }
            item {
                ListModeTabs(
                    mode = mode,
                    onModeChange = { mode = it },
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            if (mode == "runs") {
                item {
                    NewRunComposer(
                        value = runDraft,
                        onValueChange = { runDraft = it },
                        onCreate = {
                            onCreateRun(runDraft)
                            runDraft = ""
                        },
                    )
                }
                if (runs.isEmpty()) {
                    item { EmptyListCard(title = "実行中のリストはまだありません", body = "一回きりのリストを作るか、再利用リストから日付付きのリストを作成します。") }
                }
                items(runs, key = { it.id }) { run ->
                    RunCard(repository = repository, run = run, onOpen = { onOpenRun(run) })
                }
            } else {
                item {
                    NewRunComposer(
                        value = cuebookDraft,
                        onValueChange = { cuebookDraft = it },
                        onCreate = {
                            onCreateCuebook(cuebookDraft)
                            cuebookDraft = ""
                        },
                        label = "新しい再利用リスト",
                        buttonLabel = "作成",
                    )
                }
                if (cuebooks.isEmpty()) {
                    item { EmptyListCard(title = "再利用リストはまだありません", body = "次回も使う項目セットを作ると、完了予定日から実行リストを作れます。") }
                }
                items(cuebooks, key = { it.id }) { cuebook ->
                    CuebookCard(repository = repository, cuebook = cuebook, onOpen = { onOpenCuebook(cuebook) })
                }
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
    label: String = "新しいリスト",
    buttonLabel: String = "作成",
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
            label = { Text(label) },
            singleLine = true,
        )
        Button(
            onClick = onCreate,
            enabled = value.isNotBlank(),
            colors = ButtonDefaults.buttonColors(containerColor = colors.teal),
        ) {
            Text(buttonLabel)
        }
    }
}

@Composable
private fun ListModeTabs(
    mode: String,
    onModeChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalCuckooColors.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, colors.line, RoundedCornerShape(8.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ModeTab(
            label = "実行中",
            selected = mode == "runs",
            onClick = { onModeChange("runs") },
            modifier = Modifier.weight(1f),
        )
        ModeTab(
            label = "再利用",
            selected = mode == "cuebooks",
            onClick = { onModeChange("cuebooks") },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ModeTab(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalCuckooColors.current
    Box(
        modifier = modifier
            .height(38.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(if (selected) colors.highlight else Color.Transparent)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (selected) colors.ink else colors.muted,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun EmptyListCard(title: String, body: String) {
    val colors = LocalCuckooColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, colors.line, RoundedCornerShape(8.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, color = colors.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        Text(body, color = colors.muted, fontSize = 12.sp, lineHeight = 17.sp)
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
private fun CuebookCard(
    repository: CuckooRepository,
    cuebook: CuebookEntity,
    onOpen: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    val previewTasks by repository.observeCuebookTasks(cuebook.id).collectAsStateWithLifecycle(initialValue = emptyList())

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
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = cuebook.title,
                        color = colors.ink,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = cuebook.originRevisionId?.let { "借りた再利用リスト" } ?: "自分の再利用リスト",
                        color = colors.teal,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Text("›", color = colors.muted, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
            previewTasks.take(3).forEach { task -> MiniCuebookTaskPreview(task = task) }
        }
    }
}

@Composable
private fun MiniCuebookTaskPreview(task: CuebookTaskEntity) {
    val colors = LocalCuckooColors.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        ExposureDot(priority = task.defaultPriority ?: PriorityExposure.Quiet, modifier = Modifier.size(8.dp))
        Spacer(Modifier.width(7.dp))
        Text(
            text = task.relativeEndDay.relativeDayLabel(),
            color = colors.teal,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.width(48.dp),
            maxLines = 1,
        )
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
    isImported: Boolean,
    onBack: () -> Unit,
    onRenameRun: (String) -> Unit,
    onArchiveRun: () -> Unit,
    onReuseRun: (LocalDate) -> Unit,
    onShareRun: () -> Unit,
    onAddTask: (String, Long?, Int?) -> Unit,
    onUpdateTaskAndAddBlankAfter: (String, String, Long?, Long?, Int?, (String?) -> Unit) -> Unit,
    onUpdateTask: (String, String, Long?, Long?, Int?) -> Unit,
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
    var showReuseDialog by remember(run.id) { mutableStateOf(false) }
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

    if (showReuseDialog) {
        ReuseCompletedRunDialog(
            onDismiss = { showReuseDialog = false },
            onConfirm = { targetAnchorDay ->
                showReuseDialog = false
                onReuseRun(targetAnchorDay)
            },
        )
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
            if (isImported && pending.isNotEmpty()) {
                item {
                    ImportedNotice(modifier = Modifier.padding(bottom = 8.dp))
                }
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
                    onUpdate = { title, availableFromAt, dueAt, priority -> onUpdateTask(task.id, title, availableFromAt, dueAt, priority) },
                    onSubmitAndCreateNext = { title, availableFromAt, dueAt, priority ->
                        onUpdateTaskAndAddBlankAfter(task.id, title, availableFromAt, dueAt, priority) { addedTaskId ->
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
                        onUpdate = { title, availableFromAt, dueAt, priority -> onUpdateTask(task.id, title, availableFromAt, dueAt, priority) },
                        onSubmitAndCreateNext = { title, availableFromAt, dueAt, priority -> onUpdateTask(task.id, title, availableFromAt, dueAt, priority) },
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
            if (pending.isEmpty() && completed.isNotEmpty()) {
                item {
                    ReuseCompletedList(
                        onReuse = { showReuseDialog = true },
                        onShare = onShareRun,
                    )
                }
            }
            item { Spacer(Modifier.height(20.dp)) }
        }
    }
}

@Composable
private fun PublishCuebookDialog(
    cuebook: CuebookEntity,
    shelves: List<EditableShelfSummary>,
    isLoading: Boolean,
    isPublishing: Boolean,
    onDismiss: () -> Unit,
    onPublish: (EditableShelfSummary) -> Unit,
) {
    var selectedShelfId by remember(cuebook.id, shelves) { mutableStateOf(shelves.firstOrNull()?.id) }
    val selectedShelf = shelves.firstOrNull { it.id == selectedShelfId }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("まとまりへ置く") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("「${cuebook.title}」の現在の内容から、公開用の版を作ってまとまりへ置きます。")
                when {
                    isLoading -> Text("まとまりを読み込んでいます。")
                    shelves.isEmpty() -> Text("編集できるまとまりがありません。Webの探す画面から、先にまとまりを作成してください。")
                    else -> shelves.forEach { shelf ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { selectedShelfId = shelf.id },
                            shape = RoundedCornerShape(8.dp),
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (shelf.id == selectedShelfId) LocalCuckooColors.current.teal else LocalCuckooColors.current.line,
                            ),
                            color = if (shelf.id == selectedShelfId) LocalCuckooColors.current.highlight else LocalCuckooColors.current.panel,
                        ) {
                            Column(
                                modifier = Modifier.padding(10.dp),
                                verticalArrangement = Arrangement.spacedBy(3.dp),
                            ) {
                                Text(shelf.title, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                Text(
                                    shelf.context,
                                    color = LocalCuckooColors.current.muted,
                                    fontSize = 12.sp,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { selectedShelf?.let(onPublish) },
                enabled = selectedShelf != null && !isLoading && !isPublishing,
            ) {
                Text(if (isPublishing) "配置中" else "この内容を置く")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isPublishing) {
                Text("キャンセル")
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CuebookDetailScreen(
    repository: CuckooRepository,
    cuebook: CuebookEntity,
    onBack: () -> Unit,
    onRenameCuebook: (String) -> Unit,
    onCreateRun: (LocalDate) -> Unit,
    onAddTask: (String, Int?, Int?, Int?) -> Unit,
    onUpdateTask: (String, String, Int?, Int?, Int?) -> Unit,
    onDeleteTask: (String) -> Unit,
    onPublish: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    val tasks by repository.observeCuebookTasks(cuebook.id).collectAsStateWithLifecycle(initialValue = emptyList())
    var titleDraft by remember(cuebook.id, cuebook.updatedAt) { mutableStateOf(cuebook.title) }
    var isTitleEditing by remember(cuebook.id) { mutableStateOf(false) }
    var showStartDialog by remember(cuebook.id) { mutableStateOf(false) }
    val titleFocusRequester = remember { FocusRequester() }

    fun saveTitle() {
        val cleanTitle = titleDraft.trim()
        if (cleanTitle.isBlank()) {
            titleDraft = cuebook.title
        } else if (cleanTitle != cuebook.title) {
            titleDraft = cleanTitle
            onRenameCuebook(cleanTitle)
        }
        isTitleEditing = false
    }

    LaunchedEffect(isTitleEditing) {
        if (isTitleEditing) titleFocusRequester.requestFocus()
    }

    if (showStartDialog) {
        ReuseCompletedRunDialog(
            onDismiss = { showStartDialog = false },
            onConfirm = { targetAnchorDay ->
                showStartDialog = false
                onCreateRun(targetAnchorDay)
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("") },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text("‹", color = colors.ink, fontSize = 28.sp) }
                },
                actions = {
                    TextButton(onClick = onPublish) { Text("まとまりへ置く", color = colors.muted) }
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
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    RunTitleEditor(
                        title = cuebook.title,
                        draft = titleDraft,
                        isEditing = isTitleEditing,
                        focusRequester = titleFocusRequester,
                        onDraftChange = { titleDraft = it },
                        onStartEditing = {
                            titleDraft = cuebook.title
                            isTitleEditing = true
                        },
                        onSave = ::saveTitle,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    CuebookOriginLabel(cuebook)
                    Button(
                        onClick = { showStartDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = tasks.any { it.title.isNotBlank() },
                        colors = ButtonDefaults.buttonColors(containerColor = colors.teal),
                    ) {
                        Text("日付を決めて始める")
                    }
                }
            }
            item {
                NewCuebookTaskComposer(onAdd = onAddTask)
            }
            if (tasks.isEmpty()) {
                item { EmptyListCard(title = "Cueがありません", body = "相対日を持つ項目を追加すると、完了予定日から実行日へ展開できます。") }
            }
            items(tasks, key = { it.id }) { task ->
                CuebookTaskRow(
                    task = task,
                    onUpdate = { title, priority, start, end -> onUpdateTask(task.id, title, priority, start, end) },
                    onDelete = { onDeleteTask(task.id) },
                )
            }
            item { Spacer(Modifier.height(20.dp)) }
        }
    }
}

@Composable
private fun CuebookOriginLabel(cuebook: CuebookEntity) {
    val colors = LocalCuckooColors.current
    val label = cuebook.originRevisionId?.let { "探すから借りた再利用リスト" } ?: "自分の再利用リスト"
    Text(
        text = label,
        color = colors.teal,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
private fun NewCuebookTaskComposer(
    onAdd: (String, Int?, Int?, Int?) -> Unit,
    modifier: Modifier = Modifier,
) {
    var title by remember { mutableStateOf("") }
    val colors = LocalCuckooColors.current
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
                .onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyUp && event.key == Key.Enter) {
                        if (title.isNotBlank()) {
                            onAdd(title, PriorityExposure.Quiet, null, null)
                            title = ""
                        }
                        true
                    } else {
                        false
                    }
                },
            singleLine = true,
            textStyle = TextStyle(color = colors.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold),
            cursorBrush = SolidColor(colors.teal),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                if (title.isNotBlank()) {
                    onAdd(title, PriorityExposure.Quiet, null, null)
                    title = ""
                }
            }),
            decorationBox = { innerTextField ->
                if (title.isBlank()) {
                    Text("新しいCue", color = colors.muted, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
                innerTextField()
            },
        )
    }
}

@Composable
private fun CuebookTaskRow(
    task: CuebookTaskEntity,
    onUpdate: (String, Int?, Int?, Int?) -> Unit,
    onDelete: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    var titleDraft by remember(task.id, task.updatedAt) { mutableStateOf(task.title) }
    var startDraft by remember(task.id, task.updatedAt) { mutableStateOf(task.relativeStartDay?.toString().orEmpty()) }
    var endDraft by remember(task.id, task.updatedAt) { mutableStateOf(task.relativeEndDay?.toString().orEmpty()) }
    var priorityDraft by remember(task.id, task.updatedAt) { mutableStateOf(task.defaultPriority ?: PriorityExposure.Quiet) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, colors.line, RoundedCornerShape(8.dp))
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = task.relativeEndDay.relativeDayLabel(),
                color = colors.teal,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(54.dp),
            )
            OutlinedTextField(
                value = titleDraft,
                onValueChange = { titleDraft = it },
                modifier = Modifier.weight(1f),
                singleLine = true,
                label = { Text("Cue") },
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("日程", color = colors.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(54.dp))
            OutlinedTextField(
                value = startDraft,
                onValueChange = { startDraft = it },
                modifier = Modifier.weight(1f),
                singleLine = true,
                label = { Text("開始") },
            )
            Spacer(Modifier.width(8.dp))
            OutlinedTextField(
                value = endDraft,
                onValueChange = { endDraft = it },
                modifier = Modifier.weight(1f),
                singleLine = true,
                label = { Text("終了") },
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("強さ", color = colors.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(54.dp))
            UnderlineChoice("弱", selected = priorityDraft == PriorityExposure.Quiet, color = colors.muted) {
                priorityDraft = PriorityExposure.Quiet
            }
            UnderlineChoice("中", selected = priorityDraft == PriorityExposure.Medium, color = colors.green) {
                priorityDraft = PriorityExposure.Medium
            }
            UnderlineChoice("強", selected = priorityDraft == PriorityExposure.Strong, color = colors.teal) {
                priorityDraft = PriorityExposure.Strong
            }
            Spacer(Modifier.weight(1f))
            EditActionButton(label = "削除", filled = false, onClick = onDelete)
            Spacer(Modifier.width(6.dp))
            EditActionButton(
                label = "保存",
                filled = true,
                onClick = {
                    onUpdate(
                        titleDraft,
                        priorityDraft,
                        startDraft.toRelativeDay(),
                        endDraft.toRelativeDay(),
                    )
                },
            )
        }
        Text(
            text = reusableCueExposureHint(priorityDraft),
            color = if (priorityDraft == PriorityExposure.Quiet) colors.muted else colors.teal,
            fontSize = 11.sp,
            lineHeight = 15.sp,
            modifier = Modifier.padding(start = 54.dp),
        )
    }
}

private fun reusableCueExposureHint(priority: Int?): String =
    if (PriorityExposure.normalize(priority ?: PriorityExposure.Quiet) == PriorityExposure.Quiet) {
        "日付付きリストにしたとき、通常はホーム画面に出ません。中・強にすると表示されます。"
    } else {
        "日付付きリストにしたとき、このCueはホーム画面に出ます。"
    }

@Composable
private fun ImportedNotice(modifier: Modifier = Modifier) {
    val colors = LocalCuckooColors.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(colors.highlight)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(R.drawable.ic_cuckoo_cue_brand),
            contentDescription = null,
            modifier = Modifier.size(24.dp),
        )
        Spacer(Modifier.width(8.dp))
        Column {
            Text("Webから取り込みました", color = colors.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text("日付と優先度を確認して、このまま使えます", color = colors.muted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun ReuseCompletedList(
    onReuse: () -> Unit,
    onShare: () -> Unit,
) {
    val colors = LocalCuckooColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp)
            .border(1.dp, colors.line, RoundedCornerShape(8.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(
                painter = painterResource(R.drawable.ic_cuckoo_cue_brand),
                contentDescription = null,
                modifier = Modifier.size(30.dp),
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("完了したリスト", color = colors.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text("同じ内容を新しい日程で使えます", color = colors.muted, fontSize = 12.sp)
            }
        }
        Button(
            onClick = onReuse,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = colors.teal),
        ) {
            Text("もう一度使う")
        }
        OutlinedButton(
            onClick = onShare,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("完了履歴をWebで見る")
        }
    }
}

@Composable
private fun ReuseCompletedRunDialog(
    onDismiss: () -> Unit,
    onConfirm: (LocalDate) -> Unit,
) {
    val context = LocalContext.current
    var targetAnchorDay by remember { mutableStateOf<LocalDate?>(null) }
    val initialDay = targetAnchorDay ?: LocalDate.now(ZoneId.systemDefault())
    val dateFormatter = remember { DateTimeFormatter.ofPattern("yyyy年M月d日") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("もう一度使う") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("新しい完了予定日を選ぶと、完了日からの間隔を保って各項目の日付を設定します。")
                OutlinedButton(
                    onClick = {
                        DatePickerDialog(
                            context,
                            { _, year, month, dayOfMonth ->
                                targetAnchorDay = LocalDate.of(year, month + 1, dayOfMonth)
                            },
                            initialDay.year,
                            initialDay.monthValue - 1,
                            initialDay.dayOfMonth,
                        ).show()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(targetAnchorDay?.format(dateFormatter) ?: "完了予定日を選ぶ")
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { targetAnchorDay?.let(onConfirm) },
                enabled = targetAnchorDay != null,
            ) {
                Text("作成する")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("キャンセル")
            }
        },
    )
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
    onUpdate: (String, Long?, Long?, Int?) -> Unit,
    onSubmitAndCreateNext: (String, Long?, Long?, Int?) -> Unit,
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
    var availableDateDraft by remember(task.id, task.updatedAt) { mutableStateOf(task.availableFromAt.dueInputLabel()) }
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
        onSubmitAndCreateNext(titleDraft, availableDateDraft.toDueAt(), dueDateDraft.toDueAt(), priorityDraft)
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
                    availableFromAt = availableDateDraft.toDueAt(),
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
                    availableFromAt = task.availableFromAt,
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
                    availableDateText = availableDateDraft,
                    dueDateText = dueDateDraft,
                    priority = priorityDraft,
                    onAvailableDateTextChange = { availableDateDraft = it },
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
                            onUpdate(titleDraft, availableDateDraft.toDueAt(), dueDateDraft.toDueAt(), priorityDraft)
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
    availableFromAt: Long?,
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
        ScheduleLabel(availableFromAt = availableFromAt, dueAt = dueAt, trailingGap = 4.dp)
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
    availableFromAt: Long?,
    dueAt: Long?,
    isCompleted: Boolean,
    modifier: Modifier = Modifier,
) {
    val colors = LocalCuckooColors.current
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        ScheduleLabel(availableFromAt = availableFromAt, dueAt = dueAt, trailingGap = 4.dp)
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
private fun ScheduleLabel(
    availableFromAt: Long?,
    dueAt: Long?,
    trailingGap: androidx.compose.ui.unit.Dp,
) {
    val colors = LocalCuckooColors.current
    val startLabel = availableFromAt.dueLabel()
    val endLabel = dueAt.dueLabel()
    val label = when {
        startLabel != null && endLabel != null && startLabel != endLabel -> "$startLabel〜$endLabel"
        endLabel != null -> endLabel
        startLabel != null -> "$startLabel〜"
        else -> return
    }
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
    availableDateText: String,
    dueDateText: String,
    priority: Int,
    onAvailableDateTextChange: (String) -> Unit,
    onDueDateTextChange: (String) -> Unit,
    onPriorityChange: (Int) -> Unit,
) {
    val colors = LocalCuckooColors.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("期間", color = colors.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(48.dp))
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
                    value = availableDateText,
                    onValueChange = onAvailableDateTextChange,
                    singleLine = true,
                    textStyle = TextStyle(color = colors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold),
                    cursorBrush = SolidColor(colors.teal),
                    decorationBox = { innerTextField ->
                        if (availableDateText.isBlank()) {
                            Text("開始 M/d", color = colors.muted, fontSize = 12.sp)
                        }
                        innerTextField()
                    },
                )
            }
            Text("〜", color = colors.muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
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
                            Text("終了 M/d", color = colors.muted, fontSize = 12.sp)
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
        Text(
            text = widgetExposureHint(priority),
            color = if (priority == PriorityExposure.Quiet) colors.muted else colors.teal,
            fontSize = 11.sp,
            lineHeight = 15.sp,
            modifier = Modifier.padding(start = 48.dp),
        )
    }
}

private fun widgetExposureHint(priority: Int): String =
    if (PriorityExposure.normalize(priority) == PriorityExposure.Quiet) {
        "今はホーム画面に出ません。中・強にすると表示されます。"
    } else {
        "このCueはホーム画面に出ます。"
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

private suspend fun sendTaskEditEvents(
    client: MemoryEventClient,
    before: RunTaskEntity?,
    title: String,
    availableFromAt: Long?,
    dueAt: Long?,
    priority: Int?,
) {
    if (before == null) return
    if (before.title != title.trim()) {
        client.ingest("android_task_edited", "タスク名を変更: ${before.title} -> ${title.trim()}")
    }
    if (before.availableFromAt != availableFromAt || before.dueAt != dueAt) {
        client.ingest(
            "android_relative_date_changed",
            "タスクの日程を変更: ${title.trim()} / ${availableFromAt.eventDay()} から ${dueAt.eventDay()}",
        )
    }
    if (before.userPriority != priority) {
        client.ingest("android_priority_changed", "タスクの強さを変更: ${title.trim()} / ${priority ?: "自動"}")
    }
}

private fun Long?.eventDay(): String =
    this?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalDate().toString() } ?: "指定なし"

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

private fun String.toRelativeDay(): Int? =
    trim().takeIf { it.isNotEmpty() }?.toIntOrNull()

private fun Int?.relativeDayLabel(): String =
    when (this) {
        null -> "任意"
        0 -> "当日"
        else -> if (this > 0) "+${this}日" else "${this}日"
    }
