package app.cuckoocue.data

import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

object PriorityExposure {
    const val Strong = 0
    const val Medium = 1
    const val Quiet = 2

    fun normalize(priority: Int): Int = priority.coerceIn(Strong, Quiet)

    fun compute(dueAt: Long?, now: Long = System.currentTimeMillis()): Int {
        if (dueAt == null) return Quiet
        val zoneId = ZoneId.systemDefault()
        val today = Instant.ofEpochMilli(now).atZone(zoneId).toLocalDate()
        val dueDay = Instant.ofEpochMilli(dueAt).atZone(zoneId).toLocalDate()
        val days = ChronoUnit.DAYS.between(today, dueDay)
        return when {
            days <= 0 -> Strong
            days <= 3 -> Medium
            else -> Quiet
        }
    }

    fun startOfDayOffset(offsetDays: Long, now: Long = System.currentTimeMillis()): Long {
        val zoneId = ZoneId.systemDefault()
        return Instant.ofEpochMilli(now)
            .atZone(zoneId)
            .toLocalDate()
            .plusDays(offsetDays)
            .atStartOfDay(zoneId)
            .toInstant()
            .toEpochMilli()
    }
}
