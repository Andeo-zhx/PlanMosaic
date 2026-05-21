# Checklist

## 导航架构
- [x] Android 端底部标签栏已移除，启动默认进入 Mosa 对话页
- [x] Android 端 ScheduleScreen 和 ProfileScreen 顶部有毛玻璃返回导航栏
- [x] Uni-app 端底部 custom-tabbar 已移除（组件文件已删除），Mosa 页为首页
- [x] Uni-app 端二级页面（schedule/timetable/profile）有返回导航栏

## Agent 对话主界面
- [x] 启动应用后 Agent 用温馨语气展示个性化欢迎语（早晨/下午/晚上区分）
- [x] 欢迎页展示今日日程概览（毛玻璃卡片，待办数量 + 摘要）
- [x] 毛玻璃快捷操作 Chip 入口可正常使用
- [x] 新用户首次使用时展示温馨友好引导
- [x] 消息列表支持滚动，自动定位到最新消息
- [x] 打字指示器在 Agent 思考时正确显示

## Agent 温馨语气
- [x] Agent 回复使用温暖亲切的语调，像朋友一样交流
- [x] Agent 回复中适当使用 emoji 点缀
- [x] 错误/异常时 Agent 温和说明并提供替代建议，不冷冰冰报错
- [x] System Prompt 已重写，包含温馨人格设定、回复规范和思路链要求

## Agent 主动数据检索
- [x] 启动应用后 Agent 自动检索用户今日日程数据
- [x] 检索过程显示"Mosa 正在了解你的日程..."加载状态
- [x] Agent 检索到昨日未完成任务时，主动展示温馨提醒消息
- [x] Agent 检索到今日无日程时，主动展示温馨规划引导
- [x] Agent 第一条主动消息内容包含日程摘要 + 个性化温馨建议

## 思路链（Thinking Chain）
- [x] 复杂推理回复中包含 `【思考】...【/思考】` 标记
- [x] Agent 消息气泡上方显示"💭 思路过程"折叠入口
- [x] 默认折叠，点击展开后显示推理步骤（等宽字体、浅色背景）
- [x] 展开/折叠有平滑动画 + 箭头旋转指示
- [x] 无思路链标记的回复不显示入口
- [x] 思路链内容与正文清晰分离

## 毛玻璃化 UI
- [x] `Color.kt`/`Theme.kt` 包含毛玻璃语义 token（glassBg, glassBorder）
- [x] `GlassSurface.kt` 可复用毛玻璃容器组件可用
- [x] Mosa 对话页顶部导航栏为毛玻璃效果
- [x] Agent 聊天气泡为毛玻璃卡片样式
- [x] 日程卡片、确认卡片为毛玻璃面板
- [x] 快捷操作 Chip 为毛玻璃胶囊按钮
- [x] 输入区域为毛玻璃底栏
- [x] 深色/浅色模式下毛玻璃效果均正确
- [x] 二级页面导航栏为毛玻璃效果

## 悬浮 Agent FAB
- [x] 二级页面右下角有毛玻璃 Agent FAB 按钮
- [x] 点击 FAB 弹出毛玻璃 Agent 对话 Bottom Sheet（AgentSheetContent）
- [x] Bottom Sheet 内可正常对话交互
- [x] 关闭 Bottom Sheet 后对话状态保留
- [x] Android 和 Uni-app 端 FAB 样式一致

## 对话式操作
- [x] 输入"今天有什么安排"→Agent 温馨回复 + 毛玻璃日程卡片
- [x] 输入"明天下午3点加XX"→毛玻璃确认卡片，确认后日程写入成功
- [x] 输入"切换到深色模式"→主题切换成功 + 温馨确认消息
- [x] 日程卡片上的"查看完整日程"可跳转至 ScheduleScreen

## Agent 主动推送
- [x] 日程冲突时 Agent 以关切口吻提示 + 建议备选时间
- [x] 用户可选择"仍然添加"或"调整到建议时间"

## 底层模型
- [x] `AiApiClient.kt` 中 `DEEPSEEK_MODEL` 已改为 `"deepseek-v4-flash"`
- [x] CHAT 模式对话正常响应
- [x] DEEP_PLANNING 模式对话正常响应
- [x] 模型切换后响应速度有提升

## Uni-app 端
- [x] Mosa 对话页具备完整对话 + 思路链 + 毛玻璃效果
- [x] 启动时 Agent 主动检索并展示第一条温馨消息
- [x] 聊天毛玻璃气泡样式与 Android 端一致
- [x] 思路链折叠组件正常
- [x] 打字指示器动画正常

## 视觉一致性
- [x] 两端毛玻璃聊天气泡样式统一
- [x] 两端 Mosa 头像资源一致
- [x] 两端思路链折叠组件样式统一
- [x] 两端快捷操作 Chip 样式统一
- [x] 两端 AgentFAB + 毛玻璃样式统一

## 原有功能不受影响
- [x] 日程查看/添加/修改/删除功能正常
- [x] 课表功能正常
- [x] 个人设置功能正常（主题切换、账号管理等）
- [x] 词汇学习（vocab 子应用）功能正常（如有启用）
- [x] 深度规划（DEEP_PLANNING）功能正常