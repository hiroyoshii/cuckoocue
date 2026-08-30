package app.cuckoocue.debug

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import app.cuckoocue.appearance.AppearanceRepository
import app.cuckoocue.appearance.AppThemeMode
import app.cuckoocue.appearance.WidgetTextScale
import app.cuckoocue.appearance.WidgetThemeMode
import app.cuckoocue.data.CuckooRepository
import app.cuckoocue.data.TaskStatus
import app.cuckoocue.widget.CuckooCueWidgetUpdater
import kotlinx.coroutines.runBlocking

class VerificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        runBlocking {
            val repository = CuckooRepository.getInstance(context)
            when (intent.action) {
                ACTION_RESET_SEED -> repository.resetToSeedData()
                ACTION_COMPLETE_FIRST_PENDING -> {
                    val cue = repository.getFocusCues()
                        .sortedBy { it.slot }
                        .firstOrNull { it.status == TaskStatus.Pending }
                    if (cue != null) {
                        repository.completeTask(cue.taskId, cue.version)
                    }
                }
                ACTION_UNDO_FIRST_COMPLETED -> {
                    val cue = repository.getFocusCues()
                        .sortedBy { it.slot }
                        .firstOrNull { it.status == TaskStatus.Completed }
                    if (cue != null) {
                        repository.undoCompleteTask(cue.taskId, cue.version)
                    }
                }
                ACTION_SET_APPEARANCE -> {
                    val appearanceRepository = AppearanceRepository.getInstance(context)
                    intent.getStringExtra(EXTRA_APP_THEME)?.toEnumOrNull<AppThemeMode>()?.let {
                        appearanceRepository.setAppTheme(it)
                    }
                    intent.getStringExtra(EXTRA_WIDGET_THEME)?.toEnumOrNull<WidgetThemeMode>()?.let {
                        appearanceRepository.setWidgetTheme(it)
                    }
                    intent.getStringExtra(EXTRA_WIDGET_TEXT_SCALE)?.toEnumOrNull<WidgetTextScale>()?.let {
                        appearanceRepository.setWidgetTextScale(it)
                    }
                }
                else -> return@runBlocking
            }
            CuckooCueWidgetUpdater.clearTransientUndoAndUpdateAll(context)
        }
    }

    companion object {
        const val ACTION_RESET_SEED = "app.cuckoocue.debug.RESET_SEED"
        const val ACTION_COMPLETE_FIRST_PENDING = "app.cuckoocue.debug.COMPLETE_FIRST_PENDING"
        const val ACTION_UNDO_FIRST_COMPLETED = "app.cuckoocue.debug.UNDO_FIRST_COMPLETED"
        const val ACTION_SET_APPEARANCE = "app.cuckoocue.debug.SET_APPEARANCE"
        const val EXTRA_APP_THEME = "app_theme"
        const val EXTRA_WIDGET_THEME = "widget_theme"
        const val EXTRA_WIDGET_TEXT_SCALE = "widget_text_scale"
    }
}

private inline fun <reified T : Enum<T>> String.toEnumOrNull(): T? =
    enumValues<T>().firstOrNull { it.name == this }
