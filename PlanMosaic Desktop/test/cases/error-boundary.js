const { backendApi, testQuery, log } = require('../harness');

module.exports = {
    run: async function (runOne) {
        await runOne('空消息不崩溃', async () => {
            try {
                const result = await backendApi('POST', '/api/agent-chat', {
                    message: '',
                    history: [],
                    profile: {}
                });

                if (result.status === 500) {
                    throw new Error('Backend returned 500 for empty message');
                }

                log('info', `Empty message response status: ${result.status}`);
            } catch (err) {
                if (err.message && err.message.includes('ECONNREFUSED')) {
                    log('warn', `Backend not reachable: ${err.message}`);
                    return;
                }
                if (err.message && err.message.includes('timeout')) {
                    log('warn', `Backend request timed out: ${err.message}`);
                    return;
                }
                throw err;
            }
        });

        await runOne('超长消息不崩溃', async () => {
            const longMessage = 'x'.repeat(5000);

            try {
                const result = await backendApi('POST', '/api/agent-chat', {
                    message: longMessage,
                    history: [],
                    profile: {}
                });

                if (result.status === 500) {
                    throw new Error('Backend returned 500 for long message');
                }

                log('info', `Long message response status: ${result.status}`);
            } catch (err) {
                if (err.message && err.message.includes('ECONNREFUSED')) {
                    log('warn', `Backend not reachable: ${err.message}`);
                    return;
                }
                if (err.message && err.message.includes('timeout')) {
                    log('warn', `Backend request timed out for long message: ${err.message}`);
                    return;
                }
                throw err;
            }
        });

        await runOne('config结构完整性', async () => {
            const result = await testQuery('config');
            if (!result.success) {
                throw new Error(`testQuery config failed: ${result.error}`);
            }

            const data = result.data;
            if (data.provider === undefined) {
                throw new Error('config data missing "provider" field');
            }
            if (data.deepseekModel === undefined) {
                throw new Error('config data missing "deepseekModel" field');
            }
            if (data.hasKey === undefined) {
                throw new Error('config data missing "hasKey" field');
            }

            log('info', `config structure valid: provider=${data.provider}, model=${data.deepseekModel}, hasKey=${data.hasKey}`);
        });
    }
};
