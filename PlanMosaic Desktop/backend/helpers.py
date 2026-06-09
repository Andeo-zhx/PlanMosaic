import datetime
import json
import os
import sys

from backend.paths import get_data_file_path, get_config_path, get_agent_log_path

COLORS = {
    'reset': '\x1b[0m',
    'bold': '\x1b[1m',
    'dim': '\x1b[2m',
    'red': '\x1b[31m',
    'green': '\x1b[32m',
    'yellow': '\x1b[33m',
    'blue': '\x1b[34m',
    'magenta': '\x1b[35m',
    'cyan': '\x1b[36m',
    'white': '\x1b[37m',
    'bgRed': '\x1b[41m',
    'bgGreen': '\x1b[42m',
    'bgYellow': '\x1b[43m',
}


def color(text, color_name):
    if not color_name or color_name not in COLORS:
        return text
    return COLORS[color_name] + text + COLORS['reset']


def bold(text):
    return color(text, 'bold')


def dim(text):
    return color(text, 'dim')


def red(text):
    return color(text, 'red')


def green(text):
    return color(text, 'green')


def yellow(text):
    return color(text, 'yellow')


def blue(text):
    return color(text, 'blue')


def magenta(text):
    return color(text, 'magenta')


def cyan(text):
    return color(text, 'cyan')


def white(text):
    return color(text, 'white')


def success(msg):
    sys.stdout.write(green('\u2713 ') + msg + '\n')


def error(msg):
    sys.stderr.write(red('\u2717 ') + msg + '\n')


def warn(msg):
    sys.stderr.write(yellow('\u26a0 ') + msg + '\n')


def info(msg):
    sys.stdout.write(blue('\u2139 ') + msg + '\n')


def format_date(date_val):
    return date_val.strftime('%Y-%m-%d')


def parse_date(date_str):
    import re
    match = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', date_str)
    if not match:
        return None
    return datetime.date(int(match.group(1)), int(match.group(2)), int(match.group(3)))


def parse_year_month(ym_str):
    import re
    match = re.match(r'^(\d{4})-(\d{2})$', ym_str)
    if not match:
        return None
    return {'year': int(match.group(1)), 'month': int(match.group(2))}


def get_week_day_name(date_val):
    names = ['\u65e5', '\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d']
    return names[(date_val.weekday() + 1) % 7]


def load_data(username=None):
    data_file = get_data_file_path(username)
    if not os.path.exists(data_file):
        return {'startDate': '', 'endDate': '', 'schedules': {}, 'settings': {}}
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        error('\u65e0\u6cd5\u52a0\u8f7d data.json \u6587\u4ef6: ' + str(e))
        return None


def save_data(data, username=None):
    try:
        data_file = get_data_file_path(username)
        with open(data_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        error('\u65e0\u6cd5\u4fdd\u5b58 data.json \u6587\u4ef6: ' + str(e))
        return False


def load_config(username=None):
    config_file = get_config_path(username)
    if not os.path.exists(config_file):
        return {}
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(config, username=None):
    try:
        config_file = get_config_path(username)
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        error('\u65e0\u6cd5\u4fdd\u5b58 config.json \u6587\u4ef6: ' + str(e))
        return False


def load_agent_log(username=None):
    log_file = get_agent_log_path(username)
    if not os.path.exists(log_file):
        return {'userProfile': {}, 'conversations': [], 'archivedConversations': [], 'lastUpdate': ''}
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'userProfile': {}, 'conversations': [], 'archivedConversations': [], 'lastUpdate': ''}


def pad(s, length):
    return str(s).ljust(length)


def rpad(s, length):
    return str(s).rjust(length)


def separator(char='\u2500', length=60):
    return char * length


def table(headers, rows, col_widths=None):
    if col_widths is None:
        col_widths = []
        for i, h in enumerate(headers):
            max_len = len(h)
            for r in rows:
                cell = str(r[i]) if i < len(r) else ''
                if len(cell) > max_len:
                    max_len = len(cell)
            col_widths.append(max_len + 2)

    header_line = ''.join(pad(h, col_widths[i]) for i, h in enumerate(headers))
    sys.stdout.write(bold(header_line) + '\n')
    sys.stdout.write(dim(separator('\u2500', len(header_line))) + '\n')

    for row in rows:
        line = ''.join(pad(str(cell) if i < len(row) and row[i] is not None else '', col_widths[i]) for i, cell in enumerate(row))
        sys.stdout.write(line + '\n')