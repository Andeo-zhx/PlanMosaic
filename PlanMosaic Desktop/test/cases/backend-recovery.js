const { testExec, testQuery, sleep, log, waitForBackend } = require('../harness');

module.exports = {
    run: async function (runOne) {
        await runOne('终止后端后检测到退出', async () => {
            const execResult = await testExec('kill-backend');
            if (!execResult.success) {
                throw new Error(`kill-backend failed: ${execResult.error}`);
            }

            await sleep(500);

            const queryResult = await testQuery('backend');
            if (!queryResult.success) {
                throw new Error(`testQuery backend failed: ${queryResult.error}`);
            }
            if (queryResult.data.running !== false) {
                throw new Error(`Expected backend running to be false, got: ${queryResult.data.running}`);
            }

            log('info', 'Backend termination detected successfully');
        });

        await runOne('后端自动重启', async () => {
            const maxWait = 10;
            let restarted = false;

            for (let i = 0; i < maxWait; i++) {
                await sleep(1000);

                const queryResult = await testQuery('backend');
                if (!queryResult.success) {
                    log('warn', `testQuery backend attempt ${i + 1} failed: ${queryResult.error}`);
                    continue;
                }

                if (queryResult.data.running === true) {
                    restarted = true;
                    log('info', `Backend restarted after ${i + 1} seconds`);
                    break;
                }

                log('info', `Waiting for backend restart... (${i + 1}/${maxWait})`);
            }

            if (!restarted) {
                throw new Error(`Backend did not restart within ${maxWait} seconds`);
            }

            await waitForBackend(15000);
            log('info', 'Backend health endpoint recovered successfully');
        });
    }
};
