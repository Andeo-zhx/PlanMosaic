# Checklist

## Task B1: appConfig 引用断裂修复
- [x] main.js 中无残留 `DEEPSEEK_API_KEY` 独立变量引用
- [x] main.js 中无残留 `QWEN_API_KEY` 独立变量引用
- [x] main.js 中无残留 `MODEL_NAME` 独立变量引用
- [x] main.js 中无残留 `currentProvider` 独立变量引用（全部改为 `appConfig.provider`）
- [x] get-api-keys handler 返回正确的 key 值
- [x] set-api-key handler 正确写入 appConfig
- [x] validate-api-key handler 正确读取 appConfig
- [x] pythonApi() 函数中 API URL 从 appConfig 正确读取
- [x] `node --check main.js` 通过
- [x] 启动应用后 API Key 配置功能正常

## Task B2: config.json 自动创建
- [x] 删除 config.json 后启动后端不崩溃
- [x] 自动生成的 config.json 包含 provider、model 等默认字段
- [x] `python -m py_compile backend/config.py` 通过

## Task B3: 保存失败提示
- [x] 停止 Python 后端后点击保存，显示错误 toast
- [x] 正常网络环境下保存功能不受影响

## Task B4: appConfig.settings 默认值
- [x] loadSettings() 中 appConfig.settings 有完整默认值
- [x] enableTimeout 默认 true
- [x] timeoutMs 默认 30000
- [x] 首次启动不报 settings 相关 undefined 错误

## Task B5: 备份唯一命名
- [x] _create_backup 文件名包含毫秒（%f）
- [x] 同一秒内两次写入生成不同备份文件
- [x] `python -m py_compile` 通过

## Task B6: 深度规划 prompt
- [x] config.py 存在 DEEP_PLANNING_SYSTEM_PROMPT 常量
- [x] _handle_deep_planning_chat 将 system prompt 注入 messages
- [x] 深度规划 LLM 回复包含日程规划结构

## Task M1: 定时器清理
- [x] onbeforeunload 中清除所有 setInterval
- [x] onbeforeunload 中清除所有 setTimeout
- [x] 页面关闭后 DevTools 无残留 timer

## Task M2: Date 对象缓存
- [x] renderCalendar 中 new Date() 调用 ≤ 3 次
- [x] 月视图渲染正确

## Task M3: 工具返回值
- [x] 所有 execute_* 方法的所有分支有显式 return
- [x] 失败分支显式返回错误信息
- [x] `python -m py_compile` 通过

## Task M4: removeListener 白名单
- [x] ALLOWED_REMOVE_CHANNELS 仅含 agent 流式通道
- [x] 尝试移除系统级监听器被拒绝
- [x] `node --check preload.js` 通过

## Task M5: CORS 生产限制
- [x] 生产模式下 allow_origins 不含 "*"
- [x] 无效 allow_credentials 组合已修正
- [x] `python -m py_compile` 通过

## Task M6: 大日程分批渲染
- [x] > 50 条日程使用 requestAnimationFrame 分批
- [x] 100 条日程渲染 < 100ms
- [x] 日程显示正确无遗漏

## Task M7: 对话历史上限
- [x] conversationHistory 保持 ≤ 50 轮
- [x] 超出部分自动归档到 archivedConversations
- [x] LLM 请求只发送最近 50 轮
- [x] `node --check ai-agent.js` 通过

## Task M8: Webview 错误页
- [x] did-fail-load 注入错误 HTML
- [x] 错误页有"重试"按钮
- [x] 点击重试触发 webview.reload()
- [x] 断网打开 WordMosaic 不白屏

## Task M9: 进程守护
- [x] pythonProcess.on('exit') 实现自动重启
- [x] 最多重启 3 次
- [x] 3 次失败后通知渲染进程

## Task M10: 打包含 backend
- [x] extraResources 包含 ../backend/**
- [x] npm run build 成功后 EXE 含 backend 目录

## Task M11: 多用户路径隔离
- [x] getDataFilePath 基于用户名 hash
- [x] 切换账号读取不同文件
- [x] 旧数据自动迁移
- [x] `node --check paths.js` 通过

## Task M12: SSE 多字节处理
- [x] 行分割前检查 UTF-8 序列完整性
- [x] 不完整序列保留在 buffer
- [x] 含 emoji 的流式消息不截断

## Task L1: 日志分级
- [x] 错误 → console.error
- [x] 警告 → console.warn
- [x] 调试 → console.debug
- [x] 生产环境 error 仍可见

## Task L2: i18n 标记
- [x] index.html 顶部有 i18n TODO 注释
- [x] ai-agent.js 顶部有 i18n TODO 注释

## Task L3: Ctrl+S 冲突
- [x] 日程编辑区 Ctrl+S 执行自定义保存
- [x] 非编辑区 Ctrl+S 行为不变
- [x] e.preventDefault() 阻止默认行为

## Task L4: CSS 选择器标记
- [x] CSS 区域有简化 TODO 注释

## Task L5: 离线降级
- [x] 断网发送消息显示 toast
- [x] online/offline 事件监听
- [x] 恢复网络后功能正常

## Task L6: 图片尺寸限制
- [x] 10MB 以上图片缩放至 4096px
- [x] 50MB 图片不 OOM

---

## 🔵 Task G1: 修复后全局回归检查

### G1.1 接口一致性复查
- [x] main.js 每个 IPC handler 有对应 Python 路由
- [x] preload.js 每个暴露 API 在 renderer 中有调用
- [x] ai-agent.js IPC 调用签名与 preload.js 一致
- [x] Server.py 路由路径与 main.js `pythonApi()` 调用一致

### G1.2 数据流完整性
- [x] 启动链路：app 启动 → loadSettings → loadData → renderCalendar 全通
- [x] 对话链路：用户输入 → IPC → Python → LLM → 渲染 全通
- [x] 保存链路：修改日程 → 序列化 → 原子写入 → 回读校验 全通

### G1.3 关键场景冒烟
- [x] 首次启动（无 config.json、无 data.json）不崩溃
- [x] 流式对话通道正常（agent-stream-chunk/done/status 通道联通）
- [x] 非流式对话正常返回
- [x] 日程 CRUD（新增/修改/删除）正常
- [x] 账号切换后数据隔离正确
- [x] 深度规划模式可进入和对话
- [x] 设置面板 API Key 读写正常

### G1.4 继发问题专项
- [x] appConfig 重构未引入变量 shadowing
- [x] 原子写入 + 备份逻辑联动正确
- [x] 事务性写入后 tool_executor 状态一致
- [x] 防重入锁异常路径下正确释放
- [x] fsync 调用在 Windows 无兼容性问题

### G1.5 后端端点回归
- [x] 14 个核心端点全部返回 200
- [x] 数据写入后再读取一致
- [x] 错误场景下返回合理错误码

### G1.6 语法检查
- [x] `node --check` 所有 JS 文件通过
- [x] `python -m py_compile` 所有 Python 文件通过