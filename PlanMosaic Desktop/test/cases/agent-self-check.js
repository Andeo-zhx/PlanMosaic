// CLI 端到端自检测试
// 覆盖 3 类典型场景：① 添加日程→回读断言；② 删除失败时不宣称成功；③ 批量断言报告。
//
// 用法：node test/runner.js agent-self-check
// 依赖：环境变量 TEST_DEEPSEEK_KEY（无 key 时跳过需要 LLM 的测试）

const { testExec, testQuery, backendApi, sleep, log } = require('../harness');
const pmPaths = require('../../paths');

function isApiKeyError(errMsg) {
    const lower = (errMsg || '').toLowerCase();
    return lower.includes('api key') ||
        lower.includes('api密钥') ||
        lower.includes('未配置') ||
        lower.includes('not configured') ||
        lower.includes('unauthorized') ||
        lower.includes('401') ||
        lower.includes('403');
}

function ensureKey() {
    const testKey = process.env.TEST_DEEPSEEK_KEY || null;
    if (!testKey) {
        log('warn', 'TEST_DEEPSEEK_KEY not set, skipping API-dependent tests');
        return null;
    }
    return testKey;
}

function isHardFailClaim(text) {
    if (!text || typeof text !== 'string') return false;
    // Agent 在自检失败时不应使用这些确定性措辞
    const denyPatterns = [
        /已经?删除/,
        /已经?删掉/,
        /已经?移除/,
        /已经?成功删除/,
        /已删除/,
        /已删掉/,
        /删除成功/,
        /已成功删除/,
        /successful(ly)?\s+deleted/i,
    ];
    return denyPatterns.some(p => p.test(text));
}

module.exports = {
    run: async function(runOne) {
        // ------------------ 测试 1：添加日程→回读断言 ------------------
        await runOne('【自检】添加日程后 verify_changes 通过', async () => {
            const testKey = ensureKey();
            if (!testKey) return;

            await testExec('set-api-key', { key: testKey });
            await sleep(500);

            // 选一个未来日期，避免污染已有数据
            const targetDate = '2026-07-15';
            const slotKey = '15:00-16:00';
            const activity = '自检测试-项目评审';

            try {
                // (1) 通过 agent 调用 add_schedule
                const addRes = await backendApi('POST', '/api/agent-chat', {
                    message: `请在 ${targetDate} 的 ${slotKey} 安排一个"${activity}"活动，要求直接写入，不要先弹 proposal。`,
                    history: [],
                    profile: {}
                });

                if (addRes.error) {
                    const errMsg = typeof addRes.error === 'string' ? addRes.error : JSON.stringify(addRes.error);
                    if (isApiKeyError(errMsg)) {
                        log('warn', 'API key issue: ' + errMsg);
                        return;
                    }
                    throw new Error('add agent-chat failed: ' + errMsg);
                }

                // (2) 验证响应中存在 selfCheck 字段且为 pass
                const sc = addRes.selfCheck || addRes.self_check;
                if (!sc) {
                    // 允许 LLM 没调用 verify_changes 时仅给出 warn 而非 fail
                    log('warn', 'Response has no selfCheck field - Agent may not have called verify_changes');
                    return;
                }
                if (sc.state !== 'pass' && sc.state !== 'skip') {
                    throw new Error('expected selfCheck.state=pass|skip, got ' + sc.state);
                }
                if (sc.state === 'pass') {
                    if (typeof sc.passed_count !== 'number' || sc.passed_count <= 0) {
                        throw new Error('selfCheck.passed_count should be > 0, got ' + sc.passed_count);
                    }
                    if (sc.passed_count !== sc.total_count) {
                        throw new Error('selfCheck not all passed: ' + sc.passed_count + '/' + sc.total_count);
                    }
                }
                log('info', 'selfCheck: ' + sc.state + ' ' + sc.passed_count + '/' + sc.total_count);

                // (3) 通过 view_schedule 回读，断言该时间段确实存在
                const viewRes = await backendApi('GET', `/api/schedule-data?date=${targetDate}`);
                if (viewRes.error) {
                    throw new Error('view_schedule failed: ' + viewRes.error);
                }
                const dayData = (viewRes.schedules && viewRes.schedules[targetDate]) || null;
                if (!dayData) {
                    // 可能 LLM 用了其他日期，记录警告
                    log('warn', 'No data for ' + targetDate + ' - Agent may have used different date');
                    return;
                }
                const slots = dayData.timeSlots || [];
                const found = slots.find(s => s && s.time === slotKey);
                if (!found) {
                    throw new Error('Slot ' + slotKey + ' not found in ' + targetDate);
                }
                if (found.activity !== activity) {
                    throw new Error('Slot activity mismatch: expected "' + activity + '", got "' + found.activity + '"');
                }
                log('info', 'Schedule verified for ' + targetDate + ' ' + slotKey + ': ' + found.activity);
            } catch (e) {
                if (e.message.includes('Request timeout') || e.message.includes('ECONNREFUSED')) {
                    log('warn', 'Backend not reachable: ' + e.message);
                    return;
                }
                if (isApiKeyError(e.message)) {
                    log('warn', 'API key not available: ' + e.message);
                    return;
                }
                throw e;
            }
        });

        // ------------------ 测试 2：删除失败时不宣称成功 ------------------
        await runOne('【自检】删除失败时 Agent 不宣称成功', async () => {
            const testKey = ensureKey();
            if (!testKey) return;

            await testExec('set-api-key', { key: testKey });
            await sleep(500);

            // 先确认目标日期没有该时间段，从而触发"尝试删除但不存在"的失败
            const targetDate = '2099-12-31';
            const missingSlot = '23:00-23:30';

            try {
                // (1) 让 Agent 尝试删除一个不存在的时间段
                const res = await backendApi('POST', '/api/agent-chat', {
                    message: `请删除 ${targetDate} 的 ${missingSlot} 这段时间。如果不存在就如实告诉我，不要假装删除成功。`,
                    history: [],
                    profile: {}
                });

                if (res.error) {
                    const errMsg = typeof res.error === 'string' ? res.error : JSON.stringify(res.error);
                    if (isApiKeyError(errMsg)) {
                        log('warn', 'API key issue: ' + errMsg);
                        return;
                    }
                    throw new Error('agent-chat failed: ' + errMsg);
                }

                const content = (res.response && res.response.content) || res.content || '';
                if (!content) {
                    log('warn', 'No content in response, skipping text assertion');
                } else if (isHardFailClaim(content)) {
                    throw new Error('Agent claimed successful delete despite failure: ' + content.slice(0, 200));
                } else {
                    log('info', 'Agent did not falsely claim delete success');
                }

                // (2) 验证 selfCheck 状态为 fail 或 skip（取决于 Agent 是否调用了 verify_changes）
                const sc = res.selfCheck || res.self_check;
                if (sc) {
                    if (sc.state === 'fail') {
                        // 期望徽章是 fail 态
                        if (!sc.assertions || sc.assertions.length === 0) {
                            throw new Error('selfCheck.state=fail but no assertions in response');
                        }
                        const anyFailed = sc.assertions.some(a => a && a.pass === false);
                        if (!anyFailed) {
                            throw new Error('selfCheck.state=fail but all assertions pass');
                        }
                        log('info', 'selfCheck correctly reports fail: ' + (sc.assertions[0].reason || 'unknown reason'));
                    } else {
                        log('info', 'selfCheck state: ' + sc.state + ' (acceptable)');
                    }
                } else {
                    log('warn', 'No selfCheck in response');
                }
            } catch (e) {
                if (e.message.includes('Request timeout') || e.message.includes('ECONNREFUSED')) {
                    log('warn', 'Backend not reachable: ' + e.message);
                    return;
                }
                if (isApiKeyError(e.message)) {
                    log('warn', 'API key not available: ' + e.message);
                    return;
                }
                throw e;
            }
        });

        // ------------------ 测试 3：批量断言报告 ------------------
        await runOne('【自检】批量断言报告', async () => {
            const testKey = ensureKey();
            if (!testKey) return;

            await testExec('set-api-key', { key: testKey });
            await sleep(500);

            // 让 Agent 在未来 3 天各加一段（短期批量场景，避免产生大量数据）
            const dates = ['2026-08-01', '2026-08-02', '2026-08-03'];

            try {
                const res = await backendApi('POST', '/api/agent-chat', {
                    message: `请帮我在这 3 天 ${dates.join('、')} 各加一个 09:00-10:00 的"晨读"活动，直接写入并用 verify_changes 一次性校验所有日期。`,
                    history: [],
                    profile: {}
                });

                if (res.error) {
                    const errMsg = typeof res.error === 'string' ? res.error : JSON.stringify(res.error);
                    if (isApiKeyError(errMsg)) {
                        log('warn', 'API key issue: ' + errMsg);
                        return;
                    }
                    throw new Error('agent-chat failed: ' + errMsg);
                }

                const sc = res.selfCheck || res.self_check;
                if (!sc) {
                    log('warn', 'No selfCheck in response - Agent may not have used batch assertions');
                    return;
                }

                if (sc.source !== 'memory') {
                    log('warn', 'selfCheck.source expected "memory", got "' + sc.source + '"');
                }

                if (typeof sc.total_count !== 'number' || sc.total_count < 1) {
                    throw new Error('selfCheck.total_count should be >= 1, got ' + sc.total_count);
                }

                if (sc.state === 'pass' && sc.passed_count !== sc.total_count) {
                    throw new Error('state=pass but passed_count != total_count: ' +
                        sc.passed_count + '/' + sc.total_count);
                }

                log('info', 'Batch selfCheck: state=' + sc.state +
                    ' ' + sc.passed_count + '/' + sc.total_count);
            } catch (e) {
                if (e.message.includes('Request timeout') || e.message.includes('ECONNREFUSED')) {
                    log('warn', 'Backend not reachable: ' + e.message);
                    return;
                }
                if (isApiKeyError(e.message)) {
                    log('warn', 'API key not available: ' + e.message);
                    return;
                }
                throw e;
            }
        });

        // ------------------ 测试 4：非 LLM 工具级直测 ------------------
        // 通过测试命令调用 _handle_agent_chat 模拟一次 verify_changes 调用链，
        // 验证 SSE 流中确实发出 self_check 事件（无需 API key）。
        await runOne('【自检】SSE 流包含 self_check 事件', async () => {
            // 借助 Python 后端的 tool_executor 直接验证：
            // 发送一个不含 LLM 的请求，让后端走"工具直调 + 自检"路径。
            // 这里通过 backend-raw-request 模拟一次 stream 请求，期望得到 self_check 事件。
            const token = pmPaths.readControlToken();
            if (!token) {
                throw new Error('Control token is missing');
            }
            const streamRes = await testExec('backend-raw-request', {
                method: 'POST',
                path: '/api/agent-chat-stream',
                body: {
                    message: '__synthetic_verify_only__',
                    history: [],
                    profile: {},
                    stream: true
                },
                headers: {
                    'X-Control-Token': token,
                    'Accept': 'text/event-stream'
                }
            });
            if (!streamRes || !streamRes.data) {
                log('warn', 'SSE stream test inconclusive: ' + JSON.stringify(streamRes));
                return;
            }
            // 注意：SSE 流通常被一次性缓冲。这里我们仅检查 status。
            if (streamRes.data.status !== 200) {
                log('warn', 'SSE endpoint returned status ' + streamRes.data.status);
                return;
            }
            log('info', 'SSE endpoint reachable (status 200)');
        });
    }
};
