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
    console.log(h.bold('AI 提供商:'));
    const provider = config.agent?.provider || 'deepseek';
    console.log(h.cyan(`  当前提供商: ${provider}`));
    console.log('');

    console.log(h.bold('API 密钥:'));
    if (config.api?.deepseek?.key) {
        const masked = config.api.deepseek.key.substring(0, 4) + '****' + config.api.deepseek.key.slice(-4);
        console.log(h.green(`  DeepSeek: ${masked} ✓`));
    } else {
        console.log(h.dim('  DeepSeek: 未配置'));
    }
    if (config.api?.qwen?.key) {
        const masked = config.api.qwen.key.substring(0, 4) + '****' + config.api.qwen.key.slice(-4);
        console.log(h.green(`  Qwen:     ${masked} ✓`));
    } else {
        console.log(h.dim('  Qwen:     未配置'));
    }

    console.log('');
    console.log(h.bold('模型:'));
    if (config.api?.deepseek?.model) {
        console.log(h.cyan(`  DeepSeek: ${config.api.deepseek.model}`));
    }
    if (config.api?.qwen?.model) {
        console.log(h.cyan(`  Qwen:     ${config.api.qwen.model}`));
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

function setProvider(provider, username) {
    if (!['deepseek', 'qwen'].includes(provider)) {
        h.error('无效的提供商，可选: deepseek, qwen');
        return;
    }

    const config = h.loadConfig(username);
    config.agent = config.agent || {};
    config.agent.provider = provider;

    if (h.saveConfig(config, username)) {
        h.success(`AI 提供商已切换为: ${provider}`);
        notifyUI('toast.success', { message: `CLI: 提供商已切换为 ${provider}` });
    }
}

function setModel(modelType, provider, username) {
    if (!['flash', 'pro'].includes(modelType)) {
        h.error('无效的模型类型，可选: flash, pro');
        return;
    }

    provider = provider || 'deepseek';
    const modelName = provider === 'deepseek'
        ? (modelType === 'pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash')
        : (modelType === 'pro' ? 'qwen-pro' : 'qwen3.5-plus');

    const config = h.loadConfig(username);
    config.api = config.api || {};
    config.api[provider] = config.api[provider] || {};
    config.api[provider].model = modelName;

    if (h.saveConfig(config, username)) {
        h.success(`${provider} 模型已切换为: ${modelName}`);
        notifyUI('toast.success', { message: `CLI: 模型已切换为 ${modelName}` });
    }
}

function setApiKey(provider, key, username) {
    if (!['deepseek', 'qwen'].includes(provider)) {
        h.error('无效的提供商，可选: deepseek, qwen');
        return;
    }
    if (!key || key.length < 20) {
        h.error('API Key 格式无效，请提供完整的密钥');
        return;
    }

    const config = h.loadConfig(username);
    config.api = config.api || {};
    config.api[provider] = config.api[provider] || {};
    config.api[provider].key = key;

    if (h.saveConfig(config, username)) {
        const masked = key.substring(0, 4) + '****' + key.slice(-4);
        h.success(`${provider} API Key 已设置: ${masked}`);
        notifyUI('toast.success', { message: `CLI: ${provider} API Key 已更新` });
    }
}

function setBaseUrl(provider, url, username) {
    if (!['deepseek', 'qwen'].includes(provider)) {
        h.error('无效的提供商，可选: deepseek, qwen');
        return;
    }
    if (!url || !url.startsWith('http')) {
        h.error('无效的 URL 格式');
        return;
    }

    const config = h.loadConfig(username);
    config.api = config.api || {};
    config.api[provider] = config.api[provider] || {};
    config.api[provider].baseUrl = url;

    if (h.saveConfig(config, username)) {
        h.success(`${provider} API URL 已设置: ${url}`);
        notifyUI('toast.success', { message: `CLI: ${provider} URL 已更新` });
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
        case 'provider':
            if (!args[1]) {
                h.error('请指定提供商: deepseek 或 qwen');
                return;
            }
            setProvider(args[1], username);
            break;
        case 'model':
            if (!args[1]) {
                h.error('请指定模型类型: flash 或 pro');
                return;
            }
            setModel(args[1], args[2], username);
            break;
        case 'apikey':
        case 'key':
            if (!args[1] || !args[2]) {
                h.error('请指定提供商和 API Key');
                h.info('用法: node cli.js config apikey <deepseek|qwen> <key>');
                return;
            }
            setApiKey(args[1], args[2], username);
            break;
        case 'url':
            if (!args[1] || !args[2]) {
                h.error('请指定提供商和 URL');
                h.info('用法: node cli.js config url <deepseek|qwen> <url>');
                return;
            }
            setBaseUrl(args[1], args[2], username);
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
    console.log(h.cyan('  show, view              ') + '查看当前配置');
    console.log(h.cyan('  provider <name>         ') + '切换AI提供商 (deepseek/qwen)');
    console.log(h.cyan('  model <type> [provider] ') + '切换模型 (flash/pro)');
    console.log(h.cyan('  apikey <provider> <key> ') + '设置API密钥');
    console.log(h.cyan('  url <provider> <url>    ') + '设置API地址');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js config show');
    console.log('  node cli.js config provider qwen');
    console.log('  node cli.js config model pro');
    console.log('  node cli.js config apikey deepseek sk-abc123...');
}

module.exports = { run, showConfig, printConfigHelp };