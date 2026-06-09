const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const pmPaths = require('../paths.js');

const TEST_PORT = 5199;
const BACKEND_PORT = 8080;
const APP_DIR = path.join(__dirname, '..');
const TEST_TIMEOUT = 60000;
const DEFAULT_TEST_SERVER_URL = `http://127.0.0.1:${TEST_PORT}`;

let electronProcess = null;
let testServerUrl = null;
let backendServerUrl = null;
let controlToken = '';

function log(level, msg) {
    const ts = new Date().toISOString().split('T')[1].slice(0, 12);
    const prefix = { info: ' ℹ', pass: ' ✓', fail: ' ✗', warn: ' ⚠' }[level] || '  ';
    console.log(`[${ts}]${prefix} ${msg}`);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function httpRequest(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, testServerUrl || DEFAULT_TEST_SERVER_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' }
        };
        const isControlRequest = String(url.port) === String(TEST_PORT);
        if (isControlRequest && controlToken && url.pathname !== '/health') {
            options.headers['X-Control-Token'] = controlToken;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, ...parsed });
                } catch {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function testExec(command, params = {}) {
    const result = await httpRequest('POST', '/test/exec', { command, params });
    return result;
}

async function testQuery(target) {
    const result = await httpRequest('GET', `/test/query?target=${encodeURIComponent(target)}`);
    return result;
}

async function backendApi(method, urlPath, body) {
    const result = await testExec('backend-request', {
        method,
        path: urlPath,
        body
    });
    const status = result && result.data ? result.data.status : 500;
    const payload = result && result.data ? result.data.body : null;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return { status, ...payload };
    }
    return { status, raw: payload };
}

function refreshControlToken() {
    controlToken = process.env.PLANMOSAIC_CONTROL_TOKEN || pmPaths.readControlToken() || '';
    return controlToken;
}

async function waitForTestServer(timeoutMs = 30000) {
    const start = Date.now();
    testServerUrl = DEFAULT_TEST_SERVER_URL;

    while (Date.now() - start < timeoutMs) {
        try {
            refreshControlToken();
            const res = await httpRequest('GET', '/health');
            if (res.status === 200 && res.ready) {
                backendServerUrl = typeof res.backend === 'string' && res.backend ? res.backend : backendServerUrl;
                log('info', 'Test server ready');
                return true;
            }
        } catch (e) {}
        await sleep(500);
    }
    throw new Error('Test server did not become ready within timeout');
}

async function waitForBackend(timeoutMs = 30000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            let backendReportedRunning = false;
            const controlRes = await httpRequest('GET', '/health');
            if (controlRes.status === 200 && typeof controlRes.backend === 'string' && controlRes.backend) {
                backendServerUrl = controlRes.backend;
            }
            if (controlRes.status === 200 && controlRes.pythonRunning) {
                backendReportedRunning = true;
            }
            const backendRes = await testQuery('backend');
            if (backendRes && backendRes.success && backendRes.data && backendRes.data.running) {
                backendServerUrl = backendRes.data.url || backendServerUrl;
                backendReportedRunning = true;
            }
            if (backendReportedRunning) {
                const rawHealth = await testExec('backend-raw-request', {
                    method: 'GET',
                    path: '/health'
                });
                if (rawHealth && rawHealth.success && rawHealth.data && rawHealth.data.status === 200) {
                    log('info', 'Python backend ready');
                    return true;
                }
            }
        } catch (e) {}
        await sleep(500);
    }
    throw new Error('Python backend did not become ready within timeout');
}

function startApp() {
    return new Promise((resolve, reject) => {
        log('info', 'Starting Electron app in test mode...');
        testServerUrl = DEFAULT_TEST_SERVER_URL;
        backendServerUrl = null;
        controlToken = '';
        const electronBinary = require('electron');

        let settled = false;
        const startupTimer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('App start timeout'));
        }, 30000);

        electronProcess = spawn(electronBinary, ['.'], {
            cwd: APP_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                PLANMOSAIC_TEST_MODE: '1',
                ELECTRON_ENABLE_LOGGING: '0'
            },
            shell: false
        });

        electronProcess.on('error', (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(startupTimer);
            log('fail', `Failed to start Electron: ${err.message}`);
            reject(err);
        });

        electronProcess.on('exit', (code) => {
            log('warn', `Electron process exited with code ${code}`);
            electronProcess = null;
        });

        electronProcess.stdout.on('data', (data) => {
            const text = data.toString();
            if (text.includes('[TEST_READY]')) {
                if (settled) return;
                settled = true;
                clearTimeout(startupTimer);
                log('info', 'Electron test mode ready');
                resolve();
            }
        });

        electronProcess.stderr.on('data', (data) => {
            const text = data.toString().trim();
            if (text) {
                console.log(`  [electron] ${text}`);
            }
        });
    });
}

function stopApp() {
    return new Promise((resolve) => {
        if (electronProcess) {
            log('info', 'Stopping Electron app...');
            electronProcess.kill('SIGTERM');
            setTimeout(() => {
                if (electronProcess) {
                    electronProcess.kill('SIGKILL');
                }
                electronProcess = null;
                resolve();
            }, 3000);
        } else {
            resolve();
        }
    });
}

function runTests(tests) {
    const results = [];
    const startTime = Date.now();

    async function runOne(name, fn) {
        const tStart = Date.now();
        try {
            await fn();
            const elapsed = Date.now() - tStart;
            log('pass', `${name} (${elapsed}ms)`);
            results.push({ name, status: 'pass', elapsed });
        } catch (err) {
            const elapsed = Date.now() - tStart;
            log('fail', `${name} (${elapsed}ms)`);
            console.log(`       Error: ${err.message}`);
            results.push({ name, status: 'fail', elapsed, error: err.message });
        }
    }

    return {
        runOne,
        async done() {
            const total = results.length;
            const passed = results.filter(r => r.status === 'pass').length;
            const failed = total - passed;
            const totalTime = Date.now() - startTime;

            console.log(`\n${'='.repeat(50)}`);
            console.log(` Results: ${passed}/${total} passed, ${failed} failed (${totalTime}ms)`);
            console.log('='.repeat(50));

            return { results, passed, failed, total, totalTime };
        }
    };
}

module.exports = {
    TEST_PORT, BACKEND_PORT, APP_DIR,
    log, sleep, httpRequest, testExec, testQuery, backendApi,
    waitForTestServer, waitForBackend, startApp, stopApp, runTests
};
