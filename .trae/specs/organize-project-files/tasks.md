# Tasks

- [x] Task 1: 创建 `PlanMosaic Desktop/` 文件夹并移动桌面端文件
  - [x] SubTask 1.1: 创建 `PlanMosaic Desktop/` 目录
  - [x] SubTask 1.2: 移动源码文件：`main.js`, `server.js`, `index.html`, `ai-tools.js`, `ai-agent.js`, `preload.js`, `paths.js`, `cli.js`
  - [x] SubTask 1.3: 移动配置文件：`package.json`, `package-lock.json`
  - [x] SubTask 1.4: 移动资源文件夹：`Image/`, `WordMosaic/`
  - [x] SubTask 1.5: 移动图标文件：`image4.ico` 并重命名为 `favicon.ico`
  - [x] SubTask 1.6: 删除根目录下已移动的旧文件（确认移动成功后再清理）

- [x] Task 2: 移动 Android 构建脚本到 AndroidStudio 目录
  - [x] SubTask 2.1: 移动 `build_apk.bat` 到 `PlanMosaic AndroidStudio/`
  - [x] SubTask 2.2: 移动 `install_apk.bat` 到 `PlanMosaic AndroidStudio/`
  - [x] SubTask 2.3: 调整 `build_apk.bat` 中的 `cd /d` 路径（从 `%~dp0PlanMosaic AndroidStudio` 改为 `%~dp0`）
  - [x] SubTask 2.4: 调整 `install_apk.bat`，添加 `cd /d "%~dp0"` 以确保在正确目录下执行

- [x] Task 3: 修复图标引用路径
  - [x] SubTask 3.1: 确认 `image4.ico` 已重命名为 `favicon.ico` 存在于 `PlanMosaic Desktop/` 下
  - [x] SubTask 3.2: 验证 `main.js` 中 `path.join(__dirname, 'favicon.ico')` 引用正确（文件在同一目录，无需修改）
  - [x] SubTask 3.3: 验证 `index.html` 中 `<link rel="icon" href="favicon.ico">` 引用正确（不需要修改，因为所有文件都在同目录）
  - [x] SubTask 3.4: 验证 `package.json` 中 `"icon": "favicon.ico"` 和 `"favicon.ico"` 引用正确

- [x] Task 4: 验证内部引用路径无需额外调整
  - [x] SubTask 4.1: 确认 `main.js` → `./paths.js`, `./ai-tools.js`, `./preload.js` 引用正确（同目录）
  - [x] SubTask 4.2: 确认 `server.js` → `./ai-tools.js`, `./paths.js` 引用正确（同目录）
  - [x] SubTask 4.3: 确认 `cli.js` → `./paths.js` 引用正确（同目录）
  - [x] SubTask 4.4: 确认 `main.js` 中 `WordMosaic` 子目录的相对路径引用正确（`path.join(__dirname, 'WordMosaic', ...)`）

- [x] Task 5: 在项目根目录创建 `启动PlanMosaic.bat` 快捷脚本
  - [x] SubTask 5.1: 编写 bat 脚本，进入桌面端目录并执行 `npm start`
  - [x] SubTask 5.2: 添加 UTF-8 编码支持（`chcp 65001`）
  - [x] SubTask 5.3: 添加错误检查和友好提示

# Task Dependencies
- Task 2 与 Task 1 可并行执行
- Task 3 依赖 Task 1.5 完成
- Task 4 依赖 Task 1 完成
- Task 5 依赖 Task 1 完成