# Tasks

- [x] Task 1: 删除根目录下所有无引用的 Python 调试/修复脚本
  - [x] SubTask 1.1: 列举并确认所有待删除文件
  - [x] SubTask 1.2: 逐个删除以下文件：
    - `test_runner.py`
    - `test_regex.py`
    - `test_regular.py`
    - `test_components.py`
    - `test_final_v2.py`
    - `fix_regex4.py`
    - `fix_regex3.py`
    - `check_raw.py`
    - `test_bytes.py`
    - `test_minimal.py`
    - `test_exact_regex.py`
    - `test_clean_final.py`
    - `test_hex.py`
    - `test_clean.py`
    - `fix_regex_bin.py`
    - `test_regex_final.py`
    - `check_line.py`
    - `fix_regex2.py`
    - `check_chars.py`
    - `test_regex3.py`
    - `test_regex2.py`
    - `fix_regex.py`
    - `check_regex.py`
  - [x] SubTask 1.3: 删除 `test_results.txt`

- [x] Task 2: 移动 `调试文件/` 到 `PlanMosaic Desktop/` 目录下
  - [x] SubTask 2.1: 将 `调试文件/` 整个文件夹移动到 `PlanMosaic Desktop/调试文件/`
  - [x] SubTask 2.2: 确认根目录不再存在 `调试文件/`

- [x] Task 3: 验证根目录整洁度与功能无损
  - [x] SubTask 3.1: 确认根目录仅包含 `.gitignore`、`LICENSE`、`启动PlanMosaic.bat`、`backend/`、`Used/` 及三个子项目文件夹
  - [x] SubTask 3.2: 确认 `backend/` 目录未被移动或修改
  - [x] SubTask 3.3: 确认 `PlanMosaic Desktop/main.js` 中 `cwd: path.join(__dirname, '..')` 未受影响
  - [x] SubTask 3.4: 确认 `PlanMosaic Desktop/package.json` 中 `"from": "../backend"` 引用未受影响

# Task Dependencies
- Task 2 与 Task 1 可并行执行
- Task 3 依赖 Task 1 和 Task 2 完成