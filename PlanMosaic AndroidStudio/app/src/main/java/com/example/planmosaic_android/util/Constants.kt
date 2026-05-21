package com.example.planmosaic_android.util

import com.example.planmosaic_android.BuildConfig

object Constants {
    val SUPABASE_URL: String get() = BuildConfig.SUPABASE_URL
    val SUPABASE_ANON_KEY: String get() = BuildConfig.SUPABASE_ANON_KEY
    val SUPABASE_RPC: String get() = "$SUPABASE_URL/rest/v1/rpc/"
    const val DATA_STORE_NAME = "planmosaic_prefs"
    const val KEY_USER_DATA = "user_data"
    const val KEY_CREDENTIALS = "credentials"
}

object WeekDays {
    val labels = listOf("日", "一", "二", "三", "四", "五", "六")
    val labelsFull = listOf("周日", "周一", "周二", "周三", "周四", "周五", "周六")
    val shortLabels = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
}
