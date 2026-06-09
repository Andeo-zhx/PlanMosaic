const h = require('./helpers.js');
const { notifyUI } = require('./bridge.js');

function showConfig(username) {
    const config = h.loadConfig(username);
    const data = h.loadData(username);
    const settings = data?.settings || {};

    console.log('');
    console.log(h.bold('PlanMosaic 配置信息'));
    console.log(h.dim(h.separator('─', 55)));

    console.log('');
    console.log(h.bold('API 密钥:'));
    if (config.api?.deepseek?.key) {
        const masked = config.api.deepseek.key.substring(0, 4) + '****' + config.api.deepseek.key.slice(-4);
        console.log(h.green(`  DeepSeek: ${masked} ✓`));
    } else {
        console.log(h.dim('  DeepSeek: 未配置'));
    }

    console.log('');
    console.log(h.bold('模型:'));
    if (config.api?.deepseek?.model) {
        console.log(h.cyan(`  DeepSeek: ${config.api.deepseek.model}`));
    }

    console.log('');
    console.log(h.bold('其他设置:'));
    if (settings.theme) {
        console.log(h.cyan(`  主题: ${settings.theme}`));
    }
    if (config.timeouts?.apiTimeoutMs) {
        console.log(h.cyan(`  API超时: ${config.timeouts.apiTimeoutMs}ms`));
    }

    console.log('');
    console.log(h.bold('数据存储:'));
    const paths = require('../paths.js');
    console.log(h.dim(`  数据目录: ${paths.getAppDataDir(username)}`));
    console.log(h.dim(`  数据文件: ${paths.getDataFilePath(username)}`));
    console.log(h.dim(`  配置文件: ${paths.getConfigPath(username)}`));
    console.log(h.dim(`  日志文件: ${paths.getAgentLogPath(username)}`));
    notifyUI('settings.open');
}

function setApiKey(key, username) {
    if (!key || key.length < 20) {
        h.error('API Key 格式无效，请提供完整的密钥');
        return;
    }

    const config = h.loadConfig(username);
    config.api = config.api || {};
    config.api.deepseek = config.api.deepseek || {};
    config.api.deepseek.key = key;

    if (h.saveConfig(config, username)) {
        const masked = key.substring(0, 4) + '****' + key.slice(-4);
        h.success(`DeepSeek API Key 已设置: ${masked}`);
        notifyUI('toast.success', { message: `CLI: DeepSeek API Key 已更新` });
    }
}

function setBaseUrl(url, username) {
    if (!url || !url.startsWith('http')) {
        h.error('无效的 URL 格式');
        return;
    }

    const config = h.loadConfig(username);
    config.api = config.api || {};
    config.api.deepseek = config.api.deepseek || {};
    config.api.deepseek.baseUrl = url;

    if (h.saveConfig(config, username)) {
        h.success(`DeepSeek API URL 已设置: ${url}`);
        notifyUI('toast.success', { message: `CLI: DeepSeek URL 已更新` });
    }
}

function run(args) {
    const subCmd = args[0];
    const username = undefined;

    if (!subCmd || subCmd === '-h' || subCmd === '--help' || subCmd === 'help') {
        printConfigHelp();
        return;
    }

    switch (subCmd) {
        case 'show':
        case 'view':
            showConfig(username);
            break;
        case 'apikey':
        case 'key':
            if (!args[1]) {
                h.error('请指定 API Key');
                h.info('用法: node cli.js config apikey <key>');
                return;
            }
            setApiKey(args[1], username);
            break;
        case 'url':
            if (!args[1]) {
                h.error('请指定 URL');
                h.info('用法: node cli.js config url <url>');
                return;
            }
            setBaseUrl(args[1], username);
            break;
        default:
            h.error(`未知子命令: ${subCmd}`);
            printConfigHelp();
    }
}

function printConfigHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic - 配置管理'));
    console.log('');
    console.log('用法:');
    console.log('  node cli.js config <子命令> [参数]');
    console.log('');
    console.log('子命令:');
    console.log(h.cyan('  show, view       ') + '查看当前配置');
    console.log(h.cyan('  apikey <key>     ') + '设置DeepSeek API密钥');
    console.log(h.cyan('  url <url>        ') + '设置DeepSeek API地址');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js config show');
    console.log('  node cli.js config apikey sk-abc123...');
}

module.exports = { run, showConfig, printConfigHelp };