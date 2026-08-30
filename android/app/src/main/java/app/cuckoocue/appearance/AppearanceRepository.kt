package app.cuckoocue.appearance

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.appearanceDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "appearance",
)

data class AppearanceSettings(
    val appTheme: AppThemeMode = AppThemeMode.System,
    val widgetTheme: WidgetThemeMode = WidgetThemeMode.FollowApp,
    val widgetTextScale: WidgetTextScale = WidgetTextScale.Standard,
)

enum class AppThemeMode {
    System,
    Light,
    Dark,
}

enum class WidgetThemeMode {
    FollowApp,
    Light,
    Dark,
}

enum class WidgetTextScale {
    Compact,
    Standard,
    Large,
}

class AppearanceRepository private constructor(
    private val dataStore: DataStore<Preferences>,
) {
    val settings: Flow<AppearanceSettings> = dataStore.data.map { preferences ->
        AppearanceSettings(
            appTheme = preferences[AppThemeKey].toEnumOrDefault(AppThemeMode.System),
            widgetTheme = preferences[WidgetThemeKey].toEnumOrDefault(WidgetThemeMode.FollowApp),
            widgetTextScale = preferences[WidgetTextScaleKey].toEnumOrDefault(WidgetTextScale.Standard),
        )
    }

    suspend fun getSettings(): AppearanceSettings = settings.first()

    suspend fun setAppTheme(mode: AppThemeMode) {
        dataStore.edit { it[AppThemeKey] = mode.name }
    }

    suspend fun setWidgetTheme(mode: WidgetThemeMode) {
        dataStore.edit { it[WidgetThemeKey] = mode.name }
    }

    suspend fun setWidgetTextScale(scale: WidgetTextScale) {
        dataStore.edit { it[WidgetTextScaleKey] = scale.name }
    }

    companion object {
        private val AppThemeKey = stringPreferencesKey("app_theme")
        private val WidgetThemeKey = stringPreferencesKey("widget_theme")
        private val WidgetTextScaleKey = stringPreferencesKey("widget_text_scale")

        @Volatile private var instance: AppearanceRepository? = null

        fun getInstance(context: Context): AppearanceRepository =
            instance ?: synchronized(this) {
                instance ?: AppearanceRepository(
                    context.applicationContext.appearanceDataStore,
                ).also { instance = it }
            }
    }
}

private inline fun <reified T : Enum<T>> String?.toEnumOrDefault(default: T): T =
    this?.let { value ->
        enumValues<T>().firstOrNull { it.name == value }
    } ?: default
