package app.cuckoocue.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "runs",
    indices = [
        Index("archived_at", "sort_order", "created_at"),
    ],
)
data class RunEntity(
    @PrimaryKey val id: String,
    val title: String,
    @ColumnInfo(name = "sort_order") val sortOrder: Int = 0,
    @ColumnInfo(name = "archived_at") val archivedAt: Long? = null,
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
    indices = [
        Index("run_id", "completed_at", "sort_order", "created_at"),
        Index("completed_at"),
    ],
)
data class RunTaskEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "run_id") val runId: String,
    val title: String,
    @ColumnInfo(name = "user_priority") val userPriority: Int? = null,
    @ColumnInfo(name = "due_at") val dueAt: Long? = null,
    @ColumnInfo(name = "sort_order") val sortOrder: Int,
    @ColumnInfo(name = "completed_at") val completedAt: Long? = null,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)

@Entity(
    tableName = "widget_cues",
    foreignKeys = [
        ForeignKey(
            entity = RunTaskEntity::class,
            parentColumns = ["id"],
            childColumns = ["task_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index("run_id"),
        Index("priority"),
    ],
)
data class WidgetCueEntity(
    @PrimaryKey
    @ColumnInfo(name = "task_id") val taskId: String,
    @ColumnInfo(name = "run_id") val runId: String,
    val priority: Int,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)

data class WidgetCue(
    val runId: String,
    val taskId: String,
    val title: String,
    val priority: Int,
    val dueAt: Long?,
    val completedAt: Long?,
)

data class CompleteMutationResult(
    val completed: Boolean,
    val removedFromWidget: Boolean,
)

data class WidgetCueCandidate(
    val runId: String,
    val taskId: String,
    val title: String,
    val userPriority: Int?,
    val dueAt: Long?,
)
