# ReAct 日志文件导出 Spec

## Why
当前 ReAct 日志生成功能仅支持在 Modal 弹窗中展示和一键复制到剪贴板，用户无法将记录保存为独立文档文件。需要新增文件导出功能，将 Agent 的完整思考过程、工具调用参数和结果导出为可存档的文档文件。

同时，经过全量代码检查，项目中没有引入 LangChain、LlamaIndex 或任何其他高级 Agent 框架——AI Agent 使用的是原生 HTTP 请求调用 DeepSeek API 的 OpenAI Function Calling 格式，无需移除任何框架依赖。

## What Changes
- **ReAct 日志文件导出**: 在现有 ReAct 弹窗中新增「下载文件」按钮，支持导出为 `.txt` 纯文本文件和 `.md` Markdown 文件
- **ReAct 日志内容增强**: Observation 部分从截断 300 字符改为完整展示，确保工具返回结果不丢失信息
- **Electron 原生保存对话框**: Electron 环境下使用原生 `dialog.showSaveDialog` 选择保存路径；Web 模式下使用浏览器 download 机制
- **元数据头部**: 导出的文件头部包含生成时间、模型名称、对话轮次等元信息

## Impact
- Affected specs: `agent-framework-enhancement`（ReAct 转录功能增强）
- Affected code:
  - `server.js`（Desktop/）: `generateReActLog()` 增强——Observation 不再截断，添加元数据头部
  - `ai-agent.js`（Desktop/）: 新增 `downloadReActLog()` 函数，支持 .txt/.md 格式下载
  - `index.html`（Desktop/）: ReAct Modal 底部新增「导出 .txt」「导出 .md」按钮 + 样式
  - `preload.js`（Desktop/）: 新增 `saveReActFile` IPC 通道（Electron 原生保存对话框）
  - `main.js`（Desktop/）: 新增 `save-reAct-file` IPC handler

## ADDED Requirements

### Requirement: ReAct 日志文件导出
系统 SHALL 提供将 ReAct 格式日志导出为可下载文件的能力。

#### Scenario: 用户导出 .txt 文件（Electron 环境）
- **WHEN** 用户在 ReAct 弹窗中点击「导出 .txt」按钮
- **THEN** 弹出系统原生保存对话框，默认文件名为 `ReAct_日志_YYYY-MM-DD_HHmmss.txt`
- **AND** 文件内容包含元数据头部 + 完整 ReAct 日志

#### Scenario: 用户导出 .md 文件（Web 环境）
- **WHEN** 用户在非 Electron 环境中点击「导出 .md」按钮
- **THEN** 浏览器自动下载文件 `ReAct_日志_YYYY-MM-DD_HHmmss.md`
- **AND** 文件内容包含 Markdown 格式元数据头部 + 完整 ReAct 日志（Thought/Action/Observation 使用 Markdown 标题/代码块排版）

### Requirement: ReAct 日志内容完整性
系统 SHALL 在导出的 ReAct 日志中保留完整的工具调用返回结果，不做字符截断。

#### Scenario: Observation 内容不截断
- **WHEN** 工具调用返回的 Observation 内容超过 300 字符
- **THEN** 导出文件中 Observation 部分展示完整结果（Modal 弹窗中可保留截断以优化可读性）

### Requirement: 框架依赖检查
系统 SHALL NOT 依赖 LangChain、LlamaIndex 或任何高级 Agent 框架，AI Agent 使用原生 HTTP + OpenAI Function Calling 实现。

#### Scenario: 确认无框架依赖
- **WHEN** 扫描项目 `package.json` 和所有 `.js` 文件中的 `require`/`import` 语句
- **THEN** 不存在对 `langchain`、`llamaindex`、`llama_index` 或类似高级 Agent 框架的引用