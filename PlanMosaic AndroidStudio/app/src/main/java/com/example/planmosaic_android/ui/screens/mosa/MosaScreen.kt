package com.example.planmosaic_android.ui.screens.mosa

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import com.example.planmosaic_android.R
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.planmosaic_android.model.ChatMessage

// ============ Quick Prompts for Deep Planning ============

private val DEEP_PLANNING_QUICK_PROMPTS = listOf(
    "我想梳理一下未来的方向" to "梳理方向",
    "帮我做一个SWOT分析" to "SWOT分析",
    "帮我把目标拆解成里程碑" to "里程碑规划",
    "帮我比较几个选择的利弊" to "决策对比",
    "评估一下某件事值不值得投入" to "ROI评估"
)

// ============ Main Screen ============

@Composable
fun MosaScreen(
    viewModel: MosaViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    val isDarkTheme = isSystemInDarkTheme()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .imePadding()
    ) {
        // Header with avatar and tabs
        Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
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
            }
            Spacer(modifier = Modifier.height(8.dp))
            MosaTabBar(
                currentTab = uiState.currentTab,
                onTabSelected = { viewModel.onEvent(MosaEvent.SwitchTab(it)) }
            )
        }

        HorizontalDivider(
            thickness = 1.dp,
            color = MaterialTheme.colorScheme.outline
        )

        // Content based on tab
        Box(modifier = Modifier.weight(1f)) {
            when (uiState.currentTab) {
                MosaTab.CHAT -> ChatPanel(viewModel = viewModel, uiState = uiState)
                MosaTab.DEEP_PLANNING -> DeepPlanningPanel(viewModel = viewModel, uiState = uiState)
            }
        }
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
    uiState: MosaUiState
) {
    val listState = rememberLazyListState()

    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
        items(
            items = uiState.messages,
            key = { "${it.role}-${it.timestamp}" }
        ) { message ->
            ChatBubble(message = message)
        }

        if (uiState.activeProposal != null) {
            item {
                ProposalCard(
                    proposal = uiState.activeProposal!!,
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

    HorizontalDivider(
        thickness = 1.dp,
        color = MaterialTheme.colorScheme.outline
    )

    ChatInputArea(
        text = uiState.inputText,
        isTyping = uiState.isTyping,
        onTextChange = { viewModel.onEvent(MosaEvent.UpdateInput(it)) },
        onSend = { viewModel.onEvent(MosaEvent.SendMessage) }
    )
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

    Column(modifier = Modifier.fillMaxSize()) {
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

    HorizontalDivider(
        thickness = 1.dp,
        color = MaterialTheme.colorScheme.outline
    )

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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .imePadding(),
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

// ============ Quick Prompt Chip ============

@Composable
private fun QuickPromptChip(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(
                MaterialTheme.colorScheme.secondaryContainer.copy(
                    alpha = if (enabled) 1f else 0.5f
                )
            )
            .clickable(
                enabled = enabled,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            )
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall.copy(
                fontWeight = FontWeight.Medium
            ),
            color = MaterialTheme.colorScheme.onSecondaryContainer
        )
    }
}

// ============ Chat Bubble ============

@Composable
fun ChatBubble(message: ChatMessage) {
    val isUser = message.role == "user"
    val screenWidthDp = LocalConfiguration.current.screenWidthDp

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
        Box(
            modifier = Modifier
                .widthIn(max = (screenWidthDp * 0.75).dp)
                .then(
                    if (!isUser) {
                        Modifier.shadow(
                            elevation = 2.dp,
                            shape = RoundedCornerShape(
                                topStart = 4.dp,
                                topEnd = 16.dp,
                                bottomStart = 16.dp,
                                bottomEnd = 16.dp
                            ),
                            spotColor = Color.Black.copy(alpha = 0.1f)
                        )
                    } else Modifier
                )
                .clip(
                    RoundedCornerShape(
                        topStart = if (isUser) 16.dp else 4.dp,
                        topEnd = if (isUser) 4.dp else 16.dp,
                        bottomStart = 16.dp,
                        bottomEnd = 16.dp
                    )
                )
                .background(
                    if (isUser) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.surface
                    }
                )
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            Text(
                text = formatMessageContent(message.content),
                style = MaterialTheme.typography.bodyMedium,
                color = if (isUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

// ============ Proposal Card ============

@Composable
fun ProposalCard(
    proposal: com.example.planmosaic_android.model.Proposal,
    onApprove: () -> Unit,
    onReject: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = when (proposal.type) {
                        "batch_delete_schedule" -> "批量删除日程"
                        "delete_task" -> "删除任务"
                        "update_task" -> "修改任务"
                        "delete_big_task" -> "删除大任务"
                        "update_big_task" -> "修改大任务"
                        "batch_delete_tasks" -> "批量删除任务"
                        "batch_delete_big_tasks" -> "批量删除大任务"
                        "modify_schedule" -> "日程修改建议"
                        else -> "操作确认"
                    },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            if (proposal.reason.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "原因：${proposal.reason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (proposal.dates.isNotEmpty()) {
                Text(
                    text = "将删除 ${proposal.dates.size} 个日期：${proposal.dates.take(3).joinToString()}${if (proposal.dates.size > 3) "..." else ""}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            if (proposal.changes.isNotEmpty()) {
                proposal.changes.forEach { change ->
                    Text(
                        text = "- $change",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(start = 8.dp, bottom = 2.dp)
                    )
                }
            }
            if (proposal.taskName.isNotEmpty()) {
                Text(
                    text = "任务：${proposal.taskName}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            if (proposal.oldTaskName.isNotEmpty()) {
                Text(
                    text = "重命名：${proposal.oldTaskName} → ${proposal.newTaskName}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            if (proposal.taskNames.isNotEmpty()) {
                Text(
                    text = "将删除 ${proposal.taskNames.size} 项：${proposal.taskNames.take(3).joinToString()}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            if (proposal.tasks.isNotEmpty()) {
                Text(
                    text = "将删除 ${proposal.tasks.size} 个任务",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
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
        Box(
            modifier = Modifier
                .widthIn(max = (LocalConfiguration.current.screenWidthDp * 0.75).dp)
                .shadow(
                    elevation = 2.dp,
                    shape = RoundedCornerShape(topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp),
                    spotColor = Color.Black.copy(alpha = 0.1f)
                )
                .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp))
                .background(MaterialTheme.colorScheme.surface)
                .padding(12.dp)
        ) {
            Text(
                text = "思考中...",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
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
