# Tasks

- [x] **Task 1: 添加 `_parent_modified` 参数到 `_call_ai_api_stream`**
  - [x] 在函数签名末尾添加 `_parent_modified=False` 参数
- [x] **Task 2: 在 done 前发送 result 事件**
  - [x] 在 `yield _sse_done()` 前 yield `_sse_event("result", {"shouldRefresh": total_modified})`
  - [x] 计算 `total_modified = has_data_modification or _parent_modified`
- [x] **Task 3: 递归调用传递 `_parent_modified`**
  - [x] L733（工具调用后递归）、L635（HTTP错误重试）、L750（网络错误重试）三处传递 `_parent_modified`
- [x] **Task 4: 修复 `_handle_deep_planning_chat` 的 shouldRefresh**
  - [x] L975: `shouldRefresh: False` → `shouldRefresh: response.get("shouldRefresh", False)`

# Task Dependencies

- Task 1 → Task 2, Task 3
- Task 2 和 Task 3 可并行
- Task 4 独立