# Checklist

- [x] 根目录下所有 `.py` 调试/修复脚本已删除（test_*.py, fix_*.py, check_*.py 等）
- [x] `test_results.txt` 已删除
- [x] `调试文件/` 文件夹已从根目录移至 `PlanMosaic Desktop/调试文件/`
- [x] 根目录仅包含以下内容：`.gitignore`、`LICENSE`、`启动PlanMosaic.bat`、`backend/`、`Used/`、`PlanMosaic AndroidStudio/`、`PlanMosaic Desktop/`、`PlanMosaic Uni-app/`、`.trae/`
- [x] `backend/` 目录完整保留在根目录，内容未被修改
- [x] `PlanMosaic Desktop/main.js` 第 550 行 `cwd: path.join(__dirname, '..')` 未变，仍指向根目录
- [x] `PlanMosaic Desktop/package.json` 第 89 行 `"from": "../backend"` 引用未变
- [x] `PlanMosaic Desktop/` 目录内容完整，无文件丢失
- [x] `PlanMosaic AndroidStudio/` 目录内容完整，无文件丢失
- [x] `PlanMosaic Uni-app/` 目录内容完整，无文件丢失