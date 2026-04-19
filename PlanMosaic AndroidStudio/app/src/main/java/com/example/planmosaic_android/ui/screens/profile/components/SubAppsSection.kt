package com.example.planmosaic_android.ui.screens.profile.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.planmosaic_android.ui.theme.AppColors
import com.example.planmosaic_android.util.DataStoreManager
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background

data class SubAppInfo(
    val id: String,
    val name: String,
    val description: String,
    val icon: ImageVector,
    val route: String
)

private val availableSubApps = listOf(
    SubAppInfo(
        id = "vocab",
        name = "WordMosaic",
        description = "词汇学习与AI助手",
        icon = Icons.Default.MenuBook,
        route = "vocab"
    )
)

@Composable
fun SubAppsSection(
    dataStoreManager: DataStoreManager,
    onNavigateToSubApp: (String) -> Unit
) {
    val scope = rememberCoroutineScope()
    val subappNavJson by dataStoreManager.subappNavVisible.collectAsStateWithLifecycle(initialValue = "{}")

    val visibility = remember(subappNavJson) {
        try {
            val obj = Json.parseToJsonElement(subappNavJson).jsonObject
            availableSubApps.associate { app ->
                val value = obj[app.id]?.jsonPrimitive
                app.id to (value?.boolean ?: false)
            }
        } catch (_: Exception) {
            availableSubApps.associate { it.id to false }
        }
    }

    Column {
        Text(
            text = "子应用",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 10.dp)
        )

        SettingsGroupCard {
            availableSubApps.forEachIndexed { index, app ->
                SubAppRow(
                    app = app,
                    visible = visibility[app.id] == true,
                    onToggle = { checked ->
                        scope.launch {
                            val currentObj = try {
                                Json.parseToJsonElement(subappNavJson).jsonObject
                            } catch (_: Exception) {
                                buildJsonObject {}
                            }
                            val updatedMap = currentObj.toMutableMap()
                            updatedMap[app.id] = JsonPrimitive(checked)
                            val newJson = buildJsonObject {
                                updatedMap.forEach { (k, v) -> put(k, v) }
                            }.toString()
                            dataStoreManager.saveSubappNavVisible(newJson)
                        }
                    },
                    onPreview = { onNavigateToSubApp(app.route) },
                    showDivider = index < availableSubApps.size - 1
                )
            }
        }
    }
}

@Composable
private fun SubAppRow(
    app: SubAppInfo,
    visible: Boolean,
    onToggle: (Boolean) -> Unit,
    onPreview: () -> Unit,
    showDivider: Boolean
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .sizeIn(minHeight = 64.dp)
                .clickable(onClick = onPreview, role = Role.Button)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(
                        color = AppColors.TodayGreen.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(10.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = app.icon,
                    contentDescription = null,
                    tint = AppColors.TodayGreen,
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = app.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = app.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Switch(
                    checked = visible,
                    onCheckedChange = onToggle,
                    colors = SwitchDefaults.colors(
                        checkedTrackColor = AppColors.TodayGreen,
                        checkedThumbColor = Color.White,
                        checkedBorderColor = AppColors.TodayGreen,
                        uncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant,
                        uncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        uncheckedBorderColor = AppColors.Outline
                    ),
                    modifier = Modifier.height(24.dp)
                )
                Text(
                    text = if (visible) "导航栏" else "预览",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (visible) AppColors.TodayGreen else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        if (showDivider) {
            HorizontalDivider(
                thickness = 1.dp,
                color = AppColors.Outline.copy(alpha = 0.5f),
                modifier = Modifier.padding(start = 70.dp, end = 16.dp)
            )
        }
    }
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