package com.example.planmosaic_android.ui.screens.profile.common

import androidx.compose.ui.graphics.vector.ImageVector

data class SettingItem(
    val title: String,
    val subtitle: String = "",
    val icon: ImageVector,
    val onClick: () -> Unit
)

data class SwitchSettingItem(
    val title: String,
    val subtitle: String = "",
    val icon: ImageVector,
    val checked: Boolean,
    val onCheckedChange: (Boolean) -> Unit
)