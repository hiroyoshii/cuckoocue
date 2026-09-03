package app.cuckoocue.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        RunEntity::class,
        RunTaskEntity::class,
        WidgetCueEntity::class,
    ],
    version = 10,
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
                ).addMigrations(Migration8To9, Migration9To10)
                    .fallbackToDestructiveMigration(true)
                    .build()
                    .also { instance = it }
            }

        private val Migration8To9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE run_tasks ADD COLUMN available_from_at INTEGER")
            }
        }

        private val Migration9To10 = object : Migration(9, 10) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE runs ADD COLUMN completed_anchor_at INTEGER")
                db.execSQL(
                    """
                    UPDATE runs
                    SET completed_anchor_at = (
                        SELECT MAX(completed_at)
                        FROM run_tasks
                        WHERE run_tasks.run_id = runs.id
                    )
                    WHERE EXISTS (
                        SELECT 1 FROM run_tasks
                        WHERE run_tasks.run_id = runs.id
                    )
                      AND NOT EXISTS (
                        SELECT 1 FROM run_tasks
                        WHERE run_tasks.run_id = runs.id
                          AND completed_at IS NULL
                    )
                    """.trimIndent(),
                )
            }
        }
    }
}
