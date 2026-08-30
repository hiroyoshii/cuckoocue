package app.cuckoocue.data

import android.content.Context
import androidx.room.Database
import androidx.room.migration.Migration
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        RunEntity::class,
        RunTaskEntity::class,
        FocusAssignmentEntity::class,
    ],
    version = 2,
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
                ).addMigrations(MIGRATION_1_2)
                    .build()
                    .also { instance = it }
            }

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE run_tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 2")
                db.execSQL("ALTER TABLE run_tasks ADD COLUMN category_key TEXT NOT NULL DEFAULT 'focus'")
                db.execSQL("ALTER TABLE run_tasks ADD COLUMN category_label TEXT NOT NULL DEFAULT 'Focus'")
                db.execSQL("ALTER TABLE run_tasks ADD COLUMN category_color_key TEXT NOT NULL DEFAULT 'teal'")
            }
        }
    }
}
