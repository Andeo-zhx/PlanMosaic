# Android UI Revamp Spec

## Why
用户希望对 PlanMosaic Android 端的 UI 进行整体修改，使其“获得生命力”并保持与母程序一致的“简洁”风格。当前的 UI 配色较为沉闷（使用了大量纸质、灰褐色调），缺乏现代感与活力。通过引入更明亮干净的背景、高饱和度的强调色、现代化的圆角卡片设计以及流畅的交互动画（Spring 物理动画），我们可以在不破坏原有简洁结构的前提下，为应用注入生命力。

## What Changes
- **Theme & Colors**: 修改 `Color.kt` 和 `Theme.kt`，采用纯净的白色/浅色背景，将原本暗沉的强调色替换为更具活力的高饱和度色彩（如清新的薄荷绿、明亮的珊瑚色、电光紫等），并重新调整暗色模式的对比度。
- **Typography**: 更新 `Type.kt`，确保字体排版层级分明，增加重要信息的字重，使界面呼吸感更强。
- **Bottom Navigation**: 重新设计 `BottomNavBar.kt`，从传统的 Material 底部导航栏改为现代的悬浮式（Floating）或胶囊式（Pill-shaped）设计，并加入丝滑的选中背景动画。
- **Schedule Screen**: 
  - 重新设计顶部的日期选择器（WeeklyDateStrip），选中状态使用圆润的胶囊形状并带有弹性动画（Spring Animation）。
  - 更新课程和任务卡片（CourseTimeSlotCard, TaskItem），使用更大的圆角（16dp-24dp）、轻微的悬浮阴影以及鲜艳的侧边指示条。
  - 优化浮动操作按钮（FAB）和底部弹窗，使其更符合现代极简风格。
- **Mosa Screen**: 优化聊天气泡，区分用户消息（使用鲜艳的强调色背景）和 Mosa 消息（使用干净的卡片背景带微阴影），并优化输入框区域的设计。
- **Profile Screen**: 将原本简单的列表设计升级为更具包裹感的卡片式（Card-based）设置列表，头像区域加入微渐变或鲜活的色彩元素。

## Impact
- Affected specs: Android 端的纯 UI 表现层，不影响核心业务逻辑和数据持久化。
- Affected code:
  - `app/src/main/java/com/example/planmosaic_android/ui/theme/*`
  - `app/src/main/java/com/example/planmosaic_android/ui/components/BottomNavBar.kt`
  - `app/src/main/java/com/example/planmosaic_android/ui/screens/schedule/ScheduleScreen.kt`
  - `app/src/main/java/com/example/planmosaic_android/ui/screens/mosa/MosaScreen.kt`
  - `app/src/main/java/com/example/planmosaic_android/ui/screens/profile/ProfileScreen.kt`

## MODIFIED Requirements
### Requirement: UI Aesthetics
系统 SHALL 提供具有生命力且极简的界面：
- **WHEN** 用户点击交互元素时
- **THEN** 元素应有平滑的缩放或颜色过渡反馈（Touch feedback）。
- **WHEN** 用户浏览日程、聊天和个人页面时
- **THEN** 界面应呈现高对比度的文字、大圆角组件和具有活力的点缀色，且避免视觉杂乱。
