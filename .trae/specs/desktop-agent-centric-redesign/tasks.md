# Tasks

## Phase 1: 底层升级（可并行）

- [x] Task 1: 切换 AI 模型 + 优化 System Prompt
  - [x] `main.js`: `MODEL_NAME` 从 `"deepseek-chat"` 改为 `"deepseek-v4-flash"`
  - [x] `main.js`: `buildSystemPrompt()` 重写，注入温馨人格（"贴心日程伙伴 ☀️，像朋友一样陪伴"）、emoji 点缀规范、温柔错误处理、思路链输出要求（`【思考】...【/思考】`）
  - [x] `main.js`: 确认 `REASONER_MODEL` 保持 `"deepseek-reasoner"` 不变
  - [x] 验证：对话回复语气温暖，模型正常响应

- [x] Task 2: Agent 启动主动检索
  - [x] `main.js`: 新增 IPC handler `get-startup-scan`，检索今日日程、昨日未完成任务
  - [x] `preload.js`: 暴露 `getStartupScan()` API
  - [x] `ai-agent.js`: 新增 `performStartupScan()` 函数，调用后端获取数据
  - [x] `ai-agent.js`: 根据时段生成温馨欢迎语（早上好呀～☀️ / 下午好～🌿 / 晚上好～🌙 等）
  - [x] `ai-agent.js`: 生成包含日程摘要的启动消息并推送到对话流
  - [x] 验证：启动后 Agent 自动发第一条消息

## Phase 2: 布局重构（核心）

- [x] Task 3: 主视图互换 - Agent 成为主区域
  - [x] `index.html`: 重构 `main-layout` CSS
    - Agent 面板（`agent-modal`）从悬浮定位改为主区域流式布局
    - 日历区域（`calendar-section`）+ 日程面板（`sidebar-group`）合并为右侧可折叠侧边栏
  - [x] `index.html`: 新增侧边栏切换按钮（toggle button），点击展开/收起
  - [x] `index.html`: Agent 区域自适应布局：侧边栏收起时全宽，展开时自适应缩小
  - [x] `index.html`: 保留深色模式兼容
  - [x] 验证：启动后 Agent 占据中央大面积，日历可切换显示

- [x] Task 4: 悬浮 Agent 面板改为快捷入口
  - [x] `index.html`: 保留现有可拖拽 `agent-modal`，但缩小为浮动圆形按钮（类似 Android FAB）
  - [x] `index.html`: 点击浮动按钮展开 Agent 对话侧面板（原有小窗模式，非主视图）
  - [x] `index.html`: 保留磁吸停靠功能
  - [x] 验证：浮动按钮可点击唤起对话小窗

## Phase 3: 思路链 + 毛玻璃

- [x] Task 5: 实现思路链可折叠 UI
  - [x] `index.html`: 新增 `.thinking-chain` CSS 样式：
    - "💭 思路过程" 折叠入口（默认折叠）
    - 展开/折叠动画（箭头旋转 + 高度过渡）
    - 内容区等宽字体、浅色背景
    - 深色模式样式
  - [x] `ai-agent.js`: 不再静默丢弃 reasoning_content
  - [x] `ai-agent.js`: 解析 AI 回复中的 reasoning_content 和 `【思考】...【/思考】` 标记
  - [x] `ai-agent.js`: 在消息气泡上方渲染思路链组件
  - [x] 验证：复杂对话显示思路链并可折叠展开

- [x] Task 6: 毛玻璃 token 扩展
  - [x] `index.html`: 新增语义 token（如 `--glass-card`、`--glass-sidebar`、`--glass-confirm` 等）
  - [x] `index.html`: 日程卡片应用毛玻璃
  - [x] `index.html`: 确认面板（proposal）应用毛玻璃
  - [x] `index.html`: 侧边栏应用毛玻璃
  - [x] `index.html`: 深色模式毛玻璃值适配
  - [x] 验证：关键模块呈现统一的毛玻璃风格

## Phase 4: 收尾

- [x] Task 7: 原有功能回归验证
  - [x] 深度规划（Deep Planning Modal）功能正常
  - [x] 词汇学习（WordMosaic）入口正常
  - [x] 日程 CRUD 操作正常
  - [x] 任务管理正常
  - [x] 设置面板功能正常
  - [x] 用户切换功能正常
  - [x] 验证：所有原有功能无回归

# Task Dependencies
- Task 1 和 Task 2 可并行（main.js 的不同区域）
- Task 3 依赖 Task 2（需先有启动检索才能显示欢迎页）
- Task 4 依赖 Task 3（需先完成主视图互换）
- Task 5 依赖 Task 1（需先有思路链 prompt 要求）
- Task 6 可独立进行（仅 CSS/token 修改）
- Task 7 依赖 Task 3 + Task 4 + Task 5（布局和功能就绪后回归）