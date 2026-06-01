const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TEST_PORT = 5199;
const BACKEND_PORT = 8080;
const APP_DIR = path.join(__dirname, '..');
const TEST_TIMEOUT = 60000;

let electronProcess = null;
let testServerUrl = null;

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
        const url = new URL(urlPath, testServerUrl || `http://127.0.0.1:${TEST_PORT}`);
        const isBackendUrl = url.port == BACKEND_PORT;
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' }
        };

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
    return httpRequest(method, `http://127.0.0.1:${BACKEND_PORT}${urlPath}`, body);
}

async function waitForTestServer(timeoutMs = 30000) {
    const start = Date.now();
    testServerUrl = `http://127.0.0.1:${TEST_PORT}`;

    while (Date.now() - start < timeoutMs) {
        try {
            const res = await httpRequest('GET', '/test/health');
            if (res.status === 200 && res.ready) {
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
            const res = await httpRequest('GET', `http://127.0.0.1:${BACKEND_PORT}/health`);
            if (res.status === 200) {
                log('info', 'Python backend ready');
                return true;
            }
        } catch (e) {}
        await sleep(500);
    }
    throw new Error('Python backend did not become ready within timeout');
}

function startApp() {
    return new Promise((resolve, reject) => {
        log('info', 'Starting Electron app in test mode...');

        electronProcess = spawn('npx', ['electron', '.'], {
            cwd: APP_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                PLANMOSAIC_TEST_MODE: '1',
                ELECTRON_ENABLE_LOGGING: '0'
            },
            shell: true
        });

        electronProcess.on('error', (err) => {
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

        setTimeout(() => reject(new Error('App start timeout')), 30000);
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