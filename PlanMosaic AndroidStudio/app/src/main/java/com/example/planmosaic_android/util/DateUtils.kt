package com.example.planmosaic_android.util

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.WeekFields
import java.util.Locale

object DateUtils {
    private const val DATE_FORMAT = "yyyy-MM-dd"
    private const val DISPLAY_FORMAT = "M月d日"
    private val dateFormatter = DateTimeFormatter.ofPattern(DATE_FORMAT)
    private val displayFormatter = DateTimeFormatter.ofPattern(DISPLAY_FORMAT, Locale.CHINA)
    private val weekFields = WeekFields.of(Locale.CHINA)

    fun today(): LocalDate = LocalDate.now()

    fun formatDate(date: LocalDate): String = date.format(dateFormatter)

    fun parseDate(dateStr: String): LocalDate = LocalDate.parse(dateStr, dateFormatter)

    fun formatDisplay(date: LocalDate): String = date.format(displayFormatter)

    fun getWeekDay(date: LocalDate): Int = date.dayOfWeek.value % 7 // 0=Sun

    fun getWeekDayLabel(date: LocalDate): String = WeekDays.labels[getWeekDay(date)]

    fun getWeekDayShortLabel(date: LocalDate): String = WeekDays.shortLabels[getWeekDay(date)]

    fun getWeekNumber(date: LocalDate): Int = date.get(weekFields.weekOfWeekBasedYear())

    fun getWeekDates(referenceDate: LocalDate = today()): List<LocalDate> {
        val monday = referenceDate.with(DayOfWeek.MONDAY)
        return (0L..6L).map { monday.plusDays(it) }
    }

    fun isToday(date: LocalDate): Boolean = date == today()

    fun isSameWeek(date1: LocalDate, date2: LocalDate): Boolean {
        return getWeekNumber(date1) == getWeekNumber(date2) && date1.year == date2.year
    }

    fun daysBetween(start: LocalDate, end: LocalDate): Long = ChronoUnit.DAYS.between(start, end)

    fun formatTimeRange(timeRange: String): String {
        val parts = timeRange.split("-")
        return if (parts.size == 2) "${parts[0].trim()}-${parts[1].trim()}" else timeRange
    }
}
