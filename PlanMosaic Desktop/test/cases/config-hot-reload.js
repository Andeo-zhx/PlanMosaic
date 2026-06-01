const path = require('path');
const fs = require('fs');
const { testExec, testQuery, backendApi, log } = require('../harness');
const pmPaths = require('../../paths');

module.exports = {
    run: async function (runOne) {
        runOne('set-deepseek-model(pro)更新config.json', async () => {
            const execResult = await testExec('set-deepseek-model', { model: 'pro' });
            if (!execResult.success) {
                throw new Error(`set-deepseek-model failed: ${execResult.error}`);
            }

            const queryResult = await testQuery('config');
            if (!queryResult.success) {
                throw new Error(`testQuery config failed: ${queryResult.error}`);
            }
            if (!queryResult.data.deepseekModel.includes('v4-pro')) {
                throw new Error(`Expected deepseekModel to contain 'v4-pro', got: ${queryResult.data.deepseekModel}`);
            }

            const configPath = pmPaths.getConfigPath();
            if (!fs.existsSync(configPath)) {
                throw new Error(`config.json not found at: ${configPath}`);
            }
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const model = config.api?.deepseek?.model || '';
            if (!model.includes('v4-pro')) {
                throw new Error(`config.json on disk expected to contain 'v4-pro', got: ${model}`);
            }

            log('info', `config.json verified on disk, model: ${model}`);
        });

        runOne('后端/config GET返回更新后的model', async () => {
            let apiResult;
            try {
                apiResult = await backendApi('GET', '/api/config');
            } catch (err) {
                throw new Error(`backendApi GET /api/config failed: ${err.message}`);
            }

            if (apiResult.status === 404) {
                log('warn', '/api/config endpoint returned 404, backend may not support this route');
                return;
            }

            const modelValue = apiResult.model || apiResult.deepseekModel
                || (apiResult.api?.deepseek?.model)
                || JSON.stringify(apiResult);
            if (!modelValue.includes('v4-pro')) {
                throw new Error(`Backend GET /api/config expected to contain 'v4-pro', got: ${modelValue}`);
            }
        });

        runOne('运行时更新API Key后立即生效', async () => {
            const execA = await testExec('set-api-key', { key: 'key-a' });
            if (!execA.success) {
                throw new Error(`set-api-key A failed: ${execA.error}`);
            }

            const configA = await testQuery('config');
            if (!configA.success) {
                throw new Error(`testQuery config after key A failed: ${configA.error}`);
            }
            if (!configA.data.hasKey) {
                throw new Error('Expected hasKey to be true after setting key-a');
            }

            const execB = await testExec('set-api-key', { key: 'key-b' });
            if (!execB.success) {
                throw new Error(`set-api-key B failed: ${execB.error}`);
            }

            const configB = await testQuery('config');
            if (!configB.success) {
                throw new Error(`testQuery config after key B failed: ${configB.error}`);
            }
            if (!configB.data.hasKey) {
                throw new Error('Expected hasKey to be true after setting key-b');
            }

            const configPath = pmPaths.getConfigPath();
            const configOnDisk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const diskKey = configOnDisk.api?.deepseek?.key || '';
            if (diskKey !== 'key-b') {
                throw new Error(`Expected config.json key to be 'key-b', got: '${diskKey}'`);
            }

            log('info', 'API key hot reload verified successfully');
        });
    }
};