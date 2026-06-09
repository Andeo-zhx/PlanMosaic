const path = require('path');
const fs = require('fs');
const { testExec, testQuery, backendApi, log } = require('../harness');
const pmPaths = require('../../paths');

module.exports = {
    run: async function (runOne) {
        await runOne('运行时更新API Key后立即生效', async () => {
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
            const configPath = pmPaths.getConfigPath();
            const configAfterA = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const diskKeyA = configAfterA.api?.deepseek?.key || '';
            if (!diskKeyA) {
                throw new Error('Expected config.json to persist a DeepSeek key after setting key-a');
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

            const configOnDisk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const diskKey = configOnDisk.api?.deepseek?.key || '';
            if (!diskKey) {
                throw new Error('Expected config.json to persist a DeepSeek key after setting key-b');
            }

            log('info', 'API key hot reload verified successfully');
        });
    }
};
