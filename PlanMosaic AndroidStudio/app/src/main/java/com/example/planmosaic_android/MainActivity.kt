package com.example.planmosaic_android


import androidx.compose.foundation.background
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Scaffold
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.planmosaic_android.ui.components.BottomNavBar
import com.example.planmosaic_android.ui.components.BottomNavItem
import com.example.planmosaic_android.ui.screens.mosa.MosaScreen
import com.example.planmosaic_android.ui.screens.profile.ProfileScreen
import com.example.planmosaic_android.ui.screens.schedule.ScheduleScreen
import com.example.planmosaic_android.ui.screens.vocab.VocabScreen
import com.example.planmosaic_android.ui.theme.LocalThemeState
import com.example.planmosaic_android.ui.theme.PlanMosaicTheme
import com.example.planmosaic_android.ui.theme.ThemeState
import com.example.planmosaic_android.util.DataStoreManager
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PlanMosaicApp()
        }
    }
}

private val coreNavItems = listOf(
    BottomNavItem("日程", Icons.Filled.CalendarMonth, "schedule"),
    BottomNavItem("Mosa", Icons.Filled.Chat, "mosa"),
    BottomNavItem("我的", Icons.Filled.Person, "profile")
)

private val subAppNavItems = mapOf(
    "vocab" to BottomNavItem("词汇", Icons.Filled.MenuBook, "vocab")
)

private val jsonParser = Json { ignoreUnknownKeys = true }

private fun parseSubappVisibility(json: String): Map<String, Boolean> {
    return try {
        val obj = jsonParser.parseToJsonElement(json).jsonObject
        obj.mapValues { it.value.jsonPrimitive.boolean }
    } catch (_: Exception) {
        emptyMap()
    }
}

@Composable
fun PlanMosaicApp() {
    val context = LocalContext.current
    val dataStoreManager = remember { DataStoreManager.getInstance(context) }
    val themePref by dataStoreManager.themePreference.collectAsStateWithLifecycle(initialValue = "system")

    // Determine dark theme state from preference
    val systemDarkTheme = isSystemInDarkTheme()
    val isDarkTheme = when (themePref) {
        "dark" -> true
        "light" -> false
        else -> systemDarkTheme
    }

    val themeState = remember(themePref, isDarkTheme) {
        ThemeState(
            preference = themePref,
            isDarkTheme = isDarkTheme,
            onToggleDarkMode = {
                val newPref = when (themePref) {
                    "dark" -> "light"
                    "light" -> "dark"
                    else -> if (isDarkTheme) "light" else "dark"
                }
                kotlinx.coroutines.MainScope().launch {
                    dataStoreManager.saveThemePreference(newPref)
                }
            }
        )
    }

    val subappNavJson by dataStoreManager.subappNavVisible.collectAsStateWithLifecycle(initialValue = "{}")
    val subappVisibility = remember(subappNavJson) { parseSubappVisibility(subappNavJson) }

    // Build dynamic nav items: core items + visible sub-apps inserted before "我的"
    val bottomNavItems = remember(subappVisibility) {
        val items = mutableListOf<BottomNavItem>()
        items.add(coreNavItems[0]) // 日程
        items.add(coreNavItems[1]) // Mosa
        // Insert visible sub-apps before profile
        subAppNavItems.forEach { (id, navItem) ->
            if (subappVisibility[id] == true) {
                items.add(navItem)
            }
        }
        items.add(coreNavItems[2]) // 我的
        items.toList()
    }

    PlanMosaicTheme(darkTheme = isDarkTheme) {
        androidx.compose.runtime.CompositionLocalProvider(
            LocalThemeState provides themeState
        ) {
            val navController = rememberNavController()
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentRoute = navBackStackEntry?.destination?.route

            Scaffold(
                modifier = Modifier.fillMaxSize(),
                bottomBar = {
                    BottomNavBar(
                        items = bottomNavItems,
                        currentRoute = currentRoute,
                        onItemClick = { route ->
                            navController.navigate(route) {
                                popUpTo("schedule") { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }
            ) { innerPadding ->
                NavHost(
                    navController = navController,
                    startDestination = "schedule",
                    modifier = Modifier.padding(innerPadding)
                ) {
                    composable("schedule") {
                        ScheduleScreen()
                    }
                    composable("mosa") {
                        MosaScreen()
                    }
                    composable("vocab") {
                        VocabScreen()
                    }
                    composable("profile") {
                        ProfileScreen(
                            onNavigateToSubApp = { route ->
                                navController.navigate(route) {
                                    popUpTo("schedule") { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}
