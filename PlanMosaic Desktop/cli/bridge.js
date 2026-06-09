// cli/bridge.js — CLI-to-UI 即发即忘桥接模块
// 所有 CLI 模块通过此模块通知桌面应用 UI 发生变化
// 桌面应用未运行时静默跳过，不影响 CLI 功能

const http = require('http');
const pmPaths = require('../paths.js');

const CONTROL_HOST = '127.0.0.1';
const CONTROL_PORT = 5199;
const UI_TIMEOUT = 2000;

/**
 * 即发即忘通知桌面应用 UI。
 * 应用未运行时为静默空操作。
 *
 * @param {string} action - 动作名 (如 'navigate.calendar', 'toast.success')
 * @param {object} params - 动作参数
 */
function notifyUI(action, params) {
    if (process.env.PLANMOSAIC_NO_UI === '1') return;
    if (!action) return;

    const bodyStr = JSON.stringify({ action, params: params || {} });
    const controlToken = process.env.PLANMOSAIC_CONTROL_TOKEN || pmPaths.readControlToken();

    const options = {
        hostname: CONTROL_HOST,
        port: CONTROL_PORT,
        path: '/ui/action',
        method: 'POST',
        timeout: UI_TIMEOUT,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr)
        }
    };
    if (controlToken) {
        options.headers['X-Control-Token'] = controlToken;
    }

    const req = http.request(options, () => {
        // 丢弃响应 — 即发即忘
    });
    req.on('error', () => {
        // 静默忽略 — 应用未运行是正常情况
    });
    req.on('timeout', () => {
        req.destroy();
    });
    req.write(bodyStr);
    req.end();
}

/**
 * 检查桌面应用是否正在运行。
 * @returns {Promise<boolean>}
 */
function isAppRunning() {
    return new Promise((resolve) => {
        const req = http.get(`http://${CONTROL_HOST}:${CONTROL_PORT}/health`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data).ready === true); }
                catch (e) { resolve(false); }
            });
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
}

module.exports = { notifyUI, isAppRunning };
