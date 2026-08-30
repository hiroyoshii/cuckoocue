package app.cuckoocue

import android.app.Application
import app.cuckoocue.appearance.AppearanceRepository
import app.cuckoocue.data.CuckooRepository

class CuckooCueApp : Application() {
    val repository: CuckooRepository by lazy {
        CuckooRepository.getInstance(this)
    }

    val appearanceRepository: AppearanceRepository by lazy {
        AppearanceRepository.getInstance(this)
    }
}
