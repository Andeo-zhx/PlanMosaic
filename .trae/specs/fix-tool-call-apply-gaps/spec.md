# 工具调用落盘一致性修复 Spec

## Why
当前 Desktop 端的工具调用存在“模型已成功发起工具调用，但实际数据未被修改或修改范围不完整”的问题，尤其集中在需要 proposal 确认的修改类工具。除了 `modify_schedule` 外，课程管理、模板应用等工具也存在 proposal 生成类型与审批执行分支不一致的风险，需要做一次系统性修复与核对。

## What Changes
- 修复修改类工具在“生成 proposal -> 用户确认 -> 后端落盘”链路中的断点
- 建立“工具定义 / tool_executor / 审批执行器”三层之间的类型一致性约束
- 全量排查所有会修改数据的工具，确认其是否为“直接执行”或“确认后执行”，并确保两类语义都真正生效
- 对未实现审批分支的工具返回明确错误，而不是表现为“成功但无实际修改”
- 为工具调用补充覆盖矩阵与回归验证点，防止后续再出现同类脱节

## Impact
- Affected specs: AI Agent 工具调用、日程管理、任务管理、大任务管理、课程管理、模板管理
- Affected code: `PlanMosaic Desktop/backend/tools.py`、`PlanMosaic Desktop/backend/tool_executor.py`、`PlanMosaic Desktop/backend/server.py`、Agent 提案确认链路相关前端代码

## ADDED Requirements
### Requirement: 工具修改链路一致性审计
系统 SHALL 对所有会修改用户数据的工具建立一致性审计清单，明确每个工具属于“直接执行”还是“proposal 确认后执行”，并校验其最终是否存在真实落盘路径。

#### Scenario: 审计修改类工具
- **WHEN** 系统检查 `tools.py` 中暴露的所有可写工具
- **THEN** 每个工具都能映射到唯一且可验证的执行路径
- **AND** 每个需要确认的 proposal 类型都能在审批执行器中找到对应落盘分支

### Requirement: Proposal 类型与审批执行器必须对齐
系统 SHALL 保证任何返回 `proposal` 的工具，其 `proposal.type` 与后端审批执行器支持的类型完全对齐。

#### Scenario: 课程类 proposal 被确认
- **WHEN** `manage_courses` 生成修改、移除、交换、批量调整或导入类 proposal 且用户确认
- **THEN** 后端能够识别对应 `proposal.type`
- **AND** 相关课程数据被真实更新
- **AND** 前端能收到成功结果与刷新信号

#### Scenario: 模板应用 proposal 被确认
- **WHEN** `manage_templates` 生成模板应用 proposal 且用户确认
- **THEN** 模板内容被写入目标日期
- **AND** 返回结果能反映真实修改成功

### Requirement: 不支持的 proposal 必须显式失败
系统 SHALL 在遇到未实现的 proposal 类型时返回明确错误，而不是返回成功文案但不产生任何数据变化。

#### Scenario: 未实现的 proposal 类型
- **WHEN** 用户确认了一个后端尚未实现的 proposal 类型
- **THEN** 接口返回明确的失败原因
- **AND** 不写入任何半成品数据
- **AND** 日志中包含可定位的 proposal 类型信息

## MODIFIED Requirements
### Requirement: 修改类工具的成功语义
所有会修改数据的工具必须满足“成功”只在真实数据修改已完成或提案已成功创建时返回，且两类成功语义需要在接口响应中可区分。

#### Scenario: 直接执行型工具
- **WHEN** 工具属于直接执行型写操作
- **THEN** 返回 `success=true` 时对应数据已经写入
- **AND** 响应中的刷新标记与真实写入结果一致

#### Scenario: 提案确认型工具
- **WHEN** 工具属于提案确认型写操作
- **THEN** 初次工具返回仅表示“提案创建成功”
- **AND** 只有在用户确认后才发生真实写入
- **AND** 确认接口返回结果与实际写入状态一致

## REMOVED Requirements
### Requirement: 默认兜底为通用成功修改
**Reason**: 当前“无法识别 proposal 类型时仍走通用成功路径”会造成用户看到“已修改”，但数据实际未变化。
**Migration**: 改为显式分支匹配；未匹配 proposal 必须报错并记录日志，等待补齐实现后再放行。
