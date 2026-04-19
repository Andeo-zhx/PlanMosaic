# Tasks

- [x] Task 1: 更新主题与色彩系统
  - [x] SubTask 1.1: 修改 `Color.kt`，引入干净的背景色和一组具有生命力的高饱和度点缀色（CourseIndicatorColors）。
  - [x] SubTask 1.2: 修改 `Theme.kt` 和 `Type.kt`，应用新的色彩系统，并优化字体排版（字重、行高）以增强界面的现代感。

- [x] Task 2: 重新设计底部导航栏
  - [x] SubTask 2.1: 重构 `BottomNavBar.kt`，将其设计为悬浮胶囊式（Floating Pill-shaped）或具有现代极简风格的底部栏，并为选中状态添加平滑的背景滑动动画。

- [x] Task 3: 重构日程页面 (ScheduleScreen)
  - [x] SubTask 3.1: 优化 `WeeklyDateStrip`，使用圆润的选中胶囊和 Spring 动画，并高亮当天日期。
  - [x] SubTask 3.2: 优化 `CourseTimeSlotCard` 和 `TaskItem`，使用更大的圆角（例如 16dp）、轻柔的阴影效果，以及鲜艳的分类指示条。
  - [x] SubTask 3.3: 重新设计 `AddTaskBottomSheet` 和 FAB 按钮，使其视觉上更轻量且充满活力。

- [x] Task 4: 重构聊天页面 (MosaScreen)
  - [x] SubTask 4.1: 更新 `ChatBubble`，为用户的消息气泡使用鲜艳的主题色，AI 消息使用带微阴影的白色/深灰色卡片。
  - [x] SubTask 4.2: 优化底部的消息输入框（OutlinedTextField）和发送按钮，采用大圆角和无边框设计。

- [x] Task 5: 重构个人主页 (ProfileScreen)
  - [x] SubTask 5.1: 重新设计 `ProfileScreen.kt`，将列表项放入带圆角的卡片（Card）中，代替原有的简单分割线。
  - [x] SubTask 5.2: 优化头像展示区和登录注册页面的视觉层级，引入微渐变或鲜艳图标。

# Task Dependencies
- [Task 2], [Task 3], [Task 4], [Task 5] depends on [Task 1]
