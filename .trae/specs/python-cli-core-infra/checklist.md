# Checklist

## helpers.py
- [x] `backend/helpers.py` 文件存在，包含全部 16 个导出函数
- [x] `color()` 函数正确包装 ANSI 转义码（支持 reset/bold/dim/red/green/yellow/blue/magenta/cyan/white/bgRed/bgGreen/bgYellow）
- [x] `bold()`/`dim()`/`red()`/`green()`/`yellow()`/`blue()`/`magenta()`/`cyan()`/`white()` 快捷函数正常工作
- [x] `success()` 输出绿色 `✓` + 消息到 stdout
- [x] `error()` 输出红色 `✗` + 消息到 stderr
- [x] `warn()` 输出黄色 `⚠` + 消息到 stderr
- [x] `info()` 输出蓝色 `ℹ` + 消息到 stdout
- [x] `format_date()` 接受 `datetime.date` 返回 `YYYY-MM-DD` 字符串
- [x] `parse_date()` 接受 `YYYY-MM-DD` 返回 `datetime.date`
- [x] `parse_year_month()` 接受 `YYYY-MM` 返回 `{"year": int, "month": int}`（1-12）
- [x] `get_week_day_name()` 返回中文星期名（日/一/二/三/四/五/六）
- [x] `load_data()` 文件不存在时返回默认结构，JSON 损坏时返回 None
- [x] `save_data()` 成功返回 True，失败打印错误并返回 False
- [x] `load_config()` 文件不存在时返回 `{}`
- [x] `save_config()` 成功返回 True，失败返回 False
- [x] `load_agent_log()` 文件不存在时返回默认结构
- [x] `pad()` 左填充字符串到指定长度
- [x] `rpad()` 右填充字符串到指定长度
- [x] `separator()` 生成指定字符的重复分隔线
- [x] `table()` 自动计算列宽并渲染格式化表格（表头加粗 + 分隔线）

## config.py
- [x] `save_config()` 写入 config.json 成功
- [x] `show_config()` 格式化打印配置（含密钥脱敏显示前4后4）
- [x] `set_provider()` 有效值 deepseek/qwen 正常切换，无效值报错
- [x] `set_model()` flash→`deepseek-v4-flash`，pro→`deepseek-v4-pro`（deepseek 提供商）
- [x] `set_model()` flash→`qwen3.5-plus`，pro→`qwen-pro`（qwen 提供商）
- [x] `set_api_key()` 长度不足 20 字符时拒绝，有效密钥写入配置
- [x] `set_base_url()` 不以 http 开头时拒绝，有效 URL 写入配置
- [x] `_Config.load()` 现有行为不变，`server.py` 启动不受影响

## paths.py
- [x] `clean_legacy_data_for_packaged_app()` 标记文件存在时跳过清理
- [x] `clean_legacy_data_for_packaged_app()` 标记文件不存在时清理旧数据并写入标记
- [x] `migrate_from_legacy_dir()` 新位置已有 data.json 时跳过
- [x] `migrate_from_legacy_dir()` 正确迁移数据文件 + backups 目录并删除旧文件
- [x] `clean_old_backups()` 保留最多 10 个最新备份
- [x] `clean_old_backups()` 总大小超过 50MB 时从最旧开始删除
- [x] 现有路径函数签名不变，`server.py` 启动不受影响

## 端到端
- [x] `python -m backend.server` 在 `PlanMosaic Desktop/` 下正常启动
- [x] `/health` 端点返回 200
- [x] 所有 Python 模块 import 无错误