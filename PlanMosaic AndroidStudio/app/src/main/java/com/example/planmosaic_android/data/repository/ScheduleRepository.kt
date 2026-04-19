package com.example.planmosaic_android.data.repository

import android.util.Log
import com.example.planmosaic_android.data.remote.SupabaseClient
import com.example.planmosaic_android.data.remote.bool
import com.example.planmosaic_android.data.remote.obj
import com.example.planmosaic_android.model.AppData
import com.example.planmosaic_android.model.DaySchedule
import com.example.planmosaic_android.util.AuthManager
import com.example.planmosaic_android.util.DataStoreManager
import kotlinx.serialization.json.Json

class ScheduleRepository(
    private val dataStoreManager: DataStoreManager
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    // ============ Local per-account file operations ============

    suspend fun loadLocalData(userId: String): AppData? {
        val raw = dataStoreManager.loadUserDataForUser(userId)
        if (raw.isNullOrBlank()) return null
        return try {
            json.decodeFromString<AppData>(raw)
        } catch (e: Exception) {
            null
        }
    }

    suspend fun saveLocalData(userId: String, data: AppData) {
        dataStoreManager.saveUserDataForUser(userId, json.encodeToString(AppData.serializer(), data))
    }

    // ============ Cloud (Supabase RPC) operations ============

    suspend fun loadCloudData(userId: String): AppData? {
        Log.d("ScheduleRepository", "loadCloudData for userId: $userId")
        return try {
            val token = AuthManager.token
            Log.d("ScheduleRepository", "Using token: ${token != null}")
            val result = SupabaseClient.getUserData(userId, token)
            val success = result.bool("success")
            val exists = result.bool("exists")
            Log.d("ScheduleRepository", "Result: success=$success, exists=$exists, keys=${result.keys}")
            
            if (success && exists) {
                val scheduleDataElement = result["schedule_data"]
                if (scheduleDataElement == null) {
                    Log.w("ScheduleRepository", "success/exists but schedule_data is null")
                    return null
                }
                
                val scheduleDataStr = when (scheduleDataElement) {
                    is kotlinx.serialization.json.JsonObject -> {
                        Log.d("ScheduleRepository", "schedule_data is JsonObject, encoding directly")
                        json.encodeToString(
                            kotlinx.serialization.serializer<Map<String, kotlinx.serialization.json.JsonElement>>(),
                            scheduleDataElement
                        )
                    }
                    is kotlinx.serialization.json.JsonPrimitive -> {
                        Log.d("ScheduleRepository", "schedule_data is JsonPrimitive (string), parsing")
                        scheduleDataElement.content
                    }
                    else -> {
                        Log.w("ScheduleRepository", "schedule_data has unexpected type: ${scheduleDataElement::class}")
                        scheduleDataElement.toString()
                    }
                }
                
                Log.d("ScheduleRepository", "Parsing schedule data, length: ${scheduleDataStr.length}")
                val appData = json.decodeFromString<AppData>(scheduleDataStr)
                Log.d("ScheduleRepository", "Loaded cloud data: ${appData.schedules.size} schedules, ${appData.bigTasks.size} bigTasks")
                
                // Populate date field in DaySchedule from map key when missing
                val fixedSchedules = appData.schedules.mapValues { (dateStr, schedule) ->
                    if (schedule.date.isBlank()) schedule.copy(date = dateStr) else schedule
                }
                appData.copy(schedules = fixedSchedules)
            } else {
                if (!success) {
                    Log.w("ScheduleRepository", "get_user_data RPC failed (success=false)")
                } else if (!exists) {
                    Log.d("ScheduleRepository", "User data does not exist in cloud (first time user)")
                }
                null
            }
        } catch (e: Exception) {
            Log.e("ScheduleRepository", "Error loading cloud data", e)
            null
        }
    }

    suspend fun saveCloudData(userId: String, data: AppData): Boolean {
        Log.d("ScheduleRepository", "saveCloudData for userId: $userId, schedules: ${data.schedules.size}")
        return try {
            val token = AuthManager.token
            Log.d("ScheduleRepository", "Using token: ${token != null}")
            val dataStr = json.encodeToString(AppData.serializer(), data)
            val result = SupabaseClient.upsertUserData(userId, dataStr, token)
            val success = result.bool("success")
            Log.d("ScheduleRepository", "saveCloudData result: success=$success")
            success
        } catch (e: Exception) {
            Log.e("ScheduleRepository", "Error saving cloud data", e)
            false
        }
    }

    /**
     * Merge cloud data into local: add schedules that local doesn't have.
     */
    fun mergeCloudToLocal(local: AppData, cloud: AppData): AppData {
        val mergedSchedules = local.schedules.toMutableMap()
        for ((date, schedule) in cloud.schedules) {
            if (!mergedSchedules.containsKey(date)) {
                mergedSchedules[date] = schedule
            }
        }
        return local.copy(
            schedules = mergedSchedules,
            bigTasks = if (cloud.bigTasks.size > local.bigTasks.size) cloud.bigTasks else local.bigTasks,
            scheduleTemplates = if (cloud.scheduleTemplates.size > local.scheduleTemplates.size) cloud.scheduleTemplates else local.scheduleTemplates
        )
    }

    // ============ Full sync flow ============

    suspend fun fullSync(userId: String): AppData {
        Log.d("ScheduleRepository", "fullSync for userId: $userId")
        val local = loadLocalData(userId)
        Log.d("ScheduleRepository", "Local data: ${if (local != null) "present (${local.schedules.size} schedules)" else "null"}")
        val cloud = loadCloudData(userId)
        Log.d("ScheduleRepository", "Cloud data: ${if (cloud != null) "present (${cloud.schedules.size} schedules)" else "null"}")

        val merged = when {
            local != null && cloud != null -> {
                Log.d("ScheduleRepository", "Merging local and cloud data")
                mergeCloudToLocal(local, cloud)
            }
            local != null -> {
                Log.d("ScheduleRepository", "Using local data only")
                local
            }
            cloud != null -> {
                Log.d("ScheduleRepository", "Using cloud data only")
                cloud
            }
            else -> {
                Log.d("ScheduleRepository", "No data available, returning empty AppData")
                AppData()
            }
        }

        Log.d("ScheduleRepository", "Saving merged data locally for user: $userId")
        saveLocalData(userId, merged)
        Log.d("ScheduleRepository", "fullSync completed, merged data: ${merged.schedules.size} schedules")
        return merged
    }
}
