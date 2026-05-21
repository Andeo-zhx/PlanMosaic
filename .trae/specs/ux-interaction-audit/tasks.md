# Tasks

- [x] Task 1: 消除所有静默错误吞没（16处）- index.html + ai-agent.js
  - [x] SubTask 1.1: `index.html` L17 主题初始化 catch → console.warn + 使用默认主题
  - [x] SubTask 1.2: `index.html` L6584/L6590/L6600 WordMosaic 注入 catch → console.warn 标记
  - [x] SubTask 1.3: `index.html` L6527 WordMosaic 路径 catch → console.warn
  - [x] SubTask 1.4: `index.html` L8062 保存数据 catch → toast 错误提示
  - [x] SubTask 1.5: `ai-agent.js` L62-L64 loadData catch → 显示降级 UI "加载失败，请刷新"
  - [x] SubTask 1.6: `ai-agent.js` L110-L112 startupScan catch → 显示回退欢迎消息
  - [x] SubTask 1.7: `ai-agent.js` L520 profileGeneration catch → console.warn + 跳过
  - [x] SubTask 1.8: `ai-agent.js` L536 saveHistory catch → toast "保存失败"
  - [x] SubTask 1.9: `ai-agent.js` L628 refreshScheduleData catch → 保留现有数据
  - [x] SubTask 1.10: `ai-agent.js` L646/L687 deepPlanning catch → toast 错误 + 保留本地
  - **验证**: 逐一触发各错误场景，确认用户可见反馈；无静默 fail 场景

- [x] Task 2: 修复提案按钮竞态条件 - ai-agent.js
  - [x] SubTask 2.1: 创建 `disableProposalButtons(container)` 函数，禁用/隐藏确认取消按钮
  - [x] SubTask 2.2: 在 `approveProposal()` 开头调用禁用按钮，成功/失败后替换为状态文本
  - [x] SubTask 2.3: 在 `rejectProposal()` 开头调用禁用按钮，替换为"已取消"文本
  - [x] SubTask 2.4: 审批期间添加 loading 状态（按钮文字变"处理中..."）
  - [x] SubTask 2.5: 审批成功后反馈具体操作内容（非"已完成。"）
  - **验证**: 快速双击确认按钮，仅执行一次审批；拒绝后确认按钮不可见

- [x] Task 3: 为保存/删除操作添加加载状态 - index.html
  - [x] SubTask 3.1: `saveSchedule()` 添加 loading 状态 + 按钮禁用
  - [x] SubTask 3.2: `saveBigTask()` 添加 loading 状态 + 按钮禁用
  - [x] SubTask 3.3: `saveCurrentTemplate()` / `activateSchedule()` 添加 loading 状态
  - [x] SubTask 3.4: 所有保存成功用 toast 替代 alert()
  - [x] SubTask 3.5: 所有保存失败用 toast 显示错误信息
  - **验证**: 快速双击保存按钮，仅执行一次保存

- [x] Task 4: 修复数据刷新竞态条件 - ai-agent.js + index.html
  - [x] SubTask 4.1: 移除 `refreshScheduleData()` 中 100ms `setTimeout` 硬等待
  - [x] SubTask 4.2: 改为在 Agent 工具执行完成后通过回调/Promise 触发刷新
  - [x] SubTask 4.3: IPC `agent-approve` 返回后同步调用 `loadDataAndSync()`
  - [x] SubTask 4.4: `saveAllDataDebounced` 添加 `beforeunload` flush 逻辑
  - **验证**: Agent 添加日程后日历立即正确显示新数据，无旧数据闪烁

- [x] Task 5: 修复流式监听器内存泄漏 - ai-agent.js
  - [x] SubTask 5.1: 将 `removeAllAgentListeners` 调用移入 `finally` 块（覆盖所有退出路径）
  - [x] SubTask 5.2: 确保异常路径正确移除监听器（当前仅在 doneHandler 中移除）
  - [x] SubTask 5.3: 添加取消流式请求的能力（发送新消息前正确终止旧请求）
  - **验证**: 连续多次正常/异常对话，确认内存无泄漏（监听器不复增长）

- [x] Task 6: 为破坏性操作添加确认对话框 - index.html
  - [x] SubTask 6.1: `removeSlot()` 添加确认 toast
  - [x] SubTask 6.2: `removeTask()` 添加确认 toast
  - [x] SubTask 6.3: `deleteSlot()` 添加确认 toast
  - [x] SubTask 6.4: 确认 toast 显示即将删除的内容描述
  - **验证**: 点击删除后出现确认提示，取消不执行删除

- [x] Task 7: 修复弹窗 Escape/遮罩层关闭 - index.html
  - [x] SubTask 7.1: 大任务弹窗添加 Escape 键 + 遮罩层点击关闭
  - [x] SubTask 7.2: 实际用时弹窗添加遮罩层点击关闭
  - [x] SubTask 7.3: 日程编辑器弹窗添加 Escape 键 + 遮罩层点击关闭
  - [x] SubTask 7.4: 关闭前检测未保存修改，询问是否放弃
  - **验证**: 所有弹窗均可 Escape/遮罩关闭

- [x] Task 8: 实现 Toast 通知系统替换 alert/confirm - index.html
  - [x] SubTask 8.1: 创建 `showToast(message, type, duration)` 函数（success/error/warning/info）
  - [x] SubTask 8.2: 创建 `showConfirmToast(message, onConfirm, onCancel)` 函数
  - [x] SubTask 8.3: 替换所有 11 处 alert() 为 toast
  - [x] SubTask 8.4: 替换所有 confirm() 为 confirm toast
  - **验证**: 不再出现浏览器原生 alert/confirm 弹窗

- [x] Task 9: 增强表单验证 - index.html
  - [x] SubTask 9.1: 必填字段标签添加红色星号标记
  - [x] SubTask 9.2: 时间输入改为 `oninput`/`onblur` 即时验证
  - [x] SubTask 9.3: 验证错误在字段旁内联显示，非 alert()
  - [x] SubTask 9.4: 登录/注册表单添加正则校验（特殊字符过滤）
  - **验证**: 空字段提交时边框变红 + 内联提示

- [x] Task 10: 补全非 Electron 环境功能 - ai-agent.js
  - [x] SubTask 10.1: Web 模式下的启动欢迎扫描用纯前端实现（检查本地数据）
  - [x] SubTask 10.2: Web 模式下的对话清除用 `conversationHistory = []` + DOM 清空
  - [x] SubTask 10.3: Web 模式下的归档功能用 localStorage 备份
  - [x] SubTask 10.4: 不可用功能按钮显示 disabled + tooltip "桌面版可用"
  - **验证**: Web 浏览器中所有按钮均有反应

- [x] Task 11: 修复发送按钮防重复 + 图片上传优化 - ai-agent.js
  - [x] SubTask 11.1: 发送按钮在函数入口处立即禁用，所有 early return 前恢复
  - [x] SubTask 11.2: 图片预览改用 `createObjectURL`，不嵌入 base64 到 DOM
  - [x] SubTask 11.3: 图片上传添加缩略图 + 进度指示
  - [x] SubTask 11.4: 空消息发送时给输入框视觉反馈（抖动或提示）
  - **验证**: 快速双击仅发一条消息；大图预览不卡 UI

- [x] Task 12: 修复深度规划模式交互 - ai-agent.js
  - [x] SubTask 12.1: 消息发送后立即显示 "Mosa 正在深度思考..." loading 动画
  - [x] SubTask 12.2: 打开深度规划时检测上次会话，提示"是否恢复上次规划？"
  - [x] SubTask 12.3: 关闭时显示"规划已保存" toast
  - [x] SubTask 12.4: 主界面添加深度规划模式状态指示
  - **验证**: 发送消息后立即显示等待动画；关闭后 toast 确认保存

- [x] Task 13: 修复对话清除/归档状态重置 - ai-agent.js
  - [x] SubTask 13.1: 清除后重置 `isTyping`、`uploadedImages`、`typingTimeout`、`conversationHistory`
  - [x] SubTask 13.2: 归档操作添加确认 toast（与清除一致）
  - [x] SubTask 13.3: 清除/归档后显示空状态引导
  - **验证**: 清除后发送消息，无残留状态影响

- [x] Task 14: 修复用户画像生成无限重试 - ai-agent.js
  - [x] SubTask 14.1: 画像生成失败时也更新 `_lastProfileGenCount`，防止无限重试
  - [x] SubTask 14.2: 添加最大重试次数（3 次），超限后本次会话不再生成
  - **验证**: 模拟 API 失败，确认不会每轮对话都发起画像生成请求

# Task Dependencies

- Task 1 ~ Task 7 可并行执行（无相互依赖）
- Task 2（提案按钮）和 Task 3（加载状态）涉及相似模式，可联动实施
- Task 4（数据刷新）依赖 Task 2（提案流程）确认信号机制
- Task 8（Toast 系统）应在所有 UI 修改任务之前实施，使后续任务可直接使用 toast
- Task 11（发送按钮）和 Task 5（流式监听器）共用错误处理路径
- Task 12（深度规划）可在其他任务完成后独立实施