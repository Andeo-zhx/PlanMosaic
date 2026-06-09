# 检查清单

## 打包配置

- [x] `package.json` 中 `build.win.target` 实际为 `portable`（x64），无 `nsis` 残留
- [x] `build.portable.artifactName` 显式声明为 `PlanMosaic${version}-Portable.exe`
- [x] `build.files` 显式包含 `Image/**`、`favicon.ico`
- [x] `build.win.icon` 指向 `favicon.ico`
- [x] `build.extraResources` 中包含 `backend` 资源目录

## 产物验证

- [x] `planmosaic desktop/release/PlanMosaic1.1.0-Portable.exe` 文件存在（78,261,372 字节 / ~74.6 MB）
- [x] `release/` 目录中分发目标为单个 `PlanMosaic1.1.0-Portable.exe`；`win-unpacked/` 为构建中间产物，可独立清理
- [x] exe 文件名包含 `1.1.0` 版本号
- [x] exe 版本信息：`FileVersion=1.1.0`、`ProductVersion=1.1.0`、`Product=PlanMosaic`、`FileDescription=学业规划系统桌面应用`
- [x] exe 头为合法 PE：`MZ` (`4D 5A`)

## API Key 卫生

- [x] 在源码中搜索 `sk-`、`DEEPSEEK_API_KEY` 等关键串，无硬编码 Key
- [x] 在产物 `PlanMosaic1.1.0-Portable.exe` 二进制中搜索 `sk-[A-Za-z0-9]{20,}`，无命中
- [x] `config.json` 未出现在 `build.files` 白名单中

## 启动验证

- [x] 双击 `PlanMosaic1.1.0-Portable.exe` 可启动（沙盒中 Start-Process 后进程存活，进程名 `PlanMosaic1.1.0-Portable`）
- [x] 启动后在 `%APPDATA%\PlanMosaic\` 写入 `control-token.json`、`python-backend-port.json`、`Preferences` 等文件，说明 Python 后端已尝试拉起

## 功能验证（需用户手动）

- [ ] 多账户登录后数据落在 `%APPDATA%\PlanMosaic\<hash>\` 隔离目录
- [ ] 用户首次使用需要自行配置 API Key
- [ ] Python 后端（`backend/`）随 exe 一起分发，AI 对话 / 工具调用正常工作

## 重打验证（代码变更后）

- [x] 重新执行 `npm run build` 后，产物 `PlanMosaic1.1.0-Portable.exe` 的 `LastWriteTime` 晚于最近一次源码修改时间（21:58:40 > index.html 19:09:31）
- [x] 新产物二进制中再次 grep `sk-[A-Za-z0-9]{20,}` 无命中
- [x] 新产物 `FileVersion=1.1.0`、`ProductVersion=1.1.0` 不变
- [x] 新 exe 沙盒中 Start-Process 后进程存活（pid=25636，进程名 `PlanMosaic1.1.0-Portable`）
