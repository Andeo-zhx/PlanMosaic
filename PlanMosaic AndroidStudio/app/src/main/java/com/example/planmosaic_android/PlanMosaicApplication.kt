package com.example.planmosaic_android

import android.app.Application
import android.util.Log
import com.example.planmosaic_android.util.AuthManager
import com.example.planmosaic_android.util.DataStoreManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class PlanMosaicApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialize AuthManager with application context
        AuthManager.initialize(this)
        
        // Try to restore token from DataStore on app start
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val token = DataStoreManager.getInstance(this@PlanMosaicApplication).token.first()
                if (!token.isNullOrBlank()) {
                    // Note: We can't fully restore user without user_id and username from token.
                    // The token will be used when making authenticated requests.
                    // The actual user restoration should happen after login.
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
