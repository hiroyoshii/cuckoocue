package app.cuckoocue

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.lifecycle.lifecycleScope
import androidx.room.Room
import app.cuckoocue.appearance.AppearanceSettings
import app.cuckoocue.data.*
import kotlinx.coroutines.launch

/** Debug-only real screen with isolated Room data. Never modifies the user's database. */
class ListStartTestActivity : ComponentActivity() {
    private lateinit var db: CuckooDatabase
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        db = Room.inMemoryDatabaseBuilder(this, CuckooDatabase::class.java).build()
        lifecycleScope.launch {
            val state = intent.getStringExtra("state")
            if (state != "empty") {
                val completed = state == "completed"
                db.dao().insertRunAndTasks(
                    RunEntity(
                        id = "run",
                        title = "旅行の持ち物",
                        completedAnchorAt = if (completed) 2L else null,
                        createdAt = 1L,
                        updatedAt = 1L,
                    ),
                    listOf(
                        RunTaskEntity(
                            id = "task",
                            runId = "run",
                            title = "充電器を入れる",
                            completedAt = if (completed) 2L else null,
                            sortOrder = 0,
                            createdAt = 1L,
                            updatedAt = 1L,
                        ),
                    ),
                    2L,
                )
            }
            val repository = CuckooRepository(db.dao())
            setContent {
                val runs by repository.runs.collectAsState(emptyList())
                MaterialTheme(colorScheme = cuckooColorScheme(LocalCuckooColors.current, false)) {
                    RunListScreen(
                        repository = repository,
                        runs = runs,
                        appearanceSettings = AppearanceSettings(),
                        signedInUser = null,
                        signInError = null,
                        showAppearance = false,
                        onToggleAppearance = {},
                        onSignIn = {},
                        onSignOut = {},
                        onOpenRun = {},
                        onCreateRun = { name -> lifecycleScope.launch { repository.createRun(name) } },
                        onAppThemeChange = {},
                        onWidgetThemeChange = {},
                        onWidgetTextScaleChange = {},
                    )
                }
            }
        }
    }
    override fun onDestroy() { super.onDestroy(); db.close() }
}
