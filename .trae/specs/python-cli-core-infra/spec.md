# Python CLI 核心基础设施移植 Spec

## Why
`PlanMosaic Desktop/cli/` 目录下有 10 个 JS 模块可以 100% 移植到 Python，但一次性全部移植工作量过大。先移植核心基础设施层（helpers + config + paths），作为后续所有 Python CLI 模块的依赖基础，逐步建立 Python 端完整的 CLI 能力。

## What Changes
- **新增** `backend/helpers.py` — 移植 `cli/helpers.js` 全部 16 个函数
  - ANSI 颜色工具（color/bold/dim/red/green/yellow/blue/magenta/cyan/white）
  - 日志输出（success/error/warn/info）
  - 日期工具（formatDate/parseDate/parseYearMonth/getWeekDayName）
  - 数据读写（loadData/saveData/loadConfig/saveConfig/loadAgentLog）
  - 文本工具（pad/rpad/separator/table）
- **修改** `backend/config.py` — 补全配置写回能力，新增 6 个函数
  - `save_config()` / `show_config()` / `set_provider()` / `set_model()` / `set_api_key()` / `set_base_url()`
- **修改** `backend/paths.py` — 补全 3 个缺失函数
  - `clean_legacy_data_for_packaged_app()` / `migrate_from_legacy_dir()` / 更新 `clean_old_backups()` 增加 50MB 总大小限制

## Impact
- Affected specs: 无（纯新增/补全 Python 模块，不改变现有功能）
- Affected code:
  - **新增**: `backend/helpers.py`（~180 行）
  - **修改**: `backend/config.py`（新增 ~100 行）
  - **修改**: `backend/paths.py`（新增 ~80 行）
- 不受影响:
  - 所有 JS CLI 模块（保留不动，Python 移植是并行替代而非替换）
  - Electron 主进程、前端渲染、Android 端、Uni-app 端
  - 现有 JavaScript 测试用例

## ADDED Requirements

### Requirement: Python helpers 模块
系统 SHALL 提供 `backend/helpers.py`，包含与 `cli/helpers.js` 功能完全一致的工具函数集合。

#### Scenario: 颜色输出
- **WHEN** 调用 `color("text", "red")` 或 `red("text")`
- **THEN** 输出带有 ANSI 转义码的红色文本，效果与 JS 版完全一致

#### Scenario: 日志输出
- **WHEN** 调用 `success("操作完成")` / `error("操作失败")` / `warn("警告")` / `info("提示")`
- **THEN** 分别输出 `✓ 操作完成`（绿色）/ `✗ 操作失败`（红色 stderr）/ `⚠ 警告`（黄色 stderr）/ `ℹ 提示`（蓝色）

#### Scenario: 日期格式化
- **WHEN** 调用 `format_date(datetime.date(2026, 3, 1))`
- **THEN** 返回 `"2026-03-01"`

#### Scenario: 日期解析
- **WHEN** 调用 `parse_date("2026-03-01")`
- **THEN** 返回 `datetime.date(2026, 3, 1)`

#### Scenario: 年月解析
- **WHEN** 调用 `parse_year_month("2026-03")`
- **THEN** 返回 `{"year": 2026, "month": 3}`（注意 Python 版 month 为 1-12，与 JS 的 0-11 不同）

#### Scenario: 数据加载
- **WHEN** 调用 `load_data(username)`
- **THEN** 从 `paths.get_data_file_path(username)` 读取 JSON 并返回 Python dict
- **AND** 文件不存在时返回 `{"startDate": "", "endDate": "", "schedules": {}, "settings": {}}`
- **AND** JSON 损坏时打印错误并返回 None

#### Scenario: 数据保存
- **WHEN** 调用 `save_data(data, username)`
- **THEN** 将 data 序列化为格式化的 JSON 写入 data.json
- **AND** 成功返回 True，失败返回 False

#### Scenario: 配置加载/保存
- **WHEN** 调用 `load_config(username)` / `save_config(config, username)`
- **THEN** 行为与 JS 版一致：文件不存在时返回 `{}`，保存出错时返回 False

#### Scenario: Agent 日志加载
- **WHEN** 调用 `load_agent_log(username)`
- **THEN** 返回 `{"userProfile": {}, "conversations": [], "archivedConversations": [], "lastUpdate": ""}`（文件不存在时）

#### Scenario: 表格渲染
- **WHEN** 调用 `table(["姓名", "年龄"], [["张三", "25"], ["李四", "30"]])`
- **THEN** 输出带表头、分隔线、自动列宽的格式化表格

### Requirement: Python config 写回能力
系统 SHALL 在 `backend/config.py` 中提供配置的写回和 CLI 展示功能，与 `cli/config.js` 行为一致。

#### Scenario: 展示配置
- **WHEN** 调用 `show_config(username)`
- **THEN** 打印当前 AI 提供商、API 密钥（脱敏显示前4后4位，中间 `****`）、模型名称、超时、数据路径等信息

#### Scenario: 切换提供商
- **WHEN** 调用 `set_provider("qwen", username)`
- **THEN** config.json 中 `agent.provider` 更新为 `"qwen"`
- **AND** 无效提供商（非 deepseek/qwen）时打印错误并返回

#### Scenario: 切换模型
- **WHEN** 调用 `set_model("pro", "deepseek", username)`
- **THEN** config.json 中 `api.deepseek.model` 更新为 `"deepseek-v4-pro"`
- **AND** flash 类型对应 `deepseek-v4-flash`，pro 对应 `deepseek-v4-pro`

#### Scenario: 设置 API Key
- **WHEN** 调用 `set_api_key("deepseek", "sk-...", username)`
- **THEN** config.json 中 `api.deepseek.key` 更新
- **AND** API Key 长度不足 20 字符时拒绝并打印错误

#### Scenario: 设置 API URL
- **WHEN** 调用 `set_base_url("deepseek", "https://custom.api.com/v1", username)`
- **THEN** config.json 中 `api.deepseek.baseUrl` 更新
- **AND** URL 不以 `http` 开头时拒绝并打印错误

### Requirement: Python paths 补全
系统 SHALL 在 `backend/paths.py` 中补全与 `paths.js` 对应的 3 个缺失函数。

#### Scenario: 打包版清理
- **WHEN** 调用 `clean_legacy_data_for_packaged_app()`
- **THEN** 检查 `.packaged-v2` 标记文件，不存在时删除根目录下的旧全局数据文件（data.json/config.json/settings.json/agent-log.json/backups/），写入标记文件
- **AND** 标记文件已存在时直接返回，不做任何操作

#### Scenario: 数据迁移
- **WHEN** 调用 `migrate_from_legacy_dir(legacy_dir)`
- **THEN** 检查新位置是否已有 data.json，有则跳过
- **AND** 逐一复制旧位置的数据文件到新 AppData 目录，删除旧文件
- **AND** 同步迁移 backups 目录

#### Scenario: 备份清理（含大小限制）
- **WHEN** 调用 `clean_old_backups(file_prefix, username)`
- **THEN** 保留最多 10 个最新备份，删除超出数量的
- **AND** 如果保留的备份总大小超过 50MB，从最旧的开始删除直到总大小降至 50MB 以下
- **AND** 行为与 JS 版 `cleanOldBackups` 完全一致

## MODIFIED Requirements
无（现有 `backend/config.py` 和 `backend/paths.py` 的函数签名和行为不变，仅新增函数）

## REMOVED Requirements
无

## 移植注意事项
1. **Python `parse_year_month` 的 month 为 1-12**（JS 版 `parseYearMonth` 返回 0-11），这是有意的差异，使 Python API 更符合 Python 习惯
2. **`backend/config.py` 的 `load()` 方法签名不变**，新增的 `save_config()` 等函数作为独立函数导出，不影响现有 `_Config` 类的使用
3. **`backend/paths.py` 的现有函数签名不变**，新增函数追加在文件末尾
4. **所有新增函数都应导出到模块顶层**，方便 `from backend.helpers import ...` 使用
5. **JS 版 CLI 模块保留不动**，Python 移植是并行替代方案，不删除任何 JS 文件