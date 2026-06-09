# Tasks

- [x] Task 1: 建立审查基线并锁定修复范围
  - [x] 汇总当前桌面端剩余高风险问题，形成按严重级别排序的修复列表
  - [x] 标记本次改动涉及的主进程、渲染层、本地服务、Python 后端和 CLI 控制通道
  - [x] 明确哪些旧审计项已完成，避免重复实现

- [x] Task 2: 加固本地 API 与控制通道访问边界
  - [x] 为 `server.js` 与 `backend/server.py` 的读写接口增加统一鉴权机制
  - [x] 收紧 CORS/Origin 策略，并限制监听地址为本机回环
  - [x] 为所有高风险 POST 接口增加请求体大小上限与拒绝策略
  - [x] 为 `/ui/*` 与桥接调用统一补齐控制 token 校验

- [x] Task 3: 修复渲染层 XSS 与 CSP 薄弱点
  - [x] 替换大任务备注、AI 提案、比较内容等直接拼接 `innerHTML` 的渲染路径
  - [x] 建立统一的转义或安全 DOM 构建辅助方法
  - [x] 收紧 `index.html` 的 CSP，逐步移除 `unsafe-inline` 依赖
  - [x] 验证恶意 HTML 输入仅按文本显示

- [x] Task 4: 收紧配置更新和外链打开策略
  - [x] 禁止前端未经授权修改 `baseUrl`、监听地址、TLS 校验等敏感配置
  - [x] 为配置更新增加 schema、字段白名单和分级校验
  - [x] 修复 `safeOpenExternal()` 的主机匹配逻辑，避免前缀绕过
  - [x] 明确开发模式与生产模式下允许变更的配置范围

- [x] Task 5: 重构提案审批与输入校验链路
  - [x] 将 proposal 审批改为基于服务端持久化对象或签名标识
  - [x] 为 proposal 类型建立严格枚举与校验逻辑
  - [x] 修复工具生成 proposal 与审批执行器不一致的问题
  - [x] 验证伪造提案、过期提案和未知类型提案均被拒绝

- [x] Task 6: 统一数据写入路径并补齐并发一致性
  - [x] 为日程、历史和配置写入建立统一的加锁/原子写入入口
  - [x] 为保存与审批接口补充版本校验或冲突拒绝机制
  - [x] 为关键落盘对象增加 schema 校验，阻止脏数据写入
  - [x] 修复 Big Task 等关键数据模型字段命名不一致问题

- [x] Task 7: 修复事件监听、保存锁与资源回收问题
  - [x] 修复 preload 监听器注册/解绑不对称问题
  - [x] 为 AI 流式请求按 request 维度管理监听器和清理逻辑
  - [x] 将全局 `_isSaving` 改为可感知冲突的队列或分域锁
  - [x] 清理定时器、动画帧、Blob URL 等长期运行资源

- [x] Task 8: 补充验证与回归保障
  - [x] 为鉴权、XSS、防伪审批、请求体上限和并发保存补充自动化测试或脚本验证
  - [x] 运行已有桌面端测试用例，确认 AI 对话、保存、审批、配置等主路径无回归
  - [x] 依据 `checklist.md` 完成逐项验证并勾选
  - [x] 修复任务：为 `backend/server.py` 的 `/api/save-schedule`、`/api/agent-save`、`/api/config` 增加统一鉴权，并补充未认证写请求拒绝验证
  - [x] 修复任务：收紧 `backend/server.py` 的开发态 CORS 配置，禁止 `allow_origins=["*"]`，保持仅本地可信来源可访问
  - [x] 修复任务：为 Python 后端高风险 POST 接口补充统一请求体大小限制与 `413` 拒绝响应
  - [x] 修复任务：继续拆分 `index.html` 内联脚本/样式并收紧 CSP，移除 `unsafe-inline`
  - [x] 修复任务：修复桌面端测试启动握手，恢复 `npm test` 主路径回归可运行并稳定通过

# Task Dependencies

- Task 1 是后续所有任务的输入基线
- Task 2、Task 3、Task 4 可在 Task 1 完成后并行推进
- Task 5 依赖 Task 2 与 Task 4 的鉴权、配置边界方案
- Task 6 依赖 Task 5 明确 proposal 与写入模型
- Task 7 可与 Task 6 并行，但最终需一起验证保存与流式交互稳定性
- Task 8 依赖 Task 2 至 Task 7 完成
