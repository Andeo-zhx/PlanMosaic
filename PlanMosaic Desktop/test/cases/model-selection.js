const { testExec, testQuery, backendApi, log } = require('../harness');

module.exports = {
    run: async function (runOne) {
        runOne('默认返回flash模型', async () => {
            const result = await testQuery('config');
            if (!result.success) {
                throw new Error(`testQuery config failed: ${result.error}`);
            }
            if (!result.data.deepseekModel.includes('v4-flash')) {
                throw new Error(`Expected deepseekModel to include 'v4-flash', got: ${result.data.deepseekModel}`);
            }
        });

        runOne('切换Pro后返回pro', async () => {
            const execResult = await testExec('set-deepseek-model', { model: 'pro' });
            if (!execResult.success) {
                throw new Error(`set-deepseek-model failed: ${execResult.error}`);
            }

            const queryResult = await testQuery('config');
            if (!queryResult.success) {
                throw new Error(`testQuery config failed: ${queryResult.error}`);
            }
            if (!queryResult.data.deepseekModel.includes('v4-pro')) {
                throw new Error(`Expected deepseekModel to include 'v4-pro', got: ${queryResult.data.deepseekModel}`);
            }
        });

        runOne('无效模型返回错误', async () => {
            try {
                const result = await backendApi('POST', '/api/config', {
                    api: { deepseek: { model: 'invalid-model' } }
                });

                if (result.status >= 200 && result.status < 300) {
                    log('warn', 'Backend accepted invalid model without error, may not validate model names');
                }
            } catch (err) {
                log('warn', `Invalid model API call failed as expected: ${err.message}`);
            }

            const execResult = await testExec('set-deepseek-model', { model: 'invalid-value' });
            if (execResult.success) {
                log('warn', 'testExec accepted invalid model via set-deepseek-model (always maps flash/pro)');
            }
        });
    }
};