# Checklist

- [x] 流式路径（约第 1700 行）`reasoning_content` 保留条件不再依赖 `modelName.includes('reasoner')`
- [x] 同步路径（约第 1770 行）`reasoning_content` 保留条件不再依赖 `modelName.includes('reasoner')`
- [x] 两条路径的行为一致：只要响应中存在 reasoning_content 就保留
- [x] 代码风格与项目现有模式一致，无不必要的变更