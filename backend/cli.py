#!/usr/bin/env python3
import calendar
import json
import os
import shutil
import sys
from datetime import date

try:
    from backend.paths import get_data_file_path, get_app_data_dir, ensure_app_data_dir, DATA_FILES
except ImportError:
    _parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _parent_dir not in sys.path:
        sys.path.insert(0, _parent_dir)
    from backend.paths import get_data_file_path, get_app_data_dir, ensure_app_data_dir, DATA_FILES

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

CYAN_BOLD = '\x1b[1;36m'
RESET = '\x1b[0m'


def _try_migrate_legacy():
    new_data_file = get_data_file_path()
    if os.path.exists(new_data_file):
        return

    has_legacy = any(os.path.exists(os.path.join(SCRIPT_DIR, f)) for f in DATA_FILES)
    if not has_legacy:
        return

    ensure_app_data_dir()
    target_dir = os.path.dirname(new_data_file)

    print(f'[Paths] Migrating data from {SCRIPT_DIR} -> {target_dir}')

    for filename in DATA_FILES:
        src = os.path.join(SCRIPT_DIR, filename)
        dst = os.path.join(target_dir, filename)
        if os.path.exists(src) and not os.path.exists(dst):
            try:
                shutil.copy2(src, dst)
                print(f'[Paths] Migrated: {filename}')
                os.remove(src)
                print(f'[Paths] Removed legacy file: {filename}')
            except OSError as e:
                print(f'[Paths] Migration failed for {filename}: {e}', file=sys.stderr)

    legacy_backup = os.path.join(SCRIPT_DIR, 'backups')
    new_backup = os.path.join(target_dir, 'backups')
    if os.path.exists(legacy_backup) and not os.path.exists(new_backup):
        try:
            shutil.copytree(legacy_backup, new_backup)
            print('[Paths] Migrated: backups/')
            shutil.rmtree(legacy_backup)
            print('[Paths] Removed legacy directory: backups/')
        except OSError as e:
            print(f'[Paths] Backup migration failed: {e}', file=sys.stderr)

    print('[Paths] Migration complete.')


def load_data():
    try:
        data_path = get_data_file_path()
        with open(data_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError) as err:
        print('错误: 无法加载 data.json 文件', file=sys.stderr)
        print(str(err), file=sys.stderr)
        sys.exit(1)


def format_date(year, month, day):
    return f'{year:04d}-{month:02d}-{day:02d}'


def print_calendar(year, month, schedules):
    days_in_month = calendar.monthrange(year, month)[1]
    first_day = date(year, month, 1)
    start_day = (first_day.weekday() + 1) % 7

    print(f'\n     {year}年 {month}月')
    print('日 一 二 三 四 五 六')

    line = ''
    for _ in range(start_day):
        line += '   '

    for day in range(1, days_in_month + 1):
        date_str = format_date(year, month, day)
        has_schedule = schedules and date_str in schedules
        day_str = f'{day:2d}'
        display = f'{CYAN_BOLD}{day_str}{RESET}' if has_schedule else day_str
        line += display + ' '
        if (start_day + day) % 7 == 0:
            print(line)
            line = ''

    if line.strip():
        print(line)

    print()
    print(f'说明: {CYAN_BOLD}高亮{RESET} 日期表示有安排')


def print_day_schedule(date_str, schedules):
    schedule = schedules.get(date_str)
    if not schedule:
        print(f'日期 {date_str} 没有安排。')
        return

    print(f'\n📅 {date_str} - {schedule["title"]}')
    print(f'🌟 {schedule["highlights"]}')
    if schedule.get('milestone'):
        print(f'🏆 里程碑: {schedule["milestone"]}')
    print('\n时间安排:')
    for slot in schedule.get('timeSlots', []):
        print(f'  {slot["time"]}  {slot["icon"]} {slot["activity"]}')
        if slot.get('detail'):
            print(f'     {slot["detail"]}')


def print_help():
    print('''
学业规划系统 - 命令行工具

用法:
  python -m backend.cli [选项]

选项:
  -m YYYY-MM    显示指定月份的日历 (例如: -m 2026-03)
  -d YYYY-MM-DD 显示指定日期的详细安排 (例如: -d 2026-03-01)
  -h, --help    显示此帮助信息

示例:
  python -m backend.cli             显示当前月日历
  python -m backend.cli -m 2026-03  显示2026年3月日历
  python -m backend.cli -d 2026-03-01 显示2026年3月1日的详细安排
''')


def parse_args():
    args = sys.argv[1:]
    today = date.today()
    year = today.year
    month = today.month
    day = None
    i = 0

    while i < len(args):
        if args[i] == '-m' and i + 1 < len(args):
            try:
                parts = args[i + 1].split('-')
                year = int(parts[0])
                month = int(parts[1])
                i += 1
            except (ValueError, IndexError):
                print('错误: -m 参数格式应为 YYYY-MM', file=sys.stderr)
                sys.exit(1)
        elif args[i] == '-d' and i + 1 < len(args):
            try:
                parts = args[i + 1].split('-')
                year = int(parts[0])
                month = int(parts[1])
                day = int(parts[2])
                i += 1
            except (ValueError, IndexError):
                print('错误: -d 参数格式应为 YYYY-MM-DD', file=sys.stderr)
                sys.exit(1)
        elif args[i] in ('-h', '--help'):
            print_help()
            sys.exit(0)
        i += 1

    return year, month, day


def main():
    _try_migrate_legacy()
    year, month, day = parse_args()
    data = load_data()
    schedules = data.get('schedules', {})

    if day is not None:
        date_str = format_date(year, month, day)
        print_day_schedule(date_str, schedules)
    else:
        print_calendar(year, month, schedules)


if __name__ == '__main__':
    main()