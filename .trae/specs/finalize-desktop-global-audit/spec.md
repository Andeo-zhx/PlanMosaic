# Desktop 端最终全局审计与修复 Spec

## Why
当前 Desktop 端已经历多轮修复与专项审计，但用户要求进行“最后一次”覆盖全部功能的全局检查、问题挖掘、修复与自测，确保正式交付前不存在明显功能缺陷、稳定性问题或体验断点。
本次变更需要把既有零散审计结果收束为一次统一验收，补齐遗漏问题，并在完成后输出一份可交付的详细功能报告与技术原理说明。

## What Changes
- 对 Desktop 端所有核心功能执行一次端到端全局巡检，覆盖主进程、渲染层、预加载桥接、Python 后端、本地数据读写、AI 交互与设置系统
- 基于巡检结果修复发现的功能缺陷、稳定性问题、状态同步错误、数据一致性问题、异常处理缺口与明显体验断点
- 补充并执行必要的回归验证、场景化手测与可复现脚本测试，直到关键路径全部通过
- 统一记录本轮发现、修复、验证证据与残余风险，形成详细功能报告
- 在功能报告中逐模块说明实现机制、调用链路、数据流与关键技术原理

## Impact
- Affected specs: desktop 全局质量审计、场景驱动验收、稳定性回归、功能报告交付
- Affected code: `PlanMosaic Desktop/main.js`、`PlanMosaic Desktop/preload.js`、`PlanMosaic Desktop/index.html`、`PlanMosaic Desktop/ai-agent.js`、`backend/server.py`、`backend/tool_executor.py`、`backend/config.py`、`backend/time_estimation/model.py` 及相关测试/脚本

## ADDED Requirements
### Requirement: Desktop 端全功能最终巡检
系统 SHALL 对 Desktop 端全部已交付功能执行一次最终全局巡检，并形成明确的问题清单、修复动作与验证结果。

#### Scenario: 覆盖全部核心模块
- **WHEN** 开始本轮最终审计
- **THEN** 巡检范围必须覆盖主进程、渲染层、预加载桥接、Python 后端、数据存储、AI 工作流、设置与外部交互

#### Scenario: 发现问题后闭环处理
- **WHEN** 巡检过程中发现功能、稳定性或一致性问题
- **THEN** 系统必须记录问题现象、定位原因、完成修复并重新验证相关路径

### Requirement: Desktop 端自测与回归通过
系统 SHALL 在修复后执行必要的自动化验证、脚本验证与场景化手动测试，确保关键功能路径可正常工作。

#### Scenario: 关键路径回归
- **WHEN** 完成一轮问题修复
- **THEN** 必须重新验证 AI 对话、日程读写、审批落盘、设置变更、应用重启恢复、异常处理等关键路径

#### Scenario: 存在测试失败
- **WHEN** 任一自动化或手动验证失败
- **THEN** 必须继续修复并重复测试，直到所有关键检查项通过

### Requirement: 交付详细功能报告
系统 SHALL 在全部工作完成后输出一份详细功能报告，说明功能范围、测试结果、发现与修复的问题，并逐部分解释技术原理。

#### Scenario: 生成交付报告
- **WHEN** 所有修复与验证完成
- **THEN** 必须产出包含功能分区、实现机制、调用链路、数据流、技术原理、验证结果与残余风险的完整报告

## MODIFIED Requirements
### Requirement: 质量审计输出
既有审计流程在本次变更中不再以单个专项问题列表为主，而是以“全功能最终验收”作为统一目标，要求将问题发现、修复、自测和报告交付整合为一次完整闭环。

## REMOVED Requirements
### Requirement: 仅做局部专项修复
**Reason**: 用户当前要求的是 Desktop 端所有功能的最终全局检查，而不是局部模块的单点修复。
**Migration**: 既有专项审计结果作为本轮基线输入保留，但执行方式升级为统一巡检、统一修复、统一验证与统一报告。
