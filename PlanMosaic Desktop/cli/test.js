const fs = require('fs');
const path = require('path');
const h = require('./helpers.js');

function runTests(testName) {
    const testDir = path.join(__dirname, '..', 'test');
    if (!fs.existsSync(testDir)) {
        h.error('测试目录不存在');
        return;
    }

    const runnerPath = path.join(testDir, 'runner.js');
    if (!fs.existsSync(runnerPath)) {
        h.error('测试运行器不存在');
        return;
    }

    console.log('');
    console.log(h.bold('PlanMosaic 测试运行器'));
    console.log(h.dim(h.separator('─', 60)));

    try {
        const { spawn } = require('child_process');

        process.env.PLANMOSAIC_TEST_MODE = '1';

        const args = [runnerPath];
        if (testName) args.push(testName);

        const child = spawn('node', args, {
            cwd: testDir,
            stdio: 'inherit',
            env: { ...process.env }
        });

        child.on('exit', (code) => {
            if (code === 0) {
                console.log('');
                h.success('所有测试通过');
            } else {
                console.log('');
                h.error(`测试失败 (退出码: ${code})`);
            }
        });
    } catch (e) {
        h.error('运行测试失败: ' + e.message);
    }
}

function listTests() {
    const testDir = path.join(__dirname, '..', 'test');
    const casesDir = path.join(testDir, 'cases');
    if (!fs.existsSync(casesDir)) {
        console.log(h.dim('\n暂无测试用例'));
        return;
    }

    const files = fs.readdirSync(casesDir)
        .filter(f => f.endsWith('.js'))
        .map(f => f.replace('.js', ''))
        .sort();

    console.log('');
    console.log(h.bold(`测试用例 (共 ${files.length} 个)`));

    const testDescriptions = {
        'api-key-flow': 'API密钥配置流程测试',
        'backend-recovery': '后端恢复测试',
        'chat-flow': '对话流程测试',
        'config-hot-reload': '配置热重载测试',
        'context-retention': '上下文保留测试',
        'error-boundary': '错误边界测试',
        'model-selection': '模型选择测试',
        'tool-call-flow': '工具调用流程测试',
        'ui-message-render': 'UI消息渲染测试'
    };

    files.forEach(f => {
        const desc = testDescriptions[f] || '';
        console.log(h.cyan(`  ${f}`) + (desc ? h.dim(` - ${desc}`) : ''));
    });
    console.log('');
    console.log(h.dim(`运行: node cli.js test run        # 运行全部`));
    console.log(h.dim(`运行: node cli.js test run <名称> # 运行指定`));
}

function run(args) {
    const subCmd = args[0];

    if (!subCmd || subCmd === '-h' || subCmd === '--help' || subCmd === 'help') {
        printTestHelp();
        return;
    }

    switch (subCmd) {
        case 'run':
        case 'start':
            runTests(args[1]);
            break;
        case 'list':
        case 'ls':
            listTests();
            break;
        default:
            h.error(`未知子命令: ${subCmd}`);
            printTestHelp();
    }
}

function printTestHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic - 测试管理'));
    console.log('');
    console.log('用法:');
    console.log('  node cli.js test <子命令> [参数]');
    console.log('');
    console.log('子命令:');
    console.log(h.cyan('  run, start      ') + '运行测试');
    console.log(h.cyan('  run <名称>      ') + '运行指定测试用例');
    console.log(h.cyan('  list, ls        ') + '列出所有测试用例');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js test run');
    console.log('  node cli.js test run chat-flow');
    console.log('  node cli.js test list');
}

module.exports = { run, runTests, listTests, printTestHelp };