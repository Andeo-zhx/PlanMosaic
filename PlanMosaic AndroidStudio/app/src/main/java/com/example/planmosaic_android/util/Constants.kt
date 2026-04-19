package com.example.planmosaic_android.util

object Constants {
    const val SUPABASE_URL = "https://nxbnognnkifiiitvbupq.supabase.co"
    const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Ym5vZ25ua2lmaWlpdHZidXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNTkzMDAsImV4cCI6MjA4OTczNTMwMH0.ATSkFMfkPF5O7w-q8mEkBVuatN9NKsJTNgQadwqJuUM"
    const val SUPABASE_RPC = SUPABASE_URL + "/rest/v1/rpc/"
    const val DATA_STORE_NAME = "planmosaic_prefs"
    const val KEY_USER_DATA = "user_data"
    const val KEY_CREDENTIALS = "credentials"
}

object WeekDays {
    val labels = listOf("日", "一", "二", "三", "四", "五", "六")
    val labelsFull = listOf("周日", "周一", "周二", "周三", "周四", "周五", "周六")
    val shortLabels = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
}
