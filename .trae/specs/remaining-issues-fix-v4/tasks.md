# Tasks

## 🔴 紧急修复（B1-B6）

- [x] Task B1: 修复 appConfig 重构后 API Key 引用断裂（main.js）
  - [x] SubTask B1.1: 全局搜索 main.js 中残留的旧全局变量引用（`DEEPSEEK_API_KEY`、`QWEN_API_KEY`、`MODEL_NAME`、`currentProvider` 等独立变量）
  - [x] SubTask B1.2: 将每个引用替换为 `appConfig.deepseek.key`、`appConfig.qwen.key`、`appConfig.deepseek.model`、`appConfig.provider` 等
  - [x] SubTask B1.3: 同步修复 index.html 中设置面板对 API Key 读写路径
  - **验证**: `node --check main.js` 通过，且代码中 grep 不到旧变量名

- [x] Task B2: config.json 不存在时自动创建默认配置（backend/config.py）
  - [x] SubTask B2.1: 在 `load_config()` 中添加 `os.path.exists()` 检查
  - [x] SubTask B2.2: 文件不存在时创建包含合理默认值的 config.json（provider: deepseek, model: deepseek-chat）
  - **验证**: 删除 config.json 后启动后端不崩溃，自动生成新配置文件

- [x] Task B3: 日程保存失败时显示错误提示（index.html）
  - [x] SubTask B3.1: 找到 `saveScheduleDirectly` 函数
  - [x] SubTask B3.2: IPC 和 fetch 回退均失败后调用 `showToast('保存失败，请检查网络连接', 'error')`
  - **验证**: 停止 Python 后端后点击保存，显示 toast 而非白屏

- [x] Task B4: appConfig.settings 添加默认值（main.js）
  - [x] SubTask B4.1: 在 `loadSettings()` 中为 `appConfig.settings` 设置默认值
  - [x] SubTask B4.2: 默认值: `{ enableTimeout: true, timeoutMs: 30000, rejectUnauthorized: true }`
  - **验证**: 首次启动（无 settings.json）时不报 `undefined` 错误

- [x] Task B5: 备份文件名使用毫秒级时间戳（server.py + tool_executor.py）
  - [x] SubTask B5.1: `_create_backup` 中的 `datetime.now().strftime` 改为包含 `%f`（微秒）
  - [x] SubTask B5.2: 同步修改 `tool_executor.py` 中的 `_create_backup`
  - **验证**: 同一秒内两次写入生成不同备份文件名

- [x] Task B6: 深度规划添加系统 prompt（server.py + config.py）
  - [x] SubTask B6.1: 在 config.py 添加 `DEEP_PLANNING_SYSTEM_PROMPT` 常量
  - [x] SubTask B6.2: `_handle_deep_planning_chat` 将 system prompt 作为 messages[0] 注入
  - **验证**: 深度规划模式下 LLM 回复包含日程规划结构

## 🟡 高优先级（M1-M12）

- [x] Task M1: 页面卸载时清理所有定时器（index.html）
  - [x] SubTask M1.1: 收集所有 `setInterval` 和 `setTimeout` 的 ID
  - [x] SubTask M1.2: 在 `window.onbeforeunload` 中统一 `clearInterval` / `clearTimeout`
  - **验证**: DevTools 中无残留 timer

- [x] Task M2: 日程渲染 Date 对象缓存（index.html）
  - [x] SubTask M2.1: `renderCalendar` 开头计算一次 `today`、`monthStart`、`monthEnd`
  - [x] SubTask M2.2: 将计算结果传入子渲染函数，避免重复 `new Date()`
  - **验证**: 月视图渲染时 `new Date()` 调用次数 < 3

- [x] Task M3: 工具执行器所有分支添加返回值（tool_executor.py）
  - [x] SubTask M3.1: 逐个检查 11 个 `execute_*` 方法的所有代码路径
  - [x] SubTask M3.2: 每个分支末尾添加显式 return（成功返回修改后的 data，失败返回 None 或错误信息）
  - **验证**: `python -m py_compile` 通过，所有分支有 return

- [x] Task M4: 收紧 removeListener 通道白名单（preload.js）
  - [x] SubTask M4.1: `ALLOWED_REMOVE_CHANNELS` 仅保留 `agent-stream-chunk`、`agent-stream-done`、`agent-stream-status`、`agent-stream-error`
  - [x] SubTask M4.2: 移除所有非 agent 流式相关的通道
  - **验证**: `node --check preload.js` 通过

- [x] Task M5: 生产模式 CORS 限域（server.py）
  - [x] SubTask M5.1: 检查 `ENV` 或配置文件决定是否生产模式
  - [x] SubTask M5.2: 生产模式 `allow_origins` 限为 `["http://localhost", "file://"]`
  - [x] SubTask M5.3: 移除无效的 `allow_credentials=True` + `allow_origins=["*"]` 组合
  - **验证**: 生产模式下外部域名的跨域请求被拒绝

- [x] Task M6: 大日程列表分批渲染（index.html）
  - [x] SubTask M6.1: `renderCalendar` 中添加日程数量检查（> 50 条）
  - [x] SubTask M6.2: 超限时使用 `requestAnimationFrame` 分批插入 DOM
  - **验证**: 100 条日程月视图渲染 < 100ms

- [x] Task M7: 对话历史上限（ai-agent.js）
  - [x] SubTask M7.1: 在 `addToHistory` 中添加 `conversationHistory.length > 100` 检查
  - [x] SubTask M7.2: 超出时自动归档最旧 50 条到 `archivedConversations`，保持最近 50 条
  - [x] SubTask M7.3: 发送消息时只取最近 50 条作为 LLM 上下文
  - **验证**: 对话超过 100 轮后数组长度保持 ≤ 50

- [x] Task M8: Webview 加载失败显示错误页（main.js）
  - [x] SubTask M8.1: `did-fail-load` 回调中通过 `webview.executeJavaScript` 注入错误页面 HTML
  - [x] SubTask M8.2: 错误页包含"加载失败"提示和"重试"按钮，点击触发 `webview.reload()`
  - **验证**: 断网时打开 WordMosaic 显示错误页而非白屏

- [x] Task M9: Python 后端进程守护（main.js）
  - [x] SubTask M9.1: `pythonProcess.on('exit', ...)` 中检查退出码
  - [x] SubTask M9.2: 非正常退出时延迟 2 秒自动重启（最多 3 次）
  - [x] SubTask M9.3: 3 次重启失败后发送 IPC 事件通知渲染进程显示错误提示
  - **验证**: 手动 kill Python 进程后 2 秒内自动重启

- [x] Task M10: 打包配置包含 backend 目录（package.json）
  - [x] SubTask M10.1: `extraResources` 添加 `{ "from": "../backend", "to": "backend", "filter": ["**/*"] }`
  - [x] SubTask M10.2: 确保 Python 依赖（如 httpx、uvicorn）说明在文档中
  - **验证**: `npm run build` 后 EXE 解压包含 backend/ 目录

- [x] Task M11: 多用户数据目录隔离（paths.js + paths.py）
  - [x] SubTask M11.1: `getDataFilePath()` 改为按用户名 hash 分目录（如 `data/{user_hash}/data.json`）
  - [x] SubTask M11.2: `paths.py` 的 `get_data_file_path()` 同样进行用户隔离
  - [x] SubTask M11.3: 首次启动时迁移旧数据到新目录结构
  - **验证**: 切换账号后读取不同文件，互不干扰

- [x] Task M12: SSE 解析器处理多字节字符（main.js）
  - [x] SubTask M12.1: 行分割前检查 buffer 末尾是否为不完整的 UTF-8 多字节序列
  - [x] SubTask M12.2: 不完整时保留在 buffer 中等待下一个 chunk
  - **验证**: 流式传输含中文 emoji 的消息不截断

## 🟢 低优先级（L1-L6）

- [x] Task L1: console 日志分级（main.js + ai-agent.js + index.html）
  - [x] SubTask L1.1: 错误和异常用 `console.error`，警告用 `console.warn`，调试信息用 `console.debug`
  - [x] SubTask L1.2: 生产模式下 `console.log` 静默（已有 L1 实现），保留 `console.error`
  - **验证**: 生产构建中调试信息不可见，错误信息仍可见

- [x] Task L2: 中文字符串集中管理标记（index.html + ai-agent.js）
  - [x] 在文件顶部添加 `// TODO i18n: 中文硬编码字符串标记` 注释
  - **验证**: 注释已添加

- [x] Task L3: Ctrl+S 快捷键冲突处理（index.html）
  - [x] SubTask L3.1: 检查当前焦点是否在日程编辑区域
  - [x] SubTask L3.2: 在日程编辑区域时拦截 Ctrl+S 执行自定义保存 + `e.preventDefault()`
  - **验证**: 日程编辑区 Ctrl+S 保存日程不弹出浏览器保存对话框

- [x] Task L4: CSS 选择器简化标记（index.html）
  - [x] 在 CSS 区域顶部添加 `/* TODO: 未来迭代简化深层级选择器 */` 注释
  - **验证**: 注释已添加

- [x] Task L5: 离线模式降级提示（ai-agent.js + index.html）
  - [x] SubTask L5.1: `sendAgentMessage` 前检查 `navigator.onLine`
  - [x] SubTask L5.2: 离线时显示 toast "当前处于离线状态，AI 功能不可用"
  - [x] SubTask L5.3: 添加 `window.addEventListener('online'/'offline')` 监听网络状态
  - **验证**: 断网后发送消息显示离线提示 toast

- [x] Task L6: NativeImage 尺寸限制（main.js）
  - [x] SubTask L6.1: 图片处理前检查 Buffer.length > 10MB
  - [x] SubTask L6.2: 超限图片缩放至最大 4096x4096
  - **验证**: 传入 50MB 图片不导致 OOM

## 🔵 修复后全局回归（G1）

- [x] Task G1: 全量回归检查——排查继发问题
  - [x] SubTask G1.1: **接口一致性复查** — main.js IPC ↔ Python 路由 ↔ preload API ↔ renderer 调用四层逐项对照
  - [x] SubTask G1.2: **数据流完整性检查** — 启动→配置加载→日程加载→渲染，保存→序列化→原子写入→读取校验，全链路验证
  - [x] SubTask G1.3: **关键场景冒烟测试** — 首次启动、正常对话、日程 CRUD、账号切换、深度规划、设置面板，6 个场景逐一验证
  - [x] SubTask G1.4: **继发问题专项排查** — appConfig shadowing、原子写入+备份联动、事务性写入+tool_executor 状态一致性、防重入锁异常释放、fsync Windows 兼容性
  - [x] SubTask G1.5: **Python 后端端点回归** — 重新测试全部 14+ 个端点，确保修复未引入回归
  - [x] SubTask G1.6: **JS 语法 + Python 编译检查** — 所有修改文件通过 node --check 和 py_compile
  - **验证**: 所有检查项通过，无新增问题

# Task Dependencies

- B1 是最紧急的回归修复，必须最先执行
- B4 可以与 B1 并行（都涉及 main.js 配置相关代码）
- B2、B5、B6 可并行（不同文件和功能）
- B3 可独立执行
- M1-M12 可并行执行（B 类修复完成后）
- M11 依赖 B1（路径逻辑与配置相关）
- M10 是打包配置，可独立于代码修复执行
- L1-L6 可全部并行
- **G1 是最关键的最终验证，必须在 B1-B6 + M1-M12 + L1-L6 全部完成后执行**
- G1 不能与其他任务并行（需要所有修复完成后的稳定代码基线）