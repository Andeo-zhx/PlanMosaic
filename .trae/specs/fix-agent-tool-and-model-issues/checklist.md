# Checklist

- [x] `main.js` 第 1012 行 `parseTimeRange` 使用对象解构而非数组解构
- [x] `main.js` 第 1015 行 `parseTimeRange` 使用对象解构而非数组解构
- [x] `callDeepseekAPIMessages` 流式路径中 `executeToolCall` 调用有 try/catch 保护
- [x] 工具执行失败后仍将 error JSON 作为 tool message 推入 `currentMessages`
- [x] `getModelForIntent` 函数不再路由到 `REASONER_MODEL_NAME`，始终返回 `MODEL_NAME`
- [x] 代码中不再有通过 `needsReasoning` 结果切换到 `REASONER_MODEL_NAME` 的逻辑
- [x] 代码风格与项目现有模式一致，无不必要的变更