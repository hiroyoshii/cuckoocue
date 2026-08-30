package app.cuckoocue.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

object TaskStatus {
    const val Pending = "pending"
    const val Completed = "completed"
}

@Entity(tableName = "runs")
data class RunEntity(
    @PrimaryKey val id: String,
    val title: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)

@Entity(
    tableName = "run_tasks",
    foreignKeys = [
        ForeignKey(
            entity = RunEntity::class,
            parentColumns = ["id"],
            childColumns = ["run_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("run_id")],
)
data class RunTaskEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "run_id") val runId: String,
    val title: String,
    val status: String = TaskStatus.Pending,
    val version: Long = 0,
    val priority: Int = 2,
    @ColumnInfo(name = "category_key") val categoryKey: String = "focus",
    @ColumnInfo(name = "category_label") val categoryLabel: String = "Focus",
    @ColumnInfo(name = "category_color_key") val categoryColorKey: String = "teal",
    @ColumnInfo(name = "sort_order") val sortOrder: Int,
    @ColumnInfo(name = "completed_at") val completedAt: Long? = null,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)

@Entity(
    tableName = "focus_assignments",
    foreignKeys = [
        ForeignKey(
            entity = RunTaskEntity::class,
            parentColumns = ["id"],
            childColumns = ["task_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index(value = ["task_id"], unique = true),
        Index(value = ["slot"], unique = true),
    ],
)
data class FocusAssignmentEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "task_id") val taskId: String,
    val slot: Int,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
) {
    init {
        require(slot >= 0) { "Focus slot must be zero or greater." }
    }
}

data class FocusCue(
    val assignmentId: String,
    val taskId: String,
    val slot: Int,
    val title: String,
    val status: String,
    val version: Long,
    val priority: Int,
    val categoryKey: String,
    val categoryLabel: String,
    val categoryColorKey: String,
    val completedAt: Long?,
)
