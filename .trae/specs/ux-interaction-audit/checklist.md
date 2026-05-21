# Checklist

## Task 1: 消除静默错误吞没
- [x] 全局 `catch {}` / `catch(() => {})` 空块已消除（grep 结果为 0）
- [x] 每个 catch 块至少包含 `console.warn`/`console.error` + 用户可见反馈（toast/降级 UI）
- [x] 主题加载失败后应用正常使用默认主题
- [x] 数据加载失败后显示降级 UI "加载失败，请刷新"
- [x] Agent 启动扫描失败后显示回退欢迎消息
- [x] 画像生成失败后不阻碍正常对话
- [x] 历史保存失败后 toast "保存失败"
- [x] 深度规划保存失败后 toast 错误 + 保留本地
- [x] WordMosaic 注入失败有 console.warn 标记

## Task 2: 修复提案按钮竞态
- [x] `approveProposal()` 开头立即禁用确认/取消按钮
- [x] `rejectProposal()` 开头立即禁用确认/取消按钮
- [x] 审批成功后按钮替换为操作描述文本
- [x] 拒绝后按钮替换为"已取消"且确认按钮不可见
- [x] 审批期间按钮显示 loading 状态
- [x] 快速双击确认按钮仅执行一次

## Task 3: 保存/删除添加加载状态
- [x] `saveSchedule()` 有 loading 状态 + 按钮 disabled
- [x] `saveBigTask()` 有 loading 状态 + 按钮 disabled
- [x] `saveCurrentTemplate()` 有 loading 状态
- [x] 保存成功用 toast（非 alert）
- [x] 保存失败用 toast 错误信息
- [x] 快速双击保存仅触发一次

## Task 4: 修复数据刷新竞态
- [x] `refreshScheduleData()` 不再使用 `setTimeout(100)`
- [x] Agent 工具执行后通过确认信号（非硬等待）刷新
- [x] `agent-approve` IPC 返回后同步刷新 UI
- [x] `beforeunload` 事件中 flush 防抖保存
- [x] Agent 添加日程后日历即时显示新数据

## Task 5: 修复流式监听器内存泄漏
- [x] 监听器移除逻辑在 `finally` 块中（覆盖异常路径）
- [x] 异常时 `onAgentStreamChunk`/`onAgentStreamDone` 被移除
- [x] 连续多次对话后监听器不累积

## Task 6: 破坏性操作添加确认
- [x] `removeSlot()` 有确认 toast
- [x] `removeTask()` 有确认 toast
- [x] `deleteSlot()` 有确认 toast
- [x] 确认 toast 显示删除内容描述
- [x] 取消确认不执行删除

## Task 7: 弹窗 Escape/遮罩关闭
- [x] 大任务弹窗支持 Escape + 遮罩点击关闭
- [x] 实际用时弹窗支持遮罩点击关闭
- [x] 日程编辑器弹窗支持 Escape + 遮罩点击关闭
- [x] 关闭前未保存修改有询问提示

## Task 8: Toast 通知系统
- [x] `showToast(message, type, duration)` 函数存在
- [x] `showConfirmToast(message, onConfirm, onCancel)` 函数存在
- [x] 全局无 `alert()` 调用
- [x] 全局无 `confirm()` 调用
- [x] Toast 支持 success/error/warning/info 类型
- [x] Toast 支持自动消失

## Task 9: 增强表单验证
- [x] 必填字段有红色星号标记
- [x] 时间输入即时验证（oninput/onblur）
- [x] 验证错误内联显示（非 alert）
- [x] 登录/注册表单有字符过滤

## Task 10: 补全非 Electron 环境功能
- [x] Web 模式启动欢迎扫描可用（纯前端）
- [x] Web 模式对话清除可用
- [x] Web 模式归档可用（localStorage）
- [x] 不可用功能按钮 disabled + tooltip 提示

## Task 11: 发送按钮防重复 + 图片优化
- [x] 发送按钮在函数入口立即禁用
- [x] 所有 early return 路径恢复按钮状态
- [x] 图片预览用 `createObjectURL`（非 base64 嵌入 DOM）
- [x] 空消息发送给输入框视觉反馈
- [x] 快速双击仅发一条消息

## Task 12: 深度规划模式交互
- [x] 发送后立即显示 loading 动画
- [x] 打开时检测上次会话并提示恢复
- [x] 关闭时 toast "规划已保存"
- [x] 主界面有深度规划状态指示

## Task 13: 对话清除/归档状态重置
- [x] 清除后 `isTyping`、`uploadedImages`、`typingTimeout` 已重置
- [x] 归档有确认 toast
- [x] 清除/归档后显示空状态引导

## Task 14: 画像生成无限重试
- [x] 失败时 `_lastProfileGenCount` 被更新
- [x] 有最大重试次数限制（≤3 次）
- [x] 超限后本次会话不再尝试生成