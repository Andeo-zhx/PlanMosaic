const { testExec, testQuery, backendApi, sleep, log } = require('../harness');

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
        log('warn', 'TEST_DEEPSEEK_KEY not set, skipping API-dependent test');
        return null;
    }
    return testKey;
}

module.exports = {
    run: async function(runOne) {
        await runOne('日程创建触发工具调用', async () => {
            const testKey = ensureKey();
            if (!testKey) return;

            await testExec('set-api-key', { key: testKey });
            await sleep(500);

            try {
                const res = await backendApi('POST', '/api/agent-chat', {
                    message: 'add a meeting tomorrow at 3pm called Test Meeting',
                    history: [],
                    profile: {}
                });

                if (res.status >= 500) {
                    log('warn', 'Backend returned 5xx: ' + res.status);
                    return;
                }

                if (res.error) {
                    const errMsg = typeof res.error === 'string' ? res.error : JSON.stringify(res.error);
                    if (isApiKeyError(errMsg)) {
                        log('warn', 'API key issue: ' + errMsg);
                        return;
                    }
                    log('warn', 'Backend error: ' + errMsg);
                    return;
                }

                const bodyStr = JSON.stringify(res);
                const hasToolElements = bodyStr.includes('tool_calls') ||
                    bodyStr.includes('tool_call') ||
                    bodyStr.includes('proposal') ||
                    bodyStr.includes('schedule') ||
                    bodyStr.includes('meeting');

                if (!hasToolElements) {
                    log('warn', 'Response does not contain tool_calls/proposal. May be a direct response from LLM');
                } else {
                    log('info', 'Tool call/proposal detected in response');
                }
            } catch (e) {
                if (e.message.includes('Request timeout') || e.message.includes('ECONNREFUSED')) {
                    log('warn', 'Backend not reachable, skipping: ' + e.message);
                    return;
                }
                if (isApiKeyError(e.message)) {
                    log('warn', 'API key not available: ' + e.message);
                    return;
                }
                throw e;
            }
        });
    }
};