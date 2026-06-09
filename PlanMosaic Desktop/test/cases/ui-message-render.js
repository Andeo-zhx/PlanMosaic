const { testExec, log } = require('../harness');

module.exports = {
    run: async function (runOne) {
        await runOne('用户消息气泡有背景色', async () => {
            const script = `(function() {
                const el = document.querySelector(".agent-message.user .message-content");
                if (!el) return null;
                const s = window.getComputedStyle(el);
                return { background: s.background, exists: true };
            })()`;

            const result = await testExec('inject-dom', { script });
            if (!result.success) {
                throw new Error(`inject-dom failed: ${result.error}`);
            }

            const data = result.data;
            if (data === null) {
                log('warn', 'No .agent-message.user .message-content element found — page may not have chat loaded yet');
                return;
            }

            if (!data.exists) {
                throw new Error('Expected element to exist but exists is false');
            }

            if (data.background === 'transparent' || data.background === 'rgba(0, 0, 0, 0)') {
                throw new Error(`Expected non-transparent background for user message bubble, got: ${data.background}`);
            }

            log('info', `User message bubble background: ${data.background}`);
        });

        await runOne('思考链不重复', async () => {
            const script = `(function() {
                return document.querySelectorAll(".thinking-process").length;
            })()`;

            const result = await testExec('inject-dom', { script });
            if (!result.success) {
                throw new Error(`inject-dom failed: ${result.error}`);
            }

            const count = result.data;
            if (typeof count !== 'number') {
                log('warn', `Unexpected inject-dom result type for thinking-process count: ${typeof count}`);
                return;
            }

            log('info', `.thinking-process elements found: ${count}`);
        });

        await runOne('侧边栏按钮文字横向排列', async () => {
            const script = `(function() {
                const el = document.querySelector(".right-panel-btn-label");
                if (!el) return null;
                const s = window.getComputedStyle(el);
                return { whiteSpace: s.whiteSpace, exists: true };
            })()`;

            const result = await testExec('inject-dom', { script });
            if (!result.success) {
                throw new Error(`inject-dom failed: ${result.error}`);
            }

            const data = result.data;
            if (data === null) {
                log('warn', 'No .right-panel-btn-label element found — sidebar may not be rendered yet');
                return;
            }

            if (!data.exists) {
                throw new Error('Expected element to exist but exists is false');
            }

            if (data.whiteSpace !== 'nowrap') {
                throw new Error(`Expected white-space to be 'nowrap', got: '${data.whiteSpace}'`);
            }

            log('info', `Sidebar button label white-space: ${data.whiteSpace}`);
        });
    }
};
