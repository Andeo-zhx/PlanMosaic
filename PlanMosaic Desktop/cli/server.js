const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const h = require('./helpers.js');
const { notifyUI } = require('./bridge.js');

const PYTHON_BACKEND_URL = 'http://127.0.0.1:8080';

function checkBackendHealth() {
    return new Promise((resolve) => {
        const req = http.get(`${PYTHON_BACKEND_URL}/health`, (resp) => {
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(3000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function startPythonBackend() {
    const healthy = await checkBackendHealth();
    if (healthy) {
        h.success('Python 后端已在运行');
        return;
    }

    h.info('正在启动 Python 后端...');

    const processRef = { current: null };

    return new Promise((resolve) => {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const cwd = path.join(__dirname, '..', '..');

        processRef.current = spawn(pythonCmd, ['-m', 'backend.server'], {
            cwd: cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        processRef.current.stdout.on('data', (data) => {
            const text = data.toString().trim();
            if (text) console.log(h.dim('[Python] ') + text);
        });
        processRef.current.stderr.on('data', (data) => {
            const text = data.toString().trim();
            if (text) console.log(h.yellow('[Python] ') + text);
        });
        processRef.current.on('error', (err) => {
            h.error('启动 Python 后端失败: ' + err.message);
            resolve(false);
        });

        let attempts = 0;
        const maxAttempts = 30;
        const interval = setInterval(async () => {
            attempts++;
            const ready = await checkBackendHealth();
            if (ready) {
                clearInterval(interval);
                h.success('Python 后端已就绪');
                notifyUI('toast.success', { message: 'CLI: Python 后端已启动' });
                console.log(h.dim(`后端地址: ${PYTHON_BACKEND_URL}`));
                console.log(h.dim('进程 PID: ' + (processRef.current && processRef.current.pid)));
                resolve(true);
            }
            if (attempts >= maxAttempts) {
                clearInterval(interval);
                h.error('Python 后端启动超时');
                resolve(false);
            }
        }, 500);
    });
}

function startServer() {
    const port = 8081;

    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', service: 'PlanMosaic CLI Server' }));
            return;
        }

        if (req.method === 'GET' && req.url === '/api/schedule-data') {
            try {
                const data = JSON.parse(fs.readFileSync(
                    require('../paths.js').getDataFilePath(), 'utf8'
                ));
                res.writeHead(200);
                res.end(JSON.stringify(data));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            }
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            h.error(`端口 ${port} 已被占用，无法启动服务`);
            h.info('请先停止占用端口的进程，或使用其他端口');
        } else {
            h.error('服务器启动失败: ' + err.message);
        }
    });

    server.listen(port, () => {
        console.log('');
        h.success('PlanMosaic 本地服务器已启动');
        console.log(h.dim(`地址: http://127.0.0.1:${port}`));
        console.log(h.dim('按 Ctrl+C 停止服务器'));
        console.log('');
    });
}

async function status() {
    const backendHealthy = await checkBackendHealth();
    console.log('');
    console.log(h.bold('PlanMosaic 服务状态'));
    console.log(h.dim(h.separator('─', 40)));
    console.log(`  后端服务: ${backendHealthy ? h.green('运行中') : h.red('未运行')}`);
    console.log(`  地址:     ${h.dim(PYTHON_BACKEND_URL)}`);
    notifyUI('toast.info', { message: `CLI: 后端 ${backendHealthy ? '运行中' : '未运行'}` });
}

function run(args) {
    const subCmd = args[0];

    if (!subCmd || subCmd === '-h' || subCmd === '--help' || subCmd === 'help') {
        printServerHelp();
        return;
    }

    switch (subCmd) {
        case 'start':
            if (args[1] === '--http') {
                startServer();
            } else {
                startPythonBackend();
            }
            break;
        case 'status':
            status();
            break;
        default:
            h.error(`未知子命令: ${subCmd}`);
            printServerHelp();
    }
}

function printServerHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic - 服务器管理'));
    console.log('');
    console.log('用法:');
    console.log('  node cli.js server <子命令>');
    console.log('');
    console.log('子命令:');
    console.log(h.cyan('  start            ') + '启动 Python 后端服务');
    console.log(h.cyan('  start --http     ') + '启动独立 HTTP 数据服务');
    console.log(h.cyan('  status           ') + '查看服务运行状态');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js server start');
    console.log('  node cli.js server status');
}

module.exports = { run, startPythonBackend, status, printServerHelp };