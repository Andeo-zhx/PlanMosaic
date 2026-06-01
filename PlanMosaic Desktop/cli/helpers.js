const fs = require('fs');
const path = require('path');
const pmPaths = require('../paths.js');

const COLORS = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
};

function color(text, color) {
    if (!color || !COLORS[color]) return text;
    return COLORS[color] + text + COLORS.reset;
}

function bold(text) { return color(text, 'bold'); }
function dim(text) { return color(text, 'dim'); }
function red(text) { return color(text, 'red'); }
function green(text) { return color(text, 'green'); }
function yellow(text) { return color(text, 'yellow'); }
function blue(text) { return color(text, 'blue'); }
function magenta(text) { return color(text, 'magenta'); }
function cyan(text) { return color(text, 'cyan'); }
function white(text) { return color(text, 'white'); }

function success(msg) { console.log(green('✓ ') + msg); }
function error(msg) { console.error(red('✗ ') + msg); }
function warn(msg) { console.warn(yellow('⚠ ') + msg); }
function info(msg) { console.log(blue('ℹ ') + msg); }

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDate(dateStr) {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
}

function parseYearMonth(ymStr) {
    const match = ymStr.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    return { year: parseInt(match[1], 10), month: parseInt(match[2], 10) - 1 };
}

function loadData(username) {
    const dataFile = pmPaths.getDataFilePath(username);
    if (!fs.existsSync(dataFile)) {
        return { startDate: '', endDate: '', schedules: {}, settings: {} };
    }
    try {
        return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } catch (e) {
        error('无法加载 data.json 文件: ' + e.message);
        return null;
    }
}

function saveData(data, username) {
    try {
        const dataFile = pmPaths.getDataFilePath(username);
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        error('无法保存 data.json 文件: ' + e.message);
        return false;
    }
}

function loadConfig(username) {
    const configFile = pmPaths.getConfigPath(username);
    if (!fs.existsSync(configFile)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveConfig(config, username) {
    try {
        const configFile = pmPaths.getConfigPath(username);
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (e) {
        error('无法保存 config.json 文件: ' + e.message);
        return false;
    }
}

function loadAgentLog(username) {
    const logFile = pmPaths.getAgentLogPath(username);
    if (!fs.existsSync(logFile)) {
        return { userProfile: {}, conversations: [], archivedConversations: [], lastUpdate: '' };
    }
    try {
        return JSON.parse(fs.readFileSync(logFile, 'utf8'));
    } catch (e) {
        return { userProfile: {}, conversations: [], archivedConversations: [], lastUpdate: '' };
    }
}

function getWeekDayName(date) {
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    return names[date.getDay()];
}

function pad(str, len) {
    return String(str).padEnd(len);
}

function rpad(str, len) {
    return String(str).padStart(len);
}

function separator(char, len) {
    return (char || '─').repeat(len || 60);
}

function table(headers, rows, colWidths) {
    if (!colWidths) {
        colWidths = headers.map((h, i) => {
            let max = h.length;
            rows.forEach(r => {
                const cell = String(r[i] || '');
                max = Math.max(max, cell.length);
            });
            return max + 2;
        });
    }

    const headerLine = headers.map((h, i) => pad(h, colWidths[i])).join('');
    console.log(bold(headerLine));
    console.log(dim(separator('─', headerLine.length)));

    rows.forEach(row => {
        const line = row.map((cell, i) => pad(String(cell || ''), colWidths[i])).join('');
        console.log(line);
    });
}

module.exports = {
    COLORS,
    color,
    bold, dim, red, green, yellow, blue, magenta, cyan, white,
    success, error, warn, info,
    formatDate,
    parseDate,
    parseYearMonth,
    loadData,
    saveData,
    loadConfig,
    saveConfig,
    loadAgentLog,
    getWeekDayName,
    pad,
    rpad,
    separator,
    table,
};