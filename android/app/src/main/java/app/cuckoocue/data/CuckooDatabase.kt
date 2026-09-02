package app.cuckoocue.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        RunEntity::class,
        RunTaskEntity::class,
        WidgetCueEntity::class,
    ],
    version = 8,
    exportSchema = true,
)
abstract class CuckooDatabase : RoomDatabase() {
    abstract fun dao(): CuckooDao

    companion object {
        @Volatile private var instance: CuckooDatabase? = null

        fun getInstance(context: Context): CuckooDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    CuckooDatabase::class.java,
                    "cuckoo.sqlite",
                ).fallbackToDestructiveMigration(true)
                    .build()
                    .also { instance = it }
            }
    }
}
