# Checklist

## Python 后端（`PlanMosaic Desktop/backend/tool_executor.py`）

- [x] `_WEB_SEARCH_CACHE` / `_WEB_SEARCH_CACHE_TTL_SECONDS = 300` 模块级常量已定义
- [x] `_WEB_SEARCH_TIMEOUT_SECONDS = 5`（单源兜底超时）已定义
- [x] `_WEB_SEARCH_TOTAL_BUDGET_SECONDS = 8`（含主源+回退的全局预算）已定义
- [x] `_WEB_SEARCH_MIN_REMAINING_SECONDS = 1.0`（剩余预算阈值）已定义
- [x] `_normalize_web_search_query(query)` 实现并通过单元验证：去尾标点 + 合并空白
- [x] `_web_search_cache_get/set` 实现并能区分"未命中"与"已过期"
- [x] `_parse_duckduckgo_instant_answer` 实现：解析 `AbstractText` + `RelatedTopics`、返回结构化 results
- [x] `_parse_duckduckgo_html_fallback` 实现：调用 HTML 端点、用零依赖方式解析 `result__a` / `result__snippet`（用 `re` 即可）
- [x] `_build_summary_text(results, max_chars=2400, snippet_cap=200)` 实现并格式化 `[n] title — snippet (来源, URL)`
- [x] `_execute_web_search` 完整重写：参数校验 → 缓存 → 主源 → 回退 → summary → 写缓存 → 返回
- [x] 单源请求实际超时 = `min(兜底超时, 剩余预算)`，剩余 < 1s 时跳过该源（避免 16s 等待）
- [x] 错误码映射表完整：missing_query / timeout / network_error / rate_limited / api_error
- [x] `success: false` 时 `fallback: true` 与 `user_message` 都返回
- [x] 日志格式：`[WebSearch] query="..." source=... cache=hit|miss elapsed=NNNms`
- [x] HTML 回退 URL 使用 `_url_quote`（`urllib.parse.quote` 别名）进行 URL 编码，未使用未导入的 `requests`

## Node.js 侧（`PlanMosaic Desktop/server.js`）

- [x] 模块级 `webSearchCache = new Map()` 与 `WEB_SEARCH_CACHE_TTL_MS = 300000` 已定义
- [x] `WEB_SEARCH_TIMEOUT_MS = 5000`（单源兜底超时）已定义
- [x] `WEB_SEARCH_TOTAL_BUDGET_MS = 8000`（含主源+回退的全局预算）已定义
- [x] `WEB_SEARCH_MIN_REMAINING_MS = 1000`（剩余预算阈值）已定义
- [x] `normalizeWebSearchQuery(query)` 实现与 Python 端一致
- [x] `case 'web_search_evaluate':` 已重写：缓存 → 主源 → 回退 → summary → 写缓存 → 返回
- [x] 单源请求实际超时 = `min(兜底, 剩余)`，剩余 < 1s 时跳过该源
- [x] 返回结构与 Python 端字段完全一致（success / results / summary_text / citations / error_code / fallback / cached / total_found）
- [x] 错误码与 Python 端完全一致
- [x] HTML 解析用零新增依赖（`RegExp` 匹配即可）

## 工具定义

- [x] `PlanMosaic Desktop/ai-tools.js` 中 `web_search_evaluate` description 已补充 `summary_text` / `fallback` / `error_code` 提示
- [x] `PlanMosaic Desktop/backend/tools.py` 中 `web_search_evaluate` description 同步更新

## 安全白名单

- [x] `PlanMosaic Desktop/main.js` 中 `ALLOWED_EXTERNAL_HOSTS` 已包含 `api.duckduckgo.com`
- [x] `ALLOWED_EXTERNAL_HOSTS` 已包含 `html.duckduckgo.com`（HTML 回退已启用）

## 验证

- [x] `PlanMosaic Desktop/backend/_verify_web_search.py` 验证脚本存在，覆盖 14 类场景
- [x] 中文 query 验证：`query="如何高效学习英语听力？"` 返回 3 条结果（1 摘要 + 2 RelatedTopics）
- [x] 英文 query 验证：`query="how to learn piano"` 返回 2 条结果
- [x] 主源无结果 → 回退：mock API 返回空 RelatedTopics 时，HTML 回退解析 2 条结果，`source: "duckduckgo_html_fallback"`
- [x] 主源 + HTML 都空：`total_found: 0`，`summary_text: "未找到相关搜索结果..."`
- [x] 超时：mock API 抛 `httpx.TimeoutException` 时返回 `error_code: "timeout"` 且 `fallback: true`
- [x] 网络错误：mock API 抛 `httpx.ConnectError` 时返回 `error_code: "network_error"` 且 `fallback: true`
- [x] HTTP 429：mock API 返回 429 时返回 `error_code: "rate_limited"` 且 `fallback: true`
- [x] 缓存命中：相同 query 第二次调用 5 分钟内返回 `cached: true`
- [x] 参数缺失：`query=""` 或缺失时返回 `error_code: "missing_query"`，不发起网络请求
- [x] `summary_text` 长度：10 条超长结果拼接后总长 ≤ 2400 字符
- [x] `_normalize_web_search_query` 单元：尾部 `?？！!！.。` 标点、连续空白、None 输入
- [x] `_parse_duckduckgo_html_fallback` 单元：2 条标准 DuckDuckGo HTML 结构解析正确
- [x] **全局预算控制**：主源延迟 1.2s 后空结果 → HTML 回退 1.2s 后命中，整个调用 2.4s 内返回（在 8s 预算内）
- [x] `node --check PlanMosaic Desktop/server.js` 通过
- [x] `python -c "import ast; ast.parse(open('PlanMosaic Desktop/backend/tool_executor.py', encoding='utf-8').read())"` 通过
- [x] 验证脚本运行结果 `PASSED 14/14`
- [ ] Desktop 端真实启动后，Agent 在深度规划模式下调用 `web_search_evaluate`，ReAct 日志面板能看到 `Observation` 中包含 `summary_text` 字段（需在真实 Electron 应用中手动验证）
- [ ] `safeOpenExternal` 没有对 DuckDuckGo 域名发出 `Blocked` 警告（需在真实 Electron 应用中手动验证）
