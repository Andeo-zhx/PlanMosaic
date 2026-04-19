package com.example.planmosaic_android.ui.screens.profile.components

import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.runtime.saveable.rememberSaveable
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Key
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.example.planmosaic_android.data.repository.ScheduleRepository
import com.example.planmosaic_android.util.DataStoreManager
import com.example.planmosaic_android.util.AuthManager
import com.example.planmosaic_android.ui.theme.AppColors
import com.example.planmosaic_android.model.AppData
import com.example.planmosaic_android.model.ApiKeys
import com.example.planmosaic_android.model.AgentSettings
import com.example.planmosaic_android.data.remote.SupabaseClient
import io.ktor.client.request.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApiSettingsSection(
    dataStoreManager: DataStoreManager,
    onMessage: (String) -> Unit
) {
    val scope = rememberCoroutineScope()
    val repository = remember { ScheduleRepository(dataStoreManager) }

    var deepseekKey by rememberSaveable { mutableStateOf("") }
    var qwenKey by rememberSaveable { mutableStateOf("") }
    var selectedProvider by rememberSaveable { mutableStateOf("deepseek") }
    var isTesting by rememberSaveable { mutableStateOf(false) }
    var testResult by rememberSaveable { mutableStateOf("") }
    var isProviderExpanded by remember { mutableStateOf(false) }
    var isSaving by rememberSaveable { mutableStateOf(false) }

    // Load existing settings
    LaunchedEffect(Unit) {
        val userId = AuthManager.userId
        val appData = if (userId != null) {
            try { repository.fullSync(userId) } catch (_: Exception) { repository.loadLocalData(userId) ?: AppData() }
        } else {
            AppData()
        }
        deepseekKey = appData.apiKeys.deepseek
        qwenKey = appData.apiKeys.qwen
        selectedProvider = appData.settings.aiProvider
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            // Section header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = Icons.Default.Key,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "AI 接口配置",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Provider selector
            Text(
                text = "AI 提供商",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 4.dp)
            )
            ExposedDropdownMenuBox(
                expanded = isProviderExpanded,
                onExpandedChange = { isProviderExpanded = it }
            ) {
                OutlinedTextField(
                    value = when (selectedProvider) {
                        "qwen" -> "Qwen 3.5"
                        else -> "DeepSeek"
                    },
                    onValueChange = {},
                    readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isProviderExpanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AppColors.Outline,
                        unfocusedBorderColor = AppColors.Outline,
                        focusedContainerColor = MaterialTheme.colorScheme.surface,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surface
                    )
                )
                ExposedDropdownMenu(
                    expanded = isProviderExpanded,
                    onDismissRequest = { isProviderExpanded = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("DeepSeek") },
                        onClick = {
                            selectedProvider = "deepseek"
                            isProviderExpanded = false
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("Qwen 3.5") },
                        onClick = {
                            selectedProvider = "qwen"
                            isProviderExpanded = false
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // API Key — show only for selected provider
            if (selectedProvider == "deepseek") {
                Text(
                    text = "DeepSeek API Key",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
                OutlinedTextField(
                    value = deepseekKey,
                    onValueChange = { deepseekKey = it },
                    placeholder = { Text("sk-...", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    modifier = Modifier.fillMaxWidth(),
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AppColors.Outline,
                        unfocusedBorderColor = AppColors.Outline,
                        focusedContainerColor = MaterialTheme.colorScheme.surface,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surface
                    )
                )
            } else {
                Text(
                    text = "Qwen 3.5 API Key",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
                OutlinedTextField(
                    value = qwenKey,
                    onValueChange = { qwenKey = it },
                    placeholder = { Text("sk-...", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    modifier = Modifier.fillMaxWidth(),
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AppColors.Outline,
                        unfocusedBorderColor = AppColors.Outline,
                        focusedContainerColor = MaterialTheme.colorScheme.surface,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surface
                    )
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Status indicator
            val hasKey = when (selectedProvider) {
                "qwen" -> qwenKey.isNotBlank()
                else -> deepseekKey.isNotBlank()
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (hasKey) Icons.Default.CheckCircle else Icons.Default.Close,
                    contentDescription = null,
                    tint = if (hasKey) AppColors.TodayGreenMuted else MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = if (hasKey) "已配置" else "未配置",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (hasKey) AppColors.TodayGreenMuted else MaterialTheme.colorScheme.error
                )
            }

            // Guide when not configured
            if (!hasKey) {
                Spacer(modifier = Modifier.height(14.dp))
                ApiKeyGuide(selectedProvider = selectedProvider)
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Save & Test buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = {
                        scope.launch {
                            isSaving = true
                            val userId = AuthManager.userId
                            val appData = if (userId != null) {
                                try { repository.fullSync(userId) } catch (_: Exception) { repository.loadLocalData(userId) ?: AppData() }
                            } else {
                                AppData()
                            }
                            val updated = appData.copy(
                                apiKeys = ApiKeys(deepseek = deepseekKey, qwen = qwenKey),
                                settings = AgentSettings(theme = appData.settings.theme, aiProvider = selectedProvider)
                            )
                            if (userId != null) {
                                repository.saveLocalData(userId, updated)
                            }
                            if (userId != null) {
                                repository.saveCloudData(userId, updated)
                            }
                            isSaving = false
                            onMessage("设置已保存")
                        }
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    ),
                    enabled = !isSaving
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("保存", color = MaterialTheme.colorScheme.onPrimary)
                    }
                }
                Button(
                    onClick = {
                        scope.launch {
                            isTesting = true
                            testResult = ""
                            val apiKey = when (selectedProvider) {
                                "qwen" -> qwenKey
                                else -> deepseekKey
                            }
                            if (apiKey.isBlank()) {
                                testResult = "请先输入API Key"
                                isTesting = false
                                return@launch
                            }
                            try {
                                val client = com.example.planmosaic_android.data.remote.SupabaseClient.httpClient
                                val url = if (selectedProvider == "qwen")
                                    "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
                                else
                                    "https://api.deepseek.com/v1/models"
                                val response = client.get(url) {
                                    header("Authorization", "Bearer $apiKey")
                                }
                                testResult = if (response.status.value == 200) "连接成功" else "连接失败: ${response.status.value}"
                            } catch (e: Exception) {
                                testResult = "连接失败: ${e.message}"
                            }
                            isTesting = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.secondary,
                        contentColor = Color.White
                    ),
                    enabled = !isTesting
                ) {
                    if (isTesting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("测试", color = Color.White)
                    }
                }
            }

            if (testResult.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = testResult,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (testResult.contains("成功"))
                        AppColors.TodayGreenMuted
                    else MaterialTheme.colorScheme.error
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "API Key 将自动同步到云端账户，在其他设备登录后可自动获取。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
@Composable
private fun ApiKeyGuide(selectedProvider: String) {
    val context = LocalContext.current
    val isQwen = selectedProvider == "qwen"

    val providerName = if (isQwen) "Qwen 3.5" else "DeepSeek"
    val registerUrl = if (isQwen)
        "https://dashscope.console.aliyun.com/"
    else
        "https://platform.deepseek.com/"
    val apiKeyUrl = if (isQwen)
        "https://dashscope.console.aliyun.com/apiKey"
    else
        "https://platform.deepseek.com/api_keys"
    val pricingUrl = if (isQwen)
        "https://help.aliyun.com/zh/model-studio/getting-started/models"
    else
        "https://api-docs.deepseek.com/zh-cn/quick_start/pricing"

    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.error.copy(alpha = 0.06f)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = "如何获取 $providerName API Key",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Step 1
            GuideStepRow(
                step = "1",
                text = "注册 ${providerName} 账号",
                linkText = "前往注册 →",
                onLinkClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(registerUrl)))
                }
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Step 2
            GuideStepRow(
                step = "2",
                text = "在控制台创建 API Key",
                linkText = "获取 Key →",
                onLinkClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apiKeyUrl)))
                }
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Step 3
            GuideStepRow(
                step = "3",
                text = "将 Key 粘贴到上方输入框，点击保存",
                linkText = null,
                onLinkClick = {}
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Pricing link
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(pricingUrl)))
                    }
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "查看 $providerName 模型价格与用量",
                    style = MaterialTheme.typography.bodySmall,
                    color = AppColors.TodayGreen,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.weight(1f))
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    tint = AppColors.TodayGreen,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

@Composable
private fun GuideStepRow(
    step: String,
    text: String,
    linkText: String?,
    onLinkClick: () -> Unit
) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .size(22.dp)
                .background(
                    color = AppColors.TodayGreen.copy(alpha = 0.15f),
                    shape = CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = step,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = AppColors.TodayGreen
            )
        }
        Spacer(modifier = Modifier.width(8.dp))
        Column {
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (linkText != null) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = linkText,
                    style = MaterialTheme.typography.labelMedium,
                    color = AppColors.TodayGreen,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable(onClick = onLinkClick, role = Role.Button)
                )
            }
        }
    }
}