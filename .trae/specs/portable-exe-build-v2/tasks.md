# Tasks

## 打包配置修正

- [x] 任务 1: 校正 `package.json` 打包目标为 `portable`
  - [x] 子任务 1.1: 确认 `build.win.target` 指向 `portable`（x64），移除 `nsis` 残留
  - [x] 子任务 1.2: 显式声明 `build.portable.artifactName = PlanMosaic${version}-Portable.exe`
  - [x] 子任务 1.3: 在 `build.files` 中显式包含 `Image/**`、`favicon.ico`
  - [x] 子任务 1.4: `build.win.icon = favicon.ico` 不变
  - [x] 子任务 1.5: 保留 `extraResources` 中 `backend` 资源，使运行时可定位

## 启动与数据目录

- [x] 任务 2: 确认打包后启动路径与数据目录仍指向 `%APPDATA%\PlanMosaic\`
  - [x] 子任务 2.1: 阅读 `main.js` 中 `pmPaths.cleanLegacyDataForPackagedApp()` 调用时机
  - [x] 子任务 2.2: 确认 `paths.js` 的 `getAppDataDir` 在 exe 首次运行时创建用户 hash 子目录

## API Key 卫生

- [x] 任务 3: 打包前清点 API Key
  - [x] 子任务 3.1: 在源码中搜索 `sk-`、`DEEPSEEK_API_KEY`、`api[_-]?key` 等关键字，确认无硬编码
  - [x] 子任务 3.2: 确认 `config.json` 不在 `build.files` 白名单中，避免随包泄露

## 执行构建

- [x] 任务 4: 清理旧构建产物
  - [x] 子任务 4.1: 旧 `win-unpacked/` 目录被 sandbox 锁住，未能在构建前删除；构建过程已自动生成新产物覆盖
- [x] 任务 5: 运行 `npm run build` 产出便携 exe
  - [x] 子任务 5.1: 在 `planmosaic desktop/` 目录下执行 `npm run build`
  - [x] 子任务 5.2: 等待构建完成，捕获构建日志到 `release/build-output.log`
- [x] 任务 6: 验证产物
  - [x] 子任务 6.1: 确认 `release/PlanMosaic1.1.0-Portable.exe` 存在
  - [x] 子任务 6.2: 确认该 exe 是 release 目录中分发目标的便携文件；`win-unpacked/` 仅为构建中间产物
  - [x] 子任务 6.3: 记录 exe 体积、图标、版本信息

## 交付说明

- [x] 任务 7: 输出构建结果摘要（exe 路径、文件大小、版本、图标）
  - [x] 子任务 7.1: 撰写构建报告（最终路径、关键参数、遗留手动验证项）

## 重打（代码变更后）

- [x] 任务 8: 重新打包 - 源码已变（`index.html` / `ai-agent.js` / `main.js` / `preload.js` / `ai-tools.js` / `backend/*.py` 等比上次构建新）
  - [x] 子任务 8.1: 确认 `package.json` 中 portable 配置未变（无需再改）
  - [x] 子任务 8.2: 再次执行 `npm run build` 覆盖旧便携 exe
  - [x] 子任务 8.3: 验证新 exe 文件大小 / 时间戳 / 版本号 / 关键 API Key 命中
  - [x] 子任务 8.4: 更新构建报告

# Task Dependencies
- 任务 5 依赖 任务 1、任务 3、任务 4
- 任务 6 依赖 任务 5
- 任务 7 依赖 任务 6
- 任务 8 依赖 任务 1（仅复核配置）
