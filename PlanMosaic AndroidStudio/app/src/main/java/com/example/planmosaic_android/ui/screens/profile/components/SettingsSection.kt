package com.example.planmosaic_android.ui.screens.profile.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.planmosaic_android.ui.screens.profile.common.DarkModeSettingRow
import com.example.planmosaic_android.ui.screens.profile.common.SettingItem
import com.example.planmosaic_android.ui.screens.profile.common.SettingRow
import com.example.planmosaic_android.ui.theme.AppColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSection(
    onShowApiSettings: () -> Unit,
    onSyncData: () -> Unit,
    isSyncing: Boolean,
    isDarkTheme: Boolean,
    onToggleDarkMode: () -> Unit,
    onLogout: () -> Unit
) {
    SettingsGroupCard {
        // AI Settings
        SettingRow(
            item = SettingItem(
                title = "AI 设置",
                subtitle = "配置 API 接口",
                icon = Icons.Default.SmartToy
            ) {
                onShowApiSettings()
            },
            showDivider = true
        )

        // Data Sync
        SettingRow(
            item = SettingItem(
                title = "数据同步",
                subtitle = if (isSyncing) "同步中…" else "同步本地与云端数据",
                icon = Icons.Default.Sync
            ) {
                if (!isSyncing) {
                    onSyncData()
                }
            },
            showDivider = true
        )

        // Dark Mode — real toggle
        DarkModeSettingRow(
            isDarkMode = isDarkTheme,
            onToggle = onToggleDarkMode
        )

        HorizontalDivider(
            thickness = 1.dp,
            color = AppColors.Outline.copy(alpha = 0.5f),
            modifier = Modifier.padding(start = 66.dp, end = 16.dp)
        )

        // Logout
        SettingRow(
            item = SettingItem(
                title = "退出登录",
                subtitle = "切换账户或重新登录",
                icon = Icons.Default.Logout
            ) {
                onLogout()
            },
            showDivider = false
        )
    }
    Spacer(modifier = Modifier.height(16.dp))
}

@Composable
private fun SettingsGroupCard(
    content: @Composable () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(vertical = 4.dp)) {
            content()
        }
    }
}