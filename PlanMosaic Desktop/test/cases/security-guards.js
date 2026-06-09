const { testExec, testQuery, log } = require('../harness');
const pmPaths = require('../../paths');

module.exports = {
    run: async function(runOne) {
        await runOne('未授权写请求被后端拒绝', async () => {
            const backend = await testQuery('backend');
            if (!backend.success || !backend.data || !backend.data.url) {
                throw new Error('Unable to resolve backend url');
            }
            const res = await testExec('backend-raw-request', {
                method: 'POST',
                path: '/api/config',
                body: { api: { deepseek: { model: 'x' } } }
            });
            if (!res || !res.data) {
                throw new Error('backend-raw-request failed: ' + JSON.stringify(res));
            }
            if (res.data.status !== 403) {
                throw new Error('Expected 403 for unauthorized config write, got ' + res.data.status);
            }
            log('info', 'Unauthorized config write rejected with 403');
        });

        await runOne('超大请求体被后端拒绝', async () => {
            const backend = await testQuery('backend');
            if (!backend.success || !backend.data || !backend.data.url) {
                throw new Error('Unable to resolve backend url');
            }
            const token = pmPaths.readControlToken();
            if (!token) {
                throw new Error('Control token is missing');
            }
            const res = await testExec('backend-oversized-request', {
                method: 'POST',
                path: '/api/save-schedule',
                bytes: 21 * 1024 * 1024,
                headers: {
                    'X-Control-Token': token
                }
            });
            if (!res || !res.data) {
                throw new Error('backend-raw-request failed: ' + JSON.stringify(res));
            }
            if (res.data.status !== 413) {
                throw new Error('Expected 413 for oversized request, got ' + res.data.status);
            }
            log('info', 'Oversized write rejected with 413');
        });

        await runOne('伪造 proposal 被拒绝', async () => {
            const backend = await testQuery('backend');
            if (!backend.success || !backend.data || !backend.data.url) {
                throw new Error('Unable to resolve backend url');
            }
            const token = pmPaths.readControlToken();
            if (!token) {
                throw new Error('Control token is missing');
            }
            const res = await testExec('backend-raw-request', {
                method: 'POST',
                path: '/api/agent-approve',
                body: {
                    approvalToken: 'bogus-token',
                    proposal: {
                        type: 'delete_task',
                        date: '2026-01-01',
                        taskName: 'Injected task'
                    }
                },
                headers: {
                    'X-Control-Token': token
                }
            });
            if (!res || !res.data) {
                throw new Error('backend-raw-request failed: ' + JSON.stringify(res));
            }
            const isRejected = res.data.status === 400 || (res.data.status === 200 && res.data.body && res.data.body.success === false);
            if (!isRejected) {
                throw new Error('Expected forged proposal to be rejected, got ' + JSON.stringify(res.data));
            }
            log('info', 'Forged proposal rejected with 400');
        });
    }
};
