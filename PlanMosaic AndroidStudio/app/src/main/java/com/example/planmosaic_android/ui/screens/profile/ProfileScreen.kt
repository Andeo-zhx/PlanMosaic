package com.example.planmosaic_android.ui.screens.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.planmosaic_android.ui.theme.LocalThemeState
import com.example.planmosaic_android.ui.screens.profile.components.*
import com.example.planmosaic_android.ui.components.AgentFAB
import com.example.planmosaic_android.ui.components.AgentSheetContent
import com.example.planmosaic_android.ui.components.GlassSurface
import com.example.planmosaic_android.util.DataStoreManager
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBack: () -> Unit = {},
    onNavigateToSubApp: (String) -> Unit = {}
) {
    val viewModel: ProfileViewModel = viewModel()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val dataStoreManager = remember { DataStoreManager.getInstance(context) }
    val themeState = LocalThemeState.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var showAgentSheet by remember { mutableStateOf(false) }

    Scaffold(
        snackbarHost = {
            SnackbarHost(hostState = snackbarHostState) { data ->
                Snackbar(
                    snackbarData = data,
                    shape = RoundedCornerShape(12.dp),
                    containerColor = MaterialTheme.colorScheme.onSurface,
                    contentColor = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.padding(16.dp)
                )
            }
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
            ) {
                GlassSurface(
                    shape = RoundedCornerShape(0.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "返回"
                            )
                        }
                    }
                }

                if (uiState.showLogin || uiState.currentUser == null) {
                    LoginSection(
                        isLoading = uiState.isLoggingIn,
                        errorMessage = uiState.loginError,
                        onLogin = { username, password -> viewModel.login(username, password) },
                        onRegister = { username, password -> viewModel.register(username, password) }
                    )
                }

                val currentUser = uiState.currentUser
                if (currentUser != null && !uiState.showLogin) {
                    UserProfileHeader(username = currentUser.username)
                
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 24.dp)
                    ) {
                        item {
                            SettingsSection(
                                onShowApiSettings = { viewModel.toggleApiSettings() },
                                onSyncData = { viewModel.syncData() },
                                isSyncing = uiState.isSyncing,
                                isDarkTheme = themeState.isDarkTheme,
                                onToggleDarkMode = { themeState.onToggleDarkMode() },
                                onLogout = { viewModel.showLogoutConfirm() }
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                        }

                        item {
                            SubAppsSection(
                                dataStoreManager = dataStoreManager,
                                onNavigateToSubApp = onNavigateToSubApp
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                        }

                        if (uiState.showApiSettings) {
                            item {
                                ApiSettingsSection(
                                    dataStoreManager = dataStoreManager,
                                    onMessage = { message ->
                                        scope.launch {
                                            snackbarHostState.showSnackbar(
                                                message,
                                                duration = SnackbarDuration.Short
                                            )
                                        }
                                    }
                                )
                                Spacer(modifier = Modifier.height(40.dp))
                            }
                        }
                    }
                }
            }

            AgentFAB(
                onClick = { showAgentSheet = true },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
            )
        }
    }

    if (showAgentSheet) {
        ModalBottomSheet(
            onDismissRequest = { showAgentSheet = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = Color.Transparent,
            dragHandle = null
        ) {
            AgentSheetContent(onDismiss = { showAgentSheet = false })
        }
    }

    if (uiState.showLogoutConfirm) {
            AlertDialog(
                onDismissRequest = { viewModel.hideLogoutConfirm() },
                title = { Text(text = "退出登录") },
                text = { Text(text = "确定要退出登录吗？") },
                confirmButton = {
                    Button(
                        onClick = { viewModel.logout() },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Text(text = "退出", color = MaterialTheme.colorScheme.onError)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { viewModel.hideLogoutConfirm() }) {
                        Text(text = "取消")
                    }
                }
            )
        }
    }
}