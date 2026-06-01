# Tasks

## 🔴 紧急修复（P1-P4）

- [x] Task P1: 所有 HTTP 请求添加超时（main.js）
  - [x] SubTask P1.1: `pythonApi()` 函数中 `http.request` 添加 `timeout: 30000` 和 `req.on('timeout')` 处理
  - [x] SubTask P1.2: `agent-chat-stream` 流式 handler 中的 `http.request` 添加 timeout
  - [x] SubTask P1.3: 超时后调用 `req.destroy()` 并 resolve `{error: '请求超时'}`
  - **验证**: 停止 Python 后端后触发请求，30 秒内返回超时错误

- [x] Task P2: 文件写入改为原子操作（server.py + tool_executor.py）
  - [x] SubTask P2.1: `_write_schedule_data` 改为先写 `{path}.tmp`，再 `os.replace()` 到目标路径
  - [x] SubTask P2.2: `_write_agent_history` 同样改为原子写入
  - [x] SubTask P2.3: `tool_executor.py` 中 `_write_schedule_data` 同样改为原子写入
  - [x] SubTask P2.4: 备份操作（`_create_backup`）在原子写入之前执行
  - **验证**: 写入过程中强制终止进程，原文件内容完整

- [x] Task P3: 修复 preload.js getApiKeys 返回值结构（preload.js）
  - [x] SubTask P3.1: 修改 `getApiKeys` 的 `map` 回调，正确返回 `[provider, { configured: !!key }]`
  - [x] SubTask P3.2: 确保设置页面中 API Key 配置状态正确显示
  - **验证**: 调用 `getApiKeys()` 返回 `{deepseek: {configured: true}, qwen: {configured: false}}`

- [x] Task P4: 修复 ai-agent.js 消息重复添加历史（ai-agent.js）
  - [x] SubTask P4.1: 梳理 `addMessage` 中 `addToHistory` 调用与 `sendAgentMessage` 中 `saveHistory` 的关系
  - [x] SubTask P4.2: 确保流式/非流式两条路径都只在消息完成时写一次 history
  - [x] SubTask P4.3: 删除 `addMessage` 中冗余的 `addToHistory` 调用（保留 saveHistory 统一入口）
  - **验证**: 发送一条消息后检查 agent-log.json 中无重复条目

## 🟡 高优先级（H1-H8）

- [x] Task H1: 修复用户画像重复保存（main.js + ai-agent.js）
  - [x] SubTask H1.1: `agent-chat` 处理器中检查 `updatedProfile` 是否已被 server.py 自动保存
  - [x] SubTask H1.2: 若已自动保存则移除 main.js 中额外的 saveAgentHistory 调用
  - **验证**: AI 对话后 agent-log.json 中画像仅保存一次

- [x] Task H2: 补全图片 Blob URL 清理（ai-agent.js）
  - [x] SubTask H2.1: `clearConversations` 中同时清理深度规划模式的 `_activeDpBlobUrls`
  - [x] SubTask H2.2: 在 `switchToDeepPlanning` 时维护独立的 Blob URL 列表
  - **验证**: 两种模式下上传图片后清除对话，DevTools Memory 中无残留 blob URL

- [x] Task H3: 关键操作添加防重入锁（main.js + index.html + ai-agent.js）
  - [x] SubTask H3.1: `sendAgentMessage` 开头检查 `_isSending` flag，设置后 `finally` 释放
  - [x] SubTask H3.2: `saveScheduleData` 开头检查 `_isSaving` flag
  - [x] SubTask H3.3: `agentApprove`/`approveProposal` 开头检查 `_isApproving` flag
  - [x] SubTask H3.4: 按钮在操作期间 disable + 视觉 loading 状态
  - **验证**: 快速连点发送按钮，只发起一次请求

- [x] Task H4: DOM 元素空引用添加 null 检查（index.html）
  - [x] SubTask H4.1: 全局搜索 `document.getElementById(...)` 后直接链式操作（如 `.style.xxx`）的位置
  - [x] SubTask H4.2: 每个位置添加 `if (!el) return;` 或 `el?.` 保护
  - [x] SubTask H4.3: 重点检查：日程渲染、AI 对话面板、设置面板、深度规划面板
  - **验证**: 在 DOM 未就绪时调用相关函数不抛出 TypeError

- [x] Task H5: 工具执行改为事务性写入（server.py）
  - [x] SubTask H5.1: `_handle_agent_chat` 中收集所有工具调用的修改，回合结束时统一 `_write_schedule_data`
  - [x] SubTask H5.2: 移除 `tool_executor.py` 中各工具内部的 `self._write_schedule_data` 调用
  - [x] SubTask H5.3: 工具调用失败时回滚，不写入任何修改
  - **验证**: 模拟工具执行中途失败，data.json 未发生部分修改

- [x] Task H6: Web fetch 响应添加 Content-Type 校验（ai-agent.js）
  - [x] SubTask H6.1: 在所有 `fetch(...).then(r => r.json())` 前检查 `r.headers.get('content-type')`
  - [x] SubTask H6.2: 非 JSON 响应返回友好错误信息
  - [x] SubTask H6.3: 覆盖普通聊天、深度规划、ReAct 日志三处 fetch 调用
  - **验证**: 服务端返回 HTML 500 页面时不触发 JSON parse error

- [x] Task H7: 用户切换账号时清空缓存（index.html + paths.js）
  - [x] SubTask H7.1: `setActiveUser` 切换账号时清空 `localStorage` 中日程相关 key
  - [x] SubTask H7.2: 清空内存中的 `conversationHistory`、`deepPlanningHistory`
  - [x] SubTask H7.3: 重新加载新账号的日程和配置
  - **验证**: 账号 A 切换到账号 B 后，页面不显示账号 A 的数据

- [x] Task H8: Python 文件写入添加 fsync（server.py + tool_executor.py）
  - [x] SubTask H8.1: `_write_schedule_data` 中 `f.write()` 后调用 `os.fsync(f.fileno())`
  - [x] SubTask H8.2: `_write_agent_history` 中同样添加 fsync
  - [x] SubTask H8.3: `tool_executor.py` 中 `_write_schedule_data` 同样添加 fsync
  - **验证**: 写入后立即模拟断电（kill 进程），重启后数据完整

## 🟡 中等优先级（M1-M10）

- [x] Task M1: main.js 全局变量重构为配置对象（main.js）
  - [x] SubTask M1.1: 将 DEEPSEEK_API_KEY、QWEN_API_KEY、MODEL_NAME 等合并到 `appConfig` 对象
  - **验证**: 重构后所有 IPC handler 功能不受影响

- [x] Task M2: 日期解析添加校验（ai-agent.js + index.html）
  - [x] SubTask M2.1: 创建 `parseDateSafe(dateStr)` 工具函数，返回 `Date | null`
  - [x] SubTask M2.2: 所有 `new Date(dateStr)` 替换为 `parseDateSafe()`
  - **验证**: 传入 `'abc'` 不产生 Invalid Date 传播，返回 null 并降级处理

- [x] Task M3: 日程数据添加大小上限（tool_executor.py + paths.js）
  - [x] SubTask M3.1: 写入前检查 `JSON.stringify(data).length` 不超过 5MB
  - [x] SubTask M3.2: 超限时返回错误提示并拒绝写入
  - **验证**: 超大数据写入被拒绝并 toast 提示用户

- [x] Task M4: 修复 scheduleProfileUpdate 定时器泄漏（ai-agent.js）
  - [x] SubTask M4.1: 保存 `setTimeout` 返回的 timer ID
  - [x] SubTask M4.2: `clearConversations` / 组件卸载时 `clearTimeout`
  - **验证**: 快速清除对话后 DevTools Performance 中无残留 timer

- [x] Task M5: 深呼吸动画添加取消机制（index.html）
  - [x] SubTask M5.1: 保存 `requestAnimationFrame` 返回的 ID
  - [x] SubTask M5.2: 面板关闭/模式切换时 `cancelAnimationFrame`
  - **验证**: 打开深呼吸后关闭面板，无残留动画帧

- [x] Task M6: SSE 连接添加心跳检测（main.js）
  - [x] SubTask M6.1: 每 15 秒检查是否有新数据到达
  - [x] SubTask M6.2: 45 秒无数据则主动断开并提示
  - **验证**: 代理层断开后 45 秒内提示用户而非永久等待

- [x] Task M7: 搜索功能添加防抖（index.html）
  - [x] SubTask M7.1: 输入事件添加 300ms debounce
  - [x] SubTask M7.2: 搜索忽略大小写
  - **验证**: 快速输入时每次按键不触发完整 rerender，停止输入 300ms 后才搜索

- [x] Task M8: 备份文件添加总大小限制（paths.js + paths.py）
  - [x] SubTask M8.1: 清理逻辑中增加总大小检查（如 50MB 上限）
  - [x] SubTask M8.2: 超出上限时删除最旧的备份直到回到限制内
  - **验证**: 生成大量备份后，总大小不超过 50MB

- [x] Task M9: 账号切换后强制刷新 UI（index.html）
  - [x] SubTask M9.1: `setActiveUser` 成功后调用 `clearAllCaches()` → `reloadAllData()`
  - [x] SubTask M9.2: 确保日历、日程列表、对话面板显示新账号数据
  - **验证**: 切换账号后日历和日程列表正确更新

- [x] Task M10: ReAct 日志添加长度限制（server.py + ai-agent.js）
  - [x] SubTask M10.1: `generate-react-log` 限制输出最大 100KB
  - [x] SubTask M10.2: 超限时截断并添加 `...(truncated)` 标记
  - **验证**: 超长对话历史生成日志时不被截断超出 100KB

## 🟢 低优先级（L1-L5）

- [x] Task L1: 生产构建移除 console.log（构建配置）
  - [x] SubTask L1.1: 检查 electron-builder 是否有 strip console 选项
  - [x] SubTask L1.2: 或添加 babel/terser 插件在生产构建时移除 console
  - **验证**: `npm run build` 后 EXE 中不含 console.log 语句

- [x] Task L2: CSS 像素值审查（index.html）
  - [x] SubTask L2.1: 标识所有宽度/高度 > 800px 的硬编码值
  - [x] SubTask L2.2: 改为 `max-width` 或 `vw/vh` 相对单位
  - **验证**: 窗口缩放至 800x600 时无横向滚动条

- [x] Task L3: Python 依赖版本锁定（requirements.txt）
  - [x] SubTask L3.1: `pip freeze` 导出当前精确版本
  - [x] SubTask L3.2: 更新 requirements.txt 为锁定版本
  - **验证**: `pip install -r requirements.txt` 安装版本一致

- [x] Task L4: index.html JS 过长（未来迭代）
  - [x] 标记为 `TODO: 未来拆分为独立 .js 模块`
  - **验证**: 代码中添加 TODO 注释标记

- [x] Task L5: 错误消息消毒（server.py）
  - [x] SubTask L5.1: 生产模式返回通用错误消息而非内部异常详情
  - [x] SubTask L5.2: 详细错误仅记录到日志文件
  - **验证**: 触发异常后前端收到通用消息，不暴露堆栈信息

# Task Dependencies

- P1、P2、P3、P4 可并行执行（操作不同文件或不同代码区域）
- H1 依赖 P4（画像保存与消息历史共用 saveHistory 逻辑）
- H2、H3、H4、H6、H7、H8 可并行执行
- H5 依赖 P2（原子写入是事务性的前提）
- M1-M10 可全部并行执行
- L1-L5 可全部并行执行
- H5 完成后可验证 H5 + P2 联合效果