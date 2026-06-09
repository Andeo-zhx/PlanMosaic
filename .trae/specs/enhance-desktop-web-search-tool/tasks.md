# Tasks

- [x] Task 1: 在 Python 后端实现真实网络搜索（主任务）
  - [x] SubTask 1.1: 在 `PlanMosaic Desktop/backend/tool_executor.py` 顶部新增模块级常量 `_WEB_SEARCH_CACHE`、`_WEB_SEARCH_CACHE_TTL_SECONDS = 300`、`_WEB_SEARCH_TIMEOUT_SECONDS = 5`
  - [x] SubTask 1.2: 实现 `_normalize_web_search_query(query)` 函数：strip 空白、合并连续空白、去除尾部 `?？!！.。` 标点
  - [x] SubTask 1.3: 实现 `_web_search_cache_get(key)` / `_web_search_cache_set(key, value)` 辅助函数
  - [x] SubTask 1.4: 实现 `_search_duckduckgo_instant_answer(client, query, timeout)`：调用 `https://api.duckduckgo.com/`，返回结构化 `results` 列表（每条 `{ title, snippet, source, url }`）
  - [x] SubTask 1.5: 实现 `_search_duckduckgo_html_fallback(client, query, timeout)`：调用 `https://html.duckduckgo.com/html/`，用正则解析 HTML 中的 `result__a` / `result__snippet` 节点
  - [x] SubTask 1.6: 实现 `_build_summary_text(results, max_chars=2400, snippet_cap=200)`：生成 LLM 易消费的纯文本摘要
  - [x] SubTask 1.7: 重写 `_execute_web_search(self, args, ...)`，按以下顺序处理：参数校验 → 缓存查找 → 主源搜索 → 主源空时回退 → 构造 `summary_text` 与 `citations` → 写入缓存 → 返回
  - [x] SubTask 1.8: 错误码映射：ConnectError/Timeout → `network_error` / `timeout`；HTTP 429 → `rate_limited`；其他非 200 → `api_error`
  - [x] SubTask 1.9: 每次调用都打印 `[WebSearch]` 日志：query、source、cache 命中、耗时（毫秒）
  - [x] SubTask 1.10: 修复 `_execute_web_search` 中 HTML 回退 URL 错误使用 `requests.utils.quote`（requests 未导入）导致 `NameError` 被静默吞掉的问题，改用 `_url_quote`
  - [x] SubTask 1.11: 引入全局超时预算 `_WEB_SEARCH_TOTAL_BUDGET_SECONDS = 8`（含主源 + 回退），单源请求用 `min(兜底超时, 剩余预算)`，避免「主源 8s 失败 + 回退 8s 失败 = 16s 等待」；剩余预算 < 1s 时跳过该源

- [x] Task 2: 升级 Node.js 侧（server.js）实现以保持一致
  - [x] SubTask 2.1: 在 `server.js` 顶部新增模块级 `webSearchCache = new Map()` 与 `WEB_SEARCH_CACHE_TTL_MS = 300000`
  - [x] SubTask 2.2: 提取 `_normalizeWebSearchQuery(query)` 工具函数（与 Python 端行为一致）
  - [x] SubTask 2.3: 重写 `case 'web_search_evaluate':` 块：缓存检查 → DuckDuckGo IA → 失败/空结果时回退到 `html.duckduckgo.com/html/` → 构造 `summary_text` 与 `citations` → 写入缓存 → 返回
  - [x] SubTask 2.4: 错误码与 Python 端完全一致（`timeout` / `network_error` / `rate_limited` / `api_error` / `missing_query`）
  - [x] SubTask 2.5: 引入简单 HTML 解析（零新增 npm 依赖，正则匹配 `result__a` 锚点和 `result__snippet` 文本）
  - [x] SubTask 2.6: 同步 Python 端全局预算：`WEB_SEARCH_TOTAL_BUDGET_MS = 8000` + `effectiveTimeoutMs()`，单源请求用 `min(兜底, 剩余)`，剩余 < 1s 跳过

- [x] Task 3: 更新工具定义描述（让 LLM 知道新字段）
  - [x] SubTask 3.1: 更新 `PlanMosaic Desktop/ai-tools.js` 中 `web_search_evaluate` 的 `description`：补充 `summary_text` / `fallback` / `error_code` 字段说明
  - [x] SubTask 3.2: 同步更新 `PlanMosaic Desktop/backend/tools.py` 中 `web_search_evaluate` 的 `description`（Python 后端用的工具 schema）

- [x] Task 4: 安全白名单与日志
  - [x] SubTask 4.1: 在 `PlanMosaic Desktop/main.js` 的 `ALLOWED_EXTERNAL_HOSTS` 中加入 `'api.duckduckgo.com'` 与 `'html.duckduckgo.com'`
  - [x] SubTask 4.2: 确认 Python 端日志前缀统一为 `[WebSearch]`

- [x] Task 5: 验证
  - [x] SubTask 5.1: 用 mock 替换 `httpx` 的 transport，写一个临时验证脚本（`PlanMosaic Desktop/backend/_verify_web_search.py`），覆盖以下场景：中文/英文 query 命中、无结果回退、超时、网络错误、缓存命中、参数缺失；共 14 个测试场景，含全局预算控制测试
  - [x] SubTask 5.2: `node --check PlanMosaic Desktop/server.js` 语法检查通过
  - [x] SubTask 5.3: `python -c "import ast; ast.parse(open('PlanMosaic Desktop/backend/tool_executor.py', encoding='utf-8').read())"` 语法检查通过
  - [x] SubTask 5.4: 验证脚本运行结果 `PASSED 14/14`，所有场景通过

# Task Dependencies
- Task 2 依赖 Task 1（先定 Python 端的契约，Node.js 端对齐）
- Task 3 依赖 Task 1、Task 2
- Task 4 依赖 Task 1
- Task 5 依赖 Task 1、Task 2、Task 3、Task 4
