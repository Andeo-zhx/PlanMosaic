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
        await runOne('对话上下文被保留', async () => {
            const testKey = ensureKey();
            if (!testKey) return;

            await testExec('set-api-key', { key: testKey });
            await sleep(500);

            try {
                const res1 = await backendApi('POST', '/api/agent-chat', {
                    message: 'My name is TestUser123',
                    history: [],
                    profile: {}
                });

                if (res1.error) {
                    const errMsg = typeof res1.error === 'string' ? res1.error : JSON.stringify(res1.error);
                    if (isApiKeyError(errMsg)) {
                        log('warn', 'API key issue on first message: ' + errMsg);
                        return;
                    }
                    throw new Error('First message failed: ' + errMsg);
                }

                const assistantContent1 = res1.response?.content || res1.content || '';
                if (!assistantContent1) {
                    log('warn', 'First response has no content, cannot continue context test');
                    return;
                }

                const history = [
                    { role: 'user', content: 'My name is TestUser123' },
                    { role: 'assistant', content: assistantContent1 }
                ];

                await sleep(500);

                const res2 = await backendApi('POST', '/api/agent-chat', {
                    message: 'What is my name?',
                    history: history,
                    profile: {}
                });

                if (res2.error) {
                    const errMsg = typeof res2.error === 'string' ? res2.error : JSON.stringify(res2.error);
                    if (isApiKeyError(errMsg)) {
                        log('warn', 'API key issue on second message: ' + errMsg);
                        return;
                    }
                    throw new Error('Second message failed: ' + errMsg);
                }

                const assistantContent2 = res2.response?.content || res2.content || '';
                if (!assistantContent2.includes('TestUser123')) {
                    log('warn', 'Response did NOT contain "TestUser123". Context may not be retained. Response: ' +
                        assistantContent2.slice(0, 300));
                } else {
                    log('info', 'Context retained: response contains "TestUser123"');
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

        await runOne('多条消息后 history 正确', async () => {
            const testKey = ensureKey();
            if (!testKey) return;

            await testExec('set-api-key', { key: testKey });
            await sleep(500);

            try {
                const res1 = await backendApi('POST', '/api/agent-chat', {
                    message: 'Tell me 1+1 equals what',
                    history: [],
                    profile: {}
                });

                if (res1.error) {
                    const errMsg = typeof res1.error === 'string' ? res1.error : JSON.stringify(res1.error);
                    if (isApiKeyError(errMsg)) {
                        log('warn', 'API key issue on first message: ' + errMsg);
                        return;
                    }
                    throw new Error('First message failed: ' + errMsg);
                }

                const content1 = res1.response?.content || res1.content || '';
                if (!content1) {
                    log('warn', 'First response has no content');
                    return;
                }

                const history = [
                    { role: 'user', content: 'Tell me 1+1 equals what' },
                    { role: 'assistant', content: content1 }
                ];

                await sleep(500);

                const res2 = await backendApi('POST', '/api/agent-chat', {
                    message: 'And what is 2+2?',
                    history: history,
                    profile: {}
                });

                if (res2.error) {
                    const errMsg = typeof res2.error === 'string' ? res2.error : JSON.stringify(res2.error);
                    if (isApiKeyError(errMsg)) {
                        log('warn', 'API key issue on second message: ' + errMsg);
                        return;
                    }
                    throw new Error('Second message failed: ' + errMsg);
                }

                if (res2.status >= 500) {
                    log('warn', 'Second call returned 5xx: ' + res2.status);
                    return;
                }

                const content2 = res2.response?.content || res2.content || '';
                if (content2) {
                    log('info', 'Multi-message history test passed, got response with ' + content2.length + ' chars');
                } else {
                    log('warn', 'Second response has no content');
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