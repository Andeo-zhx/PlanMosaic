# 完善 Desktop 端联网搜索工具

## Why

`web_search_evaluate` 工具在 Desktop 端目前的实现存在多处不足：
1. **Python 后端是占位实现**：`PlanMosaic Desktop/backend/tool_executor.py` 的 `_execute_web_search` 仍返回 `fallback: true` 的空结果（提示"网络搜索功能需要通过外部API调用实现"），但 Electron 桌面端实际走的是 Python 后端（main.js 委托给 FastAPI），所以工具在真实使用中完全没有联网能力。
2. **结果质量差**：Node.js 侧 (`server.js`) 之前的修复只用了 DuckDuckGo Instant Answer API，对中文查询极不友好（AbstractText / RelatedTopics 经常为空），且返回的内容是英文维基百科摘要，对 Mosa 的中文用户价值有限。
3. **缺少缓存与限流**：同一查询在短时间内会被重复请求，浪费网络资源。
4. **失败信息过于笼统**：网络错误时只返回"网络搜索暂时不可用"，AI 无法判断是关键词问题还是真实网络问题，难以自适应。
5. **没有给 LLM 优化的输出格式**：当前 `results` 是结构化数组，但对 LLM 来说，拼接成纯文本摘要更利于引用与综合。

## What Changes

- 在 Python 后端 `_execute_web_search` 中实现真实网络搜索，使用 DuckDuckGo Instant Answer API（无需密钥，零成本）作为主数据源，并增加超时与重试
- 增加二级回退数据源（备用 DuckDuckGo HTML 端点或 Brave Search 风格的去 HTML 抓取），主源无结果时自动尝试
- 增加内存级 TTL 缓存（默认 5 分钟），相同 query 在缓存命中时直接返回，附带 `cached: true` 标记
- 对中文 query 做轻量预处理（去除尾部标点、合并连续空白），提升 DuckDuckGo 命中率
- 改进结果格式：除了 `results` 数组外，再提供 `summary_text`（已拼接好的纯文本摘要，每条带编号与来源）和 `citations` 数组（结构化引用），方便 LLM 直接引用
- 错误信息细化：网络层错误、超时、限流、API 返回非 200 等不同情况返回不同 `error_code` 与 `user_message`，AI 可据此决定是否降级到自身知识
- Node.js 侧 (`server.js`) 同步升级：复用 Python 端的实现思路（缓存、错误码、`summary_text`），保持两边行为一致
- 在 `main.js` 的安全白名单 `ALLOWED_EXTERNAL_HOSTS` 中加入 `api.duckduckgo.com` 与 `html.duckduckgo.com`（如需 HTML 回退），保证 `safeOpenExternal` 不会误拦
- 日志：在 Python 端增加 `[WebSearch]` 前缀的可观测日志（query、source、耗时、cache 命中），便于调试

## Impact

- Affected specs: 联网搜索（`web_search_evaluate`）能力
- Affected code:
  - `PlanMosaic Desktop/backend/tool_executor.py` — `_execute_web_search`（主实现）
  - `PlanMosaic Desktop/server.js` — `case 'web_search_evaluate':`（保持一致）
  - `PlanMosaic Desktop/main.js` — `ALLOWED_EXTERNAL_HOSTS`（如启用 HTML 回退）
  - `PlanMosaic Desktop/ai-tools.js` — `web_search_evaluate` 工具描述（说明新的 `purpose` 字段含义）

## ADDED Requirements

### Requirement: Python 后端 web_search_evaluate 真实联网

系统 SHALL 在 `PlanMosaic Desktop/backend/tool_executor.py` 的 `_execute_web_search` 中实现真实网络搜索，调用 DuckDuckGo Instant Answer API。

#### Scenario: 中文 query 正常搜索
- **WHEN** Agent 调用 `web_search_evaluate`，传入 `query="如何高效学习英语听力"`
- **THEN** 后端调用 `https://api.duckduckgo.com/?q={encoded_query}&format=json&no_html=1&skip_disambig=1`
- **THEN** 8 秒超时，超时返回 `error_code: "timeout"`
- **THEN** 解析 `AbstractText` 与 `RelatedTopics` 数组，构造 `results`、`summary_text`、`citations`
- **THEN** 返回 `{ success: true, query, purpose, source: "duckduckgo_instant_answer", results, summary_text, citations, total_found }`

#### Scenario: 英文 query 正常搜索
- **WHEN** Agent 调用 `web_search_evaluate`，传入 `query="how to learn piano"`
- **THEN** 同上流程，应能命中 DuckDuckGo 维基百科摘要

#### Scenario: 主源无结果 → 自动回退
- **WHEN** DuckDuckGo Instant Answer 返回的 `AbstractText` 为空且 `RelatedTopics` 为空或仅有 Topic 嵌套但无 FirstURL
- **THEN** 自动尝试二级回退（`https://html.duckduckgo.com/html/?q={query}` 简单解析）
- **THEN** 若二级回退返回至少 1 条结果，`source: "duckduckgo_html_fallback"`
- **THEN** 若二级回退也无结果，返回 `{ success: true, query, results: [], summary_text: "未找到相关搜索结果，建议尝试其他关键词", total_found: 0, message: "未找到相关搜索结果..." }`

#### Scenario: 网络错误
- **WHEN** API 请求触发 `httpx.ConnectError` / `httpx.ReadTimeout` 等
- **THEN** 返回 `{ success: false, query, error_code: "network_error", error_message: "网络连接失败，请检查网络后重试", user_message: "Mosa将基于已有知识回答。", fallback: true }`

#### Scenario: API 限流 (HTTP 429)
- **WHEN** DuckDuckGo 返回 HTTP 429
- **THEN** 返回 `{ success: false, query, error_code: "rate_limited", error_message: "搜索服务暂时限流", user_message: "Mosa将基于已有知识回答。", fallback: true }`

#### Scenario: 缓存命中
- **WHEN** 同一 `query`（精确匹配）在 5 分钟内被再次调用
- **THEN** 直接返回缓存结果，并附加 `cached: true, cache_age_seconds: <n>`

#### Scenario: 参数缺失
- **WHEN** Agent 未传入 `query` 或 `query` 为空字符串
- **THEN** 返回 `{ success: false, error_code: "missing_query", error_message: "缺少 query 参数" }`，不发起网络请求

### Requirement: Node.js 侧实现行为一致

`server.js` 中 `case 'web_search_evaluate':` SHALL 与 Python 端保持相同返回结构（success、results、summary_text、citations、error_code、fallback、cached），确保历史调用点（`executeSingleToolCall`）不论走 Node.js 还是 Python 都得到一致结果。

#### Scenario: Node.js 侧缓存命中
- **WHEN** 同一 `query` 在 5 分钟内被再次调用（Node.js 端维护独立内存缓存）
- **THEN** 直接返回 `cached: true`

#### Scenario: Node.js 侧无结果
- **WHEN** DuckDuckGo Instant Answer 返回空
- **THEN** 返回与 Python 端相同格式的 `summary_text` 与 `total_found: 0`

### Requirement: 结果便于 LLM 消费

`summary_text` SHALL 是单字符串、按编号列出每条结果（格式：`[1] 标题 — 摘要片段 (来源: <source>, URL: <url>)`），且限制总长度不超过 2400 字符以避免 token 爆炸。`citations` 数组 SHALL 是结构化引用列表（title, snippet, source, url）。

#### Scenario: 多条结果汇总
- **WHEN** 返回 5 条结果
- **THEN** `summary_text` 类似：`[1] xxx — xxx (来源: Wikipedia, URL: ...)\n[2] ...\n...`
- **THEN** `citations` 数组按相同顺序列出 5 条
- **THEN** 单条 snippet 截断到 200 字以内

### Requirement: 工具定义描述更新

`ai-tools.js` 与 `backend/tools.py` 中 `web_search_evaluate` 的 description SHALL 明确说明：
- 该工具会先做 query 预处理（去标点、合并空白）
- 返回包含 `summary_text` 字段，AI 应优先使用 `summary_text` 作为综合来源
- 失败时 `fallback: true` 表示 AI 可基于自身知识回答
- `purpose` 字段是建议性（不影响搜索本身），帮助 LLM 记录意图

### Requirement: 错误恢复友好

当 `error_code` 为 `timeout` / `network_error` / `rate_limited` 时，`user_message` SHALL 给出可操作的建议（如"建议简化查询关键词后重试" / "请检查网络连接" / "请稍后重试"），AI 据此决定是降级到自身知识还是重试。

## MODIFIED Requirements

### Requirement: web_search_evaluate 工具在 Electron 端可用（原 fix-web-search-tool）

在原有"工具在 Electron 端可用"基础上，将实现从纯 Node.js 兜底升级为 Python + Node.js 双端实现，保持返回结构向后兼容（仍包含 `success` / `results` / `fallback`），新增字段（`summary_text` / `citations` / `error_code` / `cached`）为纯增量。

## REMOVED Requirements

无。
