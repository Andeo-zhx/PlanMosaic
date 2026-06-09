# Tasks

- [x] Task 1: 创建 `backend/helpers.py` — 移植 `cli/helpers.js` 全部 16 个函数
  - [x] SubTask 1.1: 移植 ANSI 颜色常量 + `color()` 函数（含 bold/dim/red/green/yellow/blue/magenta/cyan/white 快捷函数）
  - [x] SubTask 1.2: 移植日志输出函数（success/error/warn/info），注意 `error` 输出到 stderr，`warn` 输出到 stderr
  - [x] SubTask 1.3: 移植日期工具函数（format_date/parse_date/parse_year_month/get_week_day_name），注意 Python 的 month 从 1 开始
  - [x] SubTask 1.4: 移植数据读写函数（load_data/save_data/load_config/save_config/load_agent_log），使用 `backend.paths` 模块获取路径
  - [x] SubTask 1.5: 移植文本工具函数（pad/rpad/separator/table），table 函数自动计算列宽
  - [x] SubTask 1.6: 验证：在 Python 中执行 `from backend.helpers import *` 并依次调用每个函数，确认输出与 JS 版一致

- [x] Task 2: 补全 `backend/config.py` — 新增配置写回和 CLI 展示功能
  - [x] SubTask 2.1: 新增 `save_config(config, username)` 函数，将配置写入 config.json
  - [x] SubTask 2.2: 新增 `show_config(username)` 函数，格式化打印当前配置（含密钥脱敏）
  - [x] SubTask 2.3: 新增 `set_provider(provider, username)` 函数，切换 AI 提供商
  - [x] SubTask 2.4: 新增 `set_model(model_type, provider, username)` 函数，切换模型
  - [x] SubTask 2.5: 新增 `set_api_key(provider, key, username)` 函数，设置 API Key
  - [x] SubTask 2.6: 新增 `set_base_url(provider, url, username)` 函数，设置 API URL
  - [x] SubTask 2.7: 验证：确保 `_Config.load()` 的行为不变，新增函数可独立调用

- [x] Task 3: 补全 `backend/paths.py` — 新增 3 个缺失函数
  - [x] SubTask 3.1: 新增 `clean_legacy_data_for_packaged_app()` 函数，使用 `.packaged-v2` 标记文件
  - [x] SubTask 3.2: 新增 `migrate_from_legacy_dir(legacy_dir)` 函数，迁移旧数据文件到 AppData
  - [x] SubTask 3.3: 更新 `clean_old_backups()` 函数，增加 50MB 总大小限制（当前仅按数量限制 10 个）
  - [x] SubTask 3.4: 验证：确保现有函数签名不变，新增函数正确导出

- [x] Task 4: 端到端验证
  - [x] SubTask 4.1: 执行日志输出测试 — success/error/info/warn 全部正常
  - [x] SubTask 4.2: 执行日期格式化测试 — format_date/parse_date/parse_year_month/get_week_day_name 全部正确
  - [x] SubTask 4.3: 执行表格渲染测试 — table() 输出格式正确（bold 表头 + dim 分隔线 + 自动列宽）
  - [x] SubTask 4.4: 执行配置展示测试 — show_config() 脱敏显示密钥、路径信息完整
  - [x] SubTask 4.5: 执行打包清理测试 — clean_legacy_data_for_packaged_app() 不报错
  - [x] SubTask 4.6: 确认 `backend/server.py` 仍能正常启动且 `/health` 返回 200

# Task Dependencies
- Task 2 依赖 Task 1（`config.py` 的新函数需要使用 `helpers.py` 中的日志和颜色函数）
- Task 3 无依赖，可与 Task 1、Task 2 并行
- Task 4 依赖 Task 1、2、3（全部完成后验证）