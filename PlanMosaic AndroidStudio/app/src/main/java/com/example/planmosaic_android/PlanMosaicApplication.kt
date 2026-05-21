package com.example.planmosaic_android

import android.app.Application
import android.util.Log
import com.example.planmosaic_android.data.remote.AiApiClient
import com.example.planmosaic_android.data.remote.SupabaseClient
import com.example.planmosaic_android.util.AuthManager
import com.example.planmosaic_android.util.DataStoreManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class PlanMosaicApplication : Application() {

    lateinit var container: AppContainer
        private set

    val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)

        applicationScope.launch {
            try {
                val token = container.dataStoreManager.token.first()
                if (!token.isNullOrBlank()) {
                    Log.d("PlanMosaicApplication", "Token found in DataStore, length: ${token.length}")
                } else {
                    Log.d("PlanMosaicApplication", "No token found in DataStore")
                }
            } catch (e: Exception) {
                Log.e("PlanMosaicApplication", "Error reading token from DataStore", e)
            }
        }
    }
}

class AppContainer(private val app: Application) {
    val dataStoreManager = DataStoreManager.getInstance(app)
    val supabaseClient = SupabaseClient(
        url = BuildConfig.SUPABASE_URL,
        anonKey = BuildConfig.SUPABASE_ANON_KEY
    )
    val aiApiClient = AiApiClient()
    val authManager = AuthManager(supabaseClient, dataStoreManager)

    companion object {
        fun from(app: Application): AppContainer {
            return (app as PlanMosaicApplication).container
        }
    }
}