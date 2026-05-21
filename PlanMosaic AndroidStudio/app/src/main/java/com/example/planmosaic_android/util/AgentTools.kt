package com.example.planmosaic_android.util

import com.example.planmosaic_android.model.AppData
import com.example.planmosaic_android.model.Proposal
import com.example.planmosaic_android.util.agent.ToolDefinitions
import com.example.planmosaic_android.util.agent.ToolExecutors
import kotlinx.serialization.json.*

object AgentTools {

    val AI_TOOLS_JSON: List<JsonObject> get() = ToolDefinitions.AI_TOOLS_JSON
    val DEEP_PLANNING_TOOLS: List<JsonObject> get() = ToolDefinitions.DEEP_PLANNING_TOOLS

    data class ToolResult(
        val json: String,
        val shouldRefresh: Boolean = false,
        val updatedAppData: AppData? = null
    )

    fun executeTool(toolName: String, argsStr: String, appData: AppData): ToolResult {
        val routedName = ToolDefinitions.TOOL_ROUTING[toolName] ?: toolName
        val result = ToolExecutors.execute(routedName, argsStr, appData)
        return ToolResult(result.json, result.shouldRefresh, result.updatedAppData)
    }

    fun executeProposal(proposal: Proposal, appData: AppData): Pair<Boolean, String> {
        return ToolExecutors.executeProposal(proposal, appData)
    }
}