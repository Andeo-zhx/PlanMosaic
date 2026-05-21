package com.example.planmosaic_android.ui.screens.mosa

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import com.example.planmosaic_android.R
import com.example.planmosaic_android.ui.components.GlassSurface
import com.example.planmosaic_android.ui.components.ThinkingChain
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.planmosaic_android.model.ChatMessage
import com.example.planmosaic_android.model.Proposal

// ============ Quick Prompts for Deep Planning ============

private val DEEP_PLANNING_QUICK_PROMPTS = listOf(
    "我想梳理一下未来的方向" to "梳理方向",
    "帮我做一个SWOT分析" to "SWOT分析",
    "帮我把目标拆解成里程碑" to "里程碑规划",
    "帮我比较几个选择的利弊" to "决策对比",
    "评估一下某件事值不值得投入" to "ROI评估"
)

private val CHAT_WELCOME_QUICK_PROMPTS = listOf(
    "今天有什么日程安排？" to "今日日程",
    "帮我安排明天的计划" to "安排明天",
    "查看我这一周的待办" to "本周待办",
    "最近有什么重要事项？" to "重要事项"
)

// ============ Main Screen ============

@Composable
fun MosaScreen(
    onNavigate: (String) -> Unit = {},
    viewModel: MosaViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    var themeOverride by remember { mutableStateOf<String?>(null) }
    var showMenu by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val systemDark = isSystemInDarkTheme()
    val isDarkTheme = when (themeOverride) {
        "dark" -> true
        "light" -> false
        else -> systemDark
    }

    LaunchedEffect(Unit) {
        viewModel.onThemeChangeRequest = { theme ->
            themeOverride = theme
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .imePadding()
    ) {
        // Header with avatar and tabs - GlassSurface
        GlassSurface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            shape = RoundedCornerShape(20.dp)
        ) {
            Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Mosa Avatar - switches based on theme
                    Image(
                        painter = painterResource(
                            id = if (isDarkTheme) R.drawable.mosa_avatar_dark else R.drawable.mosa_avatar_light
                        ),
                        contentDescription = "Mosa Avatar",
                        modifier = Modifier
                            .size(80.dp)
                            .clip(CircleShape)
                    )
                    Text(
                        text = "Mosa",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    Box {
                        IconButton(onClick = { showMenu = true }) {
                            Icon(
                                Icons.Default.MoreVert,
                                contentDescription = "更多",
                                tint = MaterialTheme.colorScheme.onBackground
                            )
                        }
                        DropdownMenu(
                            expanded = showMenu,
                            onDismissRequest = { showMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("生成 ReAct 记录") },
                                onClick = {
                                    showMenu = false
                                    viewModel.onEvent(MosaEvent.GenerateReActLog)
                                }
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                MosaTabBar(
                    currentTab = uiState.currentTab,
                    onTabSelected = { viewModel.onEvent(MosaEvent.SwitchTab(it)) }
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Content based on tab
        Box(modifier = Modifier.weight(1f)) {
            when (uiState.currentTab) {
                MosaTab.CHAT -> ChatPanel(viewModel = viewModel, uiState = uiState, onNavigate = onNavigate)
                MosaTab.DEEP_PLANNING -> DeepPlanningPanel(viewModel = viewModel, uiState = uiState)
            }
        }
    }

    if (uiState.showReActDialog) {
        AlertDialog(
            onDismissRequest = { viewModel.onEvent(MosaEvent.DismissReActDialog) },
            title = {
                Text(
                    text = "ReAct 推理记录",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(
                    modifier = Modifier
                        .verticalScroll(rememberScrollState())
                        .heightIn(max = 400.dp)
                ) {
                    Text(
                        text = uiState.reactLogText,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                        lineHeight = 20.sp
                    )
                }
            },
            confirmButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        val clip = ClipData.newPlainText("ReAct Log", uiState.reactLogText)
                        clipboard.setPrimaryClip(clip)
                        Toast.makeText(context, "已复制到剪贴板", Toast.LENGTH_SHORT).show()
                    }) {
                        Text("复制")
                    }
                    TextButton(onClick = { viewModel.onEvent(MosaEvent.DismissReActDialog) }) {
                        Text("关闭")
                    }
                }
            }
        )
    }
}

// ============ Tab Bar ============

@Composable
private fun MosaTabBar(
    currentTab: MosaTab,
    onTabSelected: (MosaTab) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(4.dp)
    ) {
        MosaTab.values().forEach { tab ->
            val isSelected = tab == currentTab

            val bgColor by animateColorAsState(
                targetValue = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                label = "tabBg"
            )
            val contentColor by animateColorAsState(
                targetValue = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                label = "tabContent"
            )

            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(bgColor)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = { onTabSelected(tab) },
                        role = Role.Tab
                    )
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = when (tab) {
                        MosaTab.CHAT -> "日程助手"
                        MosaTab.DEEP_PLANNING -> "深度规划"
                    },
                    style = MaterialTheme.typography.labelLarge.copy(
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal
                    ),
                    color = contentColor
                )
            }
        }
    }
}

// ============ Normal Chat Panel ============

@Composable
private fun ChatPanel(
    viewModel: MosaViewModel,
    uiState: MosaUiState,
    onNavigate: (String) -> Unit = {}
) {
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) {
        viewModel.performStartupScan()
    }

    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }

    val showWelcome = uiState.messages.size <= 1

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.15f),
                        MaterialTheme.colorScheme.background.copy(alpha = 0f),
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.1f)
                    )
                )
            )
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
        if (showWelcome) {
            item(key = "welcome_area") {
                WelcomeArea(
                    uiState = uiState,
                    onQuickPrompt = { prompt ->
                        viewModel.onEvent(MosaEvent.SendChatQuickPrompt(prompt))
                    },
                    onNavigate = onNavigate
                )
            }
        }

        items(
            items = uiState.messages,
            key = { "${it.role}-${it.timestamp}" }
        ) { message ->
            ChatBubble(message = message)
        }

        uiState.activeProposal?.let { proposal ->
            item {
                ProposalCard(
                    proposal = proposal,
                    onApprove = {
                        viewModel.onEvent(MosaEvent.ApproveProposal(viewModel.getAppData()))
                    },
                    onReject = {
                        viewModel.onEvent(MosaEvent.RejectProposal)
                    }
                )
            }
        }

        if (uiState.isTyping) {
            item { TypingIndicator() }
        }

        if (uiState.error.isNotEmpty()) {
            item {
                Text(
                    text = uiState.error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(8.dp)
                )
            }
        }
    }

    if (uiState.hasConflict) {
        ConflictWarningCard(
            conflictMessage = uiState.conflictMessage,
            suggestedAlternative = uiState.suggestedAlternative,
            onForceAdd = { viewModel.onEvent(MosaEvent.ForceAddTask) },
            onAdjustTime = { viewModel.onEvent(MosaEvent.AdjustTaskTime) }
        )
    }

    ChatInputArea(
        text = uiState.inputText,
        isTyping = uiState.isTyping,
        onTextChange = { viewModel.onEvent(MosaEvent.UpdateInput(it)) },
        onSend = { viewModel.onEvent(MosaEvent.SendMessage) }
    )
    }
}

// ============ Welcome Area ============

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WelcomeArea(
    uiState: MosaUiState,
    onQuickPrompt: (String) -> Unit,
    onNavigate: (String) -> Unit = {}
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (uiState.isStartupScanning) {
            GlassSurface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "Mosa 正在了解你的日程...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else if (uiState.startupMessage != null) {
            Text(
                text = uiState.startupMessage,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )

            if (uiState.todayScheduleSummary.isNotEmpty()) {
                GlassSurface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "今日概览",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = uiState.todayScheduleSummary,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }

                TextButton(
                    onClick = { onNavigate("schedule") },
                    modifier = Modifier.align(Alignment.End)
                ) {
                    Text(
                        text = "查看完整日程 →",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }

            Text(
                text = "快速操作",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CHAT_WELCOME_QUICK_PROMPTS.forEach { (prompt, label) ->
                    QuickPromptChip(
                        text = label,
                        onClick = { onQuickPrompt(prompt) },
                        enabled = true
                    )
                }
            }
        }
    }
}

// ============ Deep Planning Panel ============

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DeepPlanningPanel(
    viewModel: MosaViewModel,
    uiState: MosaUiState
) {
    val listState = rememberLazyListState()

    LaunchedEffect(uiState.dpMessages.size) {
        if (uiState.dpMessages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.dpMessages.size - 1)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.15f),
                        MaterialTheme.colorScheme.background.copy(alpha = 0f),
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.1f)
                    )
                )
            )
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
        // Chat messages
        items(
            items = uiState.dpMessages,
            key = { "dp-${it.role}-${it.timestamp}" }
        ) { message ->
            ChatBubble(message = message)
        }

        if (uiState.dpIsTyping) {
            item { TypingIndicator() }
        }

        if (uiState.dpError.isNotEmpty()) {
            item {
                Text(
                    text = uiState.dpError,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(8.dp)
                )
            }
        }

        // Quick action buttons (shown below messages)
        item {
            Spacer(modifier = Modifier.height(8.dp))
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                DEEP_PLANNING_QUICK_PROMPTS.forEach { (prompt, label) ->
                    QuickPromptChip(
                        text = label,
                        onClick = {
                            viewModel.onEvent(MosaEvent.SendQuickPrompt(prompt))
                        },
                        enabled = !uiState.dpIsTyping
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
    }

    ChatInputArea(
        text = uiState.dpInputText,
        isTyping = uiState.dpIsTyping,
        onTextChange = { viewModel.onEvent(MosaEvent.UpdateDpInput(it)) },
        onSend = { viewModel.onEvent(MosaEvent.SendDpMessage) }
    )
    }
}

// ============ Shared Input Area ============

@Composable
private fun ChatInputArea(
    text: String,
    isTyping: Boolean,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit
) {
    GlassSurface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .imePadding(),
        shape = RoundedCornerShape(20.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
        OutlinedTextField(
            value = text,
            onValueChange = onTextChange,
            placeholder = {
                Text(
                    text = "输入消息...",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            },
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 44.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Color.Transparent,
                unfocusedBorderColor = Color.Transparent,
                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                cursorColor = MaterialTheme.colorScheme.onBackground,
                focusedTextColor = MaterialTheme.colorScheme.onBackground,
                unfocusedTextColor = MaterialTheme.colorScheme.onBackground
            ),
            shape = RoundedCornerShape(28.dp),
            maxLines = 4,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(
                onSend = {
                    if (text.isNotBlank()) {
                        onSend()
                    }
                }
            ),
            enabled = !isTyping
        )
        IconButton(
            onClick = onSend,
            modifier = Modifier
                .size(44.dp)
                .background(
                    color = if (text.isNotBlank() && !isTyping) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.outline
                    },
                    shape = RoundedCornerShape(28.dp)
                ),
            enabled = text.isNotBlank() && !isTyping
        ) {
            Icon(
                imageVector = Icons.Default.Send,
                contentDescription = "发送",
                tint = if (text.isNotBlank() && !isTyping) {
                    MaterialTheme.colorScheme.onPrimary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.size(18.dp)
            )
        }
        }
    }
}

// ============ Quick Prompt Chip ============

@Composable
private fun QuickPromptChip(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    GlassSurface(
        modifier = Modifier
            .clickable(
                enabled = enabled,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ),
        shape = RoundedCornerShape(20.dp),
        borderAlpha = if (enabled) 0.15f else 0.05f
    ) {
        Box(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontWeight = FontWeight.Medium
                ),
                color = if (enabled) {
                    MaterialTheme.colorScheme.onSurface
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                }
            )
        }
    }
}

// ============ Chat Bubble ============

@Composable
fun ChatBubble(message: ChatMessage) {
    val isUser = message.role == "user"
    val screenWidthDp = LocalConfiguration.current.screenWidthDp
    val bubbleShape = RoundedCornerShape(
        topStart = if (isUser) 16.dp else 4.dp,
        topEnd = if (isUser) 4.dp else 16.dp,
        bottomStart = 16.dp,
        bottomEnd = 16.dp
    )

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
    ) {
        if (!isUser) {
            Text(
                text = "Mosa",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp, bottom = 4.dp)
            )
        }

        if (message.thinkingContent.isNotEmpty()) {
            ThinkingChain(
                thinkingContent = message.thinkingContent,
                modifier = Modifier.padding(bottom = 4.dp)
            )
        }

        if (isUser) {
            Box(
                modifier = Modifier
                    .widthIn(max = (screenWidthDp * 0.75).dp)
                    .clip(bubbleShape)
                    .background(
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.75f)
                    )
                    .padding(horizontal = 14.dp, vertical = 10.dp)
            ) {
                Text(
                    text = formatMessageContent(message.content),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimary
                )
            }
        } else {
            GlassSurface(
                modifier = Modifier.widthIn(max = (screenWidthDp * 0.75).dp),
                shape = bubbleShape
            ) {
                Box(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)
                ) {
                    Text(
                        text = formatMessageContent(message.content),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }
    }
}

// ============ Proposal Card ============

@Composable
fun ProposalCard(
    proposal: Proposal,
    onApprove: () -> Unit,
    onReject: () -> Unit
) {
    val title = when (proposal) {
        is Proposal.BatchDeleteSchedule -> "批量删除日程"
        is Proposal.DeleteTask -> "删除任务"
        is Proposal.UpdateTask -> "修改任务"
        is Proposal.DeleteBigTask -> "删除大任务"
        is Proposal.UpdateBigTask -> "修改大任务"
        is Proposal.BatchDeleteTasks -> "批量删除任务"
        is Proposal.BatchDeleteBigTasks -> "批量删除大任务"
        is Proposal.ModifySchedule -> "日程修改建议"
        is Proposal.ApplyTemplate -> "应用模板"
    }

    val reason = when (proposal) {
        is Proposal.BatchDeleteSchedule -> proposal.reason
        is Proposal.DeleteTask -> proposal.reason
        is Proposal.UpdateTask -> proposal.reason
        is Proposal.DeleteBigTask -> proposal.reason
        is Proposal.UpdateBigTask -> proposal.reason
        is Proposal.BatchDeleteTasks -> proposal.reason
        is Proposal.BatchDeleteBigTasks -> proposal.reason
        is Proposal.ModifySchedule -> proposal.reason
        is Proposal.ApplyTemplate -> ""
    }

    GlassSurface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            if (reason.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "原因：$reason",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            when (proposal) {
                is Proposal.BatchDeleteSchedule -> {
                    Text(
                        text = "将删除 ${proposal.dates.size} 个日期：${proposal.dates.take(3).joinToString()}${if (proposal.dates.size > 3) "..." else ""}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                is Proposal.ModifySchedule -> {
                    proposal.changes.forEach { change ->
                        Text(
                            text = "- $change",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(start = 8.dp, bottom = 2.dp)
                        )
                    }
                }
                is Proposal.DeleteTask -> {
                    Text(
                        text = "任务：${proposal.taskName}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                is Proposal.UpdateTask -> {
                    Text(
                        text = "重命名：${proposal.oldTaskName} → ${proposal.newTaskName}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                is Proposal.BatchDeleteBigTasks -> {
                    Text(
                        text = "将删除 ${proposal.taskNames.size} 项：${proposal.taskNames.take(3).joinToString()}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                is Proposal.BatchDeleteTasks -> {
                    Text(
                        text = "将删除 ${proposal.tasks.size} 个任务",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                is Proposal.DeleteBigTask -> {
                    Text(
                        text = "大任务：${proposal.taskName}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                is Proposal.UpdateBigTask -> {
                    Text(
                        text = "修改：${proposal.oldTaskName}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                is Proposal.ApplyTemplate -> {
                    Text(
                        text = "将模板 ${proposal.templateName} 应用到 ${proposal.targetDate}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End)
            ) {
                TextButton(
                    onClick = onReject,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text("取消")
                }
                Button(
                    onClick = onApprove,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text("确认", color = MaterialTheme.colorScheme.onPrimary)
                }
            }
        }
    }
}

// ============ Typing Indicator ============

@Composable
fun TypingIndicator() {
    Column(
        modifier = Modifier.padding(vertical = 4.dp)
    ) {
        Text(
            text = "Mosa",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp, bottom = 4.dp)
        )
        GlassSurface(
            modifier = Modifier.widthIn(max = (LocalConfiguration.current.screenWidthDp * 0.75).dp),
            shape = RoundedCornerShape(
                topStart = 4.dp,
                topEnd = 16.dp,
                bottomStart = 16.dp,
                bottomEnd = 16.dp
            )
        ) {
            Box(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = "思考中...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

// ============ Conflict Warning Card ============

@Composable
private fun ConflictWarningCard(
    conflictMessage: String,
    suggestedAlternative: String,
    onForceAdd: () -> Unit,
    onAdjustTime: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.6f)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "⚠️",
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = "时段冲突",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = conflictMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
            if (suggestedAlternative.isNotEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = suggestedAlternative,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    fontWeight = FontWeight.Medium
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End)
            ) {
                TextButton(
                    onClick = onForceAdd,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.onErrorContainer
                    )
                ) {
                    Text("仍然添加")
                }
                Button(
                    onClick = onAdjustTime,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text("调整时间", color = MaterialTheme.colorScheme.onPrimary)
                }
            }
        }
    }
}

// ============ Message Formatting ============

private fun formatMessageContent(content: String): AnnotatedString {
    return buildAnnotatedString {
        var remaining = content
        while (remaining.isNotEmpty()) {
            val boldRange = remaining.indexOf("**")
            if (boldRange >= 0) {
                if (boldRange > 0) append(remaining.substring(0, boldRange))
                val afterBold = remaining.substring(boldRange + 2)
                val endBold = afterBold.indexOf("**")
                if (endBold >= 0) {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                        append(afterBold.substring(0, endBold))
                    }
                    remaining = afterBold.substring(endBold + 2)
                } else {
                    append(remaining)
                    break
                }
            } else {
                append(remaining.replace("\\n", "\n"))
                break
            }
        }
    }
}
