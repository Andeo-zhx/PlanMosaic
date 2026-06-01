# Checklist

## Task P1: HTTP 请求超时
- [x] `pythonApi()` 中 `http.request` 设置了 `timeout: 30000`
- [x] `pythonApi()` 中有 `req.on('timeout', ...)` 处理回调
- [x] `agent-chat-stream` handler 中有 timeout 处理
- [x] 超时后调用 `req.destroy()` 终止连接
- [x] 停止 Python 后端后，30 秒内返回超时错误而非永久等待

## Task P2: 原子文件写入
- [x] `_write_schedule_data` 使用临时文件 + `os.replace()` 方式写入
- [x] `_write_agent_history` 使用临时文件 + `os.replace()` 方式写入
- [x] `tool_executor.py` 中 `_write_schedule_data` 使用临时文件 + `os.replace()` 方式写入
- [x] 备份在原子写入之前执行
- [x] 写入中途强制杀进程，原文件内容完整未损坏

## Task P3: preload.js getApiKeys 修复
- [x] `getApiKeys` 返回 `{deepseek: {configured: true/false}, qwen: {configured: true/false}}`
- [x] 设置页面 API Key 状态指示灯正确显示
- [x] 无 API Key 时显示"未配置"，配置后显示"已配置"

## Task P4: 消息重复添加历史修复
- [x] `addMessage` 不再无条件调用 `addToHistory`
- [x] 流式路径仅在 `doneHandler` 中通过 `saveHistory` 写入一次
- [x] 非流式路径仅在消息完成时写入一次
- [x] 发送一条消息后 agent-log.json 中无重复条目
- [x] 对话历史长度与实际消息数一致

## Task H1: 用户画像重复保存修复
- [x] `agent-chat` handler 中不再在 `updatedProfile` 已存在时额外调用 save
- [x] agent-log.json 中 userProfile 更新仅一次

## Task H2: 图片 Blob URL 清理补全
- [x] `clearConversations` 同时清理深度规划模式的 Blob URL
- [x] 维护独立的 `_activeDpBlobUrls` 数组
- [x] DevTools Memory 中清除对话后无残留 blob URL（两种模式）

## Task H3: 操作防重入锁
- [x] `sendAgentMessage` 有 `_isSending` flag 保护
- [x] `saveScheduleData` 有 `_isSaving` flag 保护
- [x] `approveProposal` 有 `_isApproving` flag 保护
- [x] `finally` 块中释放锁
- [x] 操作期间按钮 disabled 并有 loading 视觉
- [x] 快速连点只发起一次请求

## Task H4: DOM 空引用 null 检查
- [x] 日程渲染函数中 `getElementById` 有 null 检查
- [x] AI 对话面板 DOM 操作有 null 检查
- [x] 设置面板 DOM 操作有 null 检查
- [x] 深度规划面板 DOM 操作有 null 检查
- [x] DOM 未就绪时调用不抛出 TypeError

## Task H5: 工具执行事务性
- [x] `_handle_agent_chat` 收集修改后统一 `_write_schedule_data`
- [x] `tool_executor.py` 内部各工具不再直接写盘
- [x] 工具失败时回滚不写入
- [x] 模拟中途失败后 data.json 无部分修改

## Task H6: Web fetch Content-Type 校验
- [x] 普通聊天 fetch 路径校验 Content-Type
- [x] 深度规划 fetch 路径校验 Content-Type
- [x] ReAct 日志 fetch 路径校验 Content-Type
- [x] 非 JSON 响应返回友好错误信息，不触发 JSON parse error

## Task H7: 账号切换缓存清空
- [x] 切换账号时清空 localStorage 中日程相关 key
- [x] 清空内存中 `conversationHistory`
- [x] 清空内存中 `deepPlanningHistory`
- [x] 重新加载新账号的日程数据
- [x] 切换后页面不显示旧账号数据

## Task H8: Python 文件写入 fsync
- [x] `_write_schedule_data` 在 `f.write()` 后调用 `os.fsync(f.fileno())`
- [x] `_write_agent_history` 在 `f.write()` 后调用 `os.fsync(f.fileno())`
- [x] `tool_executor.py` 中 `_write_schedule_data` 在 `f.write()` 后调用 `os.fsync(f.fileno())`

## Task M1: main.js 全局变量重构
- [x] API Key、Model 等配置合并到 `appConfig` 对象
- [x] 重构后功能不受影响

## Task M2: 日期解析校验
- [x] `parseDateSafe(dateStr)` 工具函数存在
- [x] 无效输入返回 null 而非 Invalid Date
- [x] 所有 `new Date(dateStr)` 替换为 `parseDateSafe()`

## Task M3: 日程数据大小上限
- [x] 写入前检查数据大小 ≤ 5MB
- [x] 超限时返回错误提示并拒绝写入

## Task M4: 定时器泄漏修复
- [x] `scheduleProfileUpdate` 创建的 `setTimeout` id 被保存
- [x] `clearConversations` 时 `clearTimeout`
- [x] 快速清除对话后无残留 timer

## Task M5: 深呼吸动画取消
- [x] `requestAnimationFrame` id 被保存
- [x] 面板关闭/模式切换时 `cancelAnimationFrame`

## Task M6: SSE 心跳检测
- [x] 15 秒数据检查机制
- [x] 45 秒无数据主动断开

## Task M7: 搜索防抖
- [x] 输入事件有 300ms debounce
- [x] 搜索忽略大小写
- [x] 快速输入不每次触发 rerender

## Task M8: 备份大小限制
- [x] 清理逻辑包含总大小检查（50MB 上限）
- [x] 超出上限时按时间删除最旧备份

## Task M9: 账号切换 UI 刷新
- [x] `setActiveUser` 成功后清空缓存
- [x] 日历和日程列表正确更新为新账号数据

## Task M10: ReAct 日志长度限制
- [x] `generate-react-log` 输出限制 100KB
- [x] 超限时截断并添加标记

## Task L1: 生产构建移除 console.log
- [x] 生产 EXE 中不含 `console.log` 语句

## Task L2: CSS 像素值审查
- [x] 超大硬编码值改为 `max-width` 或相对单位
- [x] 800x600 窗口无横向滚动条

## Task L3: Python 依赖版本锁定
- [x] requirements.txt 包含精确版本号
- [x] `pip install -r requirements.txt` 可复现构建

## Task L4: index.html 代码拆分标记
- [x] 代码中有 TODO 注释标记未来拆分

## Task L5: 错误消息消毒
- [x] 生产模式返回通用错误消息
- [x] 详细错误仅记录到日志文件
- [x] 前端不暴露堆栈信息