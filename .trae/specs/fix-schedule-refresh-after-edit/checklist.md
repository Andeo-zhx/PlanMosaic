# Checklist

- [x] `_call_ai_api_stream` 函数签名包含 `_parent_modified=False`
- [x] `yield _sse_done()` 之前 yield `result` 事件含 `shouldRefresh`
- [x] 递归调用传递 `_parent_modified=has_data_modification`
- [x] `_handle_deep_planning_chat` L975 使用 `response.get("shouldRefresh", False)`
- [x] main.js 中 `finalResponse?.shouldRefresh` 能正确读取（无需代码修改）