# 任务列表

## 打包配置修改

- [x] 任务 1: 修改 package.json 打包配置为 NSIS 便携式单文件
  - [x] 子任务 1.1: 将 build.win.target 从 zip 改为 portable
  - [x] 子任务 1.2: 配置 portable 参数
  - [x] 子任务 1.3: 设置 artifactName 为 PlanMosaic${version}-Portable.exe
  - [x] 子任务 1.4: 确保图标配置使用 favicon.ico
  - [x] 子任务 1.5: 确保 WordMosaic 资源正确打包到 extraResources

## 版本号更新

- [x] 任务 2: 更新应用版本号
  - [x] 子任务 2.1: 将 package.json version 从 1.0.0 改为 1.1.0

## 启动优化

- [x] 任务 3: 优化应用启动速度
  - [x] 子任务 3.1: 检查并优化 main.js 启动流程
  - [x] 子任务 3.2: 确保加载非必要模块延迟执行

## API Key 安全检查

- [x] 任务 4: 确保打包不含 API Key
  - [x] 子任务 4.1: 确认 config.json 不存在于打包文件中
  - [x] 子任务 4.2: 验证代码中无硬编码 API Key

## 执行打包

- [x] 任务 5: 执行打包命令
  - [x] 子任务 5.1: 运行 electron-packager 打包命令
  - [x] 子任务 5.2: 使用 7-Zip 创建自解压 exe 文件
