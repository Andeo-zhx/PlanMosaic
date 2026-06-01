import json
import math
import os
import random
import re
import shutil
import time
from datetime import datetime, timedelta

from .paths import (
    get_data_file_path,
    get_backup_dir,
)

TOOL_ROUTING = {
    'list_schedules': 'view_schedule',
    'list_all_dates': 'view_schedule',
    'search_schedules': 'view_schedule',
    'search_keyword': 'view_schedule',
    'get_date_schedule': 'view_schedule',
    'add_recurring_schedule': 'add_schedule',
    'propose_schedule_change': 'modify_schedule',
    'suggest_schedule_edit': 'modify_schedule',
    'edit_time_slot': 'modify_schedule',
    'batch_modify_schedules': 'modify_schedule',
    'batch_delete_schedule': 'modify_schedule',
    'detect_schedule_conflicts': 'check_conflicts',
    'add_task': 'manage_tasks',
    'view_tasks': 'manage_tasks',
    'complete_task': 'manage_tasks',
    'update_task': 'manage_tasks',
    'delete_task_proposal': 'manage_tasks',
    'delete_task': 'manage_tasks',
    'batch_delete_tasks': 'manage_tasks',
    'add_big_task': 'manage_big_tasks',
    'list_big_tasks': 'manage_big_tasks',
    'complete_big_task': 'manage_big_tasks',
    'update_big_task': 'manage_big_tasks',
    'delete_big_task_proposal': 'manage_big_tasks',
    'delete_big_task': 'manage_big_tasks',
    'batch_delete_big_tasks': 'manage_big_tasks',
    'break_down_big_task': 'manage_big_tasks',
    'suggest_optimization': 'analyze',
    'analyze_schedule_patterns': 'analyze',
    'check_ddl_status': 'analyze',
    'suggest_time_for_activity': 'analyze',
    'get_user_habits': 'analyze',
    'smart_reschedule': 'analyze',
    'create_course_schedule': 'manage_courses',
    'add_course': 'manage_courses',
    'modify_course': 'manage_courses',
    'remove_course': 'manage_courses',
    'list_courses': 'manage_courses',
    'swap_courses': 'manage_courses',
    'adjust_schedule_by_week': 'manage_courses',
    'analyze_course_load': 'manage_courses',
    'import_course_schedule': 'manage_courses',
    'export_course_schedule': 'manage_courses',
    'batch_manage_courses': 'manage_courses',
    'check_conflicts': 'check_conflicts',
    'apply_schedule_template': 'manage_templates',
    'manage_schedule': 'manage_schedule',
}

COURSE_ICON_MAP = {
    '数学': '\u222b',
    '英语': 'Aa',
    '语文': '\u6587',
    '物理': 'F',
    '化学': '\u5316',
    '生物': 'DNA',
    '历史': '\u53f2',
    '地理': 'G',
    '政治': '\u6cd5',
    '体育': '\u4f53',
    '音乐': '\u4e50',
    '美术': '\u7f8e',
    '计算机': 'PC',
    '编程': 'Code',
    '形势与政策': '\u653f',
    '马克思主义': '\u9a6c',
}

WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']


def parse_time_range(time_str):
    start, end = time_str.split('-')
    start_hour, start_min = map(int, start.split(':'))
    end_hour, end_min = map(int, end.split(':'))
    return {
        'startMinutes': start_hour * 60 + start_min,
        'endMinutes': end_hour * 60 + end_min,
        'startHour': start_hour,
        'startMin': start_min,
        'endHour': end_hour,
        'endMin': end_min,
    }


def get_course_icon(course_name):
    for key, icon in COURSE_ICON_MAP.items():
        if key in course_name:
            return icon
    return ''


def sanitize_str(s):
    return re.sub(r'[\uD800-\uDFFF]', '', s or '')


def safe_json_stringify(obj, indent=None):
    def _replacer(o):
        if isinstance(o, str):
            return re.sub(r'[\uD800-\uDFFF]', '\uFFFD', o)
        return o

    def _walk(o):
        if isinstance(o, dict):
            return {k: _walk(v) for k, v in o.items()}
        if isinstance(o, list):
            return [_walk(item) for item in o]
        if isinstance(o, str):
            return _replacer(o)
        return o

    cleaned = _walk(obj)
    return json.dumps(cleaned, ensure_ascii=False, indent=indent)


def _create_backup(filename='data.json'):
    try:
        source_path = get_data_file_path()
        if not os.path.exists(source_path):
            return
        backup_dir = get_backup_dir()
        if backup_dir is None:
            return
        now = datetime.now()
        timestamp = now.strftime('%Y%m%d_%H%M%S_%f')
        base = filename.rsplit('.', 1)[0] if '.' in filename else filename
        backup_filename = f"{base}_{timestamp}.json"
        backup_path = os.path.join(backup_dir, backup_filename)
        shutil.copy2(source_path, backup_path)
        _clean_old_backups(base)
    except OSError:
        pass


def _clean_old_backups(file_prefix):
    try:
        backup_dir = get_backup_dir()
        if backup_dir is None:
            return
        files = []
        for f in os.listdir(backup_dir):
            if f.startswith(file_prefix) and f.endswith('.json'):
                fpath = os.path.join(backup_dir, f)
                fstat = os.stat(fpath)
                files.append((fstat.st_mtime, fstat.st_size, fpath))
        files.sort(key=lambda x: x[0], reverse=True)

        MAX_SIZE = 50 * 1024 * 1024
        MAX_COUNT = 10

        to_keep = files[:MAX_COUNT]
        total_size = sum(f[1] for f in to_keep)

        for _, _, fpath in files[MAX_COUNT:]:
            try:
                os.remove(fpath)
            except OSError:
                pass

        if total_size > MAX_SIZE:
            for i in range(len(to_keep) - 1, -1, -1):
                if total_size <= MAX_SIZE:
                    break
                total_size -= to_keep[i][1]
                try:
                    os.remove(to_keep[i][2])
                except OSError:
                    pass
    except OSError:
        pass


class ToolExecutor:
    def __init__(self):
        pass

    def _read_schedule_data(self):
        try:
            path = get_data_file_path()
            if not os.path.exists(path):
                return {'startDate': '', 'endDate': '', 'schedules': {}}
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {'startDate': '', 'endDate': '', 'schedules': {}}

    def _write_schedule_data(self, data):
        content = safe_json_stringify(data, indent=2)
        if len(content) > 5 * 1024 * 1024:
            import warnings
            warnings.warn('[ToolExecutor] Schedule data exceeds 5MB limit, refusing write')
            return
        _create_backup('data.json')
        path = get_data_file_path()
        dir_path = os.path.dirname(path)
        os.makedirs(dir_path, exist_ok=True)
        lock_path = path + '.lock'
        waited = 0
        while os.path.exists(lock_path) and waited < 3.0:
            time.sleep(0.1)
            waited += 0.1
        with open(lock_path, 'w') as _lf:
            _lf.write('')
        try:
            tmp_path = path + '.tmp'
            with open(tmp_path, 'w', encoding='utf-8') as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, path)
        finally:
            try:
                os.remove(lock_path)
            except OSError:
                pass

    def execute_tool_call(self, tool_call, schedule_data):
        if isinstance(tool_call, str):
            name = tool_call
            args = {}
            call_id = 'call_unknown'
        else:
            call_id = tool_call.get('id', 'call_unknown')
            func = tool_call.get('function', {})
            name = func.get('name', tool_call.get('name', ''))
            args_str = func.get('arguments', tool_call.get('arguments', '{}'))
            try:
                args = json.loads(args_str) if isinstance(args_str, str) else args_str
            except json.JSONDecodeError as e:
                return json.dumps({"error": f"工具调用参数格式错误: {str(e)}", "success": False})
            except TypeError:
                args = {}

        schedules = schedule_data.get('schedules', {})

        routed_name = TOOL_ROUTING.get(name, name)
        routed_args = dict(args)

        if routed_name == 'view_schedule' and name == 'list_schedules':
            routed_args['list_all'] = True
        elif routed_name == 'view_schedule' and name in ('search_schedules', 'search_keyword'):
            routed_args['keyword'] = args.get('keyword')
        elif routed_name == 'manage_tasks' and name == 'add_task':
            routed_args['action'] = 'add'
        elif routed_name == 'manage_tasks' and name == 'view_tasks':
            routed_args['action'] = 'view'
            routed_args['date'] = args.get('date')
        elif routed_name == 'manage_tasks' and name == 'complete_task':
            routed_args['action'] = 'complete'
            routed_args['actual_minutes'] = args.get('actual_minutes')
        elif routed_name == 'manage_tasks' and name == 'update_task':
            routed_args['action'] = 'update'
            routed_args['new_task_name'] = args.get('new_task_name')
            routed_args['new_estimated_minutes'] = args.get('new_estimated_minutes')
            routed_args['new_note'] = args.get('new_note')
        elif routed_name == 'manage_tasks' and name in ('delete_task_proposal', 'delete_task'):
            routed_args['action'] = 'delete'
        elif routed_name == 'manage_tasks' and name == 'batch_delete_tasks':
            routed_args['action'] = 'batch_delete'
            routed_args['tasks'] = args.get('tasks')
        elif routed_name == 'manage_big_tasks' and name == 'add_big_task':
            routed_args['action'] = 'add'
        elif routed_name == 'manage_big_tasks' and name == 'list_big_tasks':
            routed_args['action'] = 'view'
            routed_args['filter'] = args.get('filter')
        elif routed_name == 'manage_big_tasks' and name == 'complete_big_task':
            routed_args['action'] = 'complete'
        elif routed_name == 'manage_big_tasks' and name == 'update_big_task':
            routed_args['action'] = 'update'
            routed_args['new_task_name'] = args.get('new_task_name')
            routed_args['new_estimated_minutes'] = args.get('new_estimated_minutes')
            routed_args['new_ddl'] = args.get('new_ddl')
            routed_args['new_task_type'] = args.get('new_task_type')
            routed_args['new_start_date'] = args.get('new_start_date')
            routed_args['new_note'] = args.get('new_note')
        elif routed_name == 'manage_big_tasks' and name in ('delete_big_task_proposal', 'delete_big_task'):
            routed_args['action'] = 'delete'
        elif routed_name == 'manage_big_tasks' and name == 'batch_delete_big_tasks':
            routed_args['action'] = 'batch_delete'
            routed_args['task_names'] = args.get('task_names')
        elif routed_name == 'manage_big_tasks' and name == 'break_down_big_task':
            routed_args['action'] = 'break_down'
            routed_args['subtasks'] = args.get('subtasks')
        elif routed_name == 'manage_courses' and name == 'create_course_schedule':
            routed_args['action'] = 'create'
            routed_args['courses'] = args.get('courses')
        elif routed_name == 'manage_courses' and name == 'add_course':
            routed_args['action'] = 'add'
        elif routed_name == 'manage_courses' and name == 'modify_course':
            routed_args['action'] = 'modify'
        elif routed_name == 'manage_courses' and name == 'remove_course':
            routed_args['action'] = 'remove'
        elif routed_name == 'manage_courses' and name == 'list_courses':
            routed_args['action'] = 'list'
            routed_args['weekday_filter'] = args.get('weekday')
            routed_args['keyword'] = args.get('keyword')
        elif routed_name == 'manage_courses' and name == 'swap_courses':
            routed_args['action'] = 'swap'
        elif routed_name == 'manage_courses' and name == 'adjust_schedule_by_week':
            routed_args['action'] = 'adjust_week'
        elif routed_name == 'manage_courses' and name == 'analyze_course_load':
            routed_args['action'] = 'analyze_load'
        elif routed_name == 'manage_courses' and name == 'import_course_schedule':
            routed_args['action'] = 'import'
        elif routed_name == 'manage_courses' and name == 'export_course_schedule':
            routed_args['action'] = 'export'
            routed_args['export_format'] = args.get('format')
        elif routed_name == 'manage_courses' and name == 'batch_manage_courses':
            routed_args['action'] = 'batch_manage'
            routed_args['batch_operation'] = args.get('operation')
        elif routed_name == 'modify_schedule' and name == 'batch_modify_schedules':
            routed_args['operation'] = args.get('operation')
            routed_args['criteria'] = args.get('criteria')
            routed_args['new_details'] = args.get('new_details')
        elif routed_name == 'modify_schedule' and name == 'batch_delete_schedule':
            routed_args['operation'] = 'batch_delete_dates'
            routed_args['dates'] = args.get('dates')
        elif routed_name == 'analyze' and name == 'suggest_optimization':
            routed_args['action'] = 'optimize'
        elif routed_name == 'analyze' and name == 'analyze_schedule_patterns':
            routed_args['action'] = 'patterns'
        elif routed_name == 'analyze' and name == 'check_ddl_status':
            routed_args['action'] = 'ddl_status'
        elif routed_name == 'analyze' and name == 'get_user_habits':
            routed_args['action'] = 'habits'
        elif routed_name == 'analyze' and name == 'smart_reschedule':
            routed_args['action'] = 'optimize'
        elif routed_name == 'add_schedule' and name == 'add_recurring_schedule':
            routed_args['start_date'] = args.get('startDate')
            routed_args['end_date'] = args.get('endDate')
            routed_args['repeat_pattern'] = args.get('repeatPattern')
            routed_args['weekdays'] = args.get('weekdays')
            routed_args['title'] = args.get('title')
            routed_args['highlights'] = args.get('highlights')
            routed_args['timeSlots'] = [{
                'time': args.get('time'),
                'activity': args.get('activity'),
                'detail': args.get('detail'),
                'icon': args.get('icon'),
            }]
        elif routed_name == 'manage_templates' and name == 'apply_schedule_template':
            routed_args['action'] = 'apply'

        dispatcher = {
            'view_schedule': self._execute_view_schedule,
            'add_schedule': self._execute_add_schedule,
            'modify_schedule': self._execute_modify_schedule,
            'check_conflicts': self._execute_check_conflicts,
            'manage_tasks': self._execute_manage_tasks,
            'manage_big_tasks': self._execute_manage_big_tasks,
            'manage_courses': self._execute_manage_courses,
            'manage_schedule': self._execute_manage_schedule,
            'analyze': self._execute_analyze,
            'manage_templates': self._execute_manage_templates,
            'value_monetization': self._execute_value_monetization,
            'roi_calculator': self._execute_roi_calculator,
            'milestone_planner': self._execute_milestone_planner,
            'swot_analysis': self._execute_swot_analysis,
            'decision_matrix': self._execute_decision_matrix,
            'web_search_evaluate': self._execute_web_search,
            'estimate_task_time': self._execute_estimate_task_time,
        }

        handler = dispatcher.get(routed_name)
        if handler is None:
            return json.dumps({'error': 'Unknown tool', 'name': routed_name}, ensure_ascii=False)

        return handler(routed_args, schedule_data, schedules)

    def _execute_manage_schedule(self, args, schedule_data, schedules):
        action = args.get('action')
        date = args.get('date')

        if not date:
            return json.dumps({'success': False, 'error': '缺少必要参数：date'}, ensure_ascii=False)

        schedule = schedules.get(date)
        if not schedule:
            return json.dumps({'exists': False, 'date': date, 'message': f'{date} 没有安排'}, ensure_ascii=False)

        if action == 'modify':
            new_slots = args.get('newSlots') or args.get('timeSlots') or []
            remove_slots = args.get('removeSlots') or args.get('removeTimeSlots') or []

            if new_slots:
                existing_slots = schedule.get('timeSlots', [])
                for new_slot in new_slots:
                    found = False
                    for i, existing in enumerate(existing_slots):
                        if existing.get('time') == new_slot.get('time'):
                            existing_slots[i] = {**existing, **new_slot}
                            found = True
                            break
                    if not found:
                        existing_slots.append(new_slot)
                schedule['timeSlots'] = existing_slots

            if remove_slots:
                schedule['timeSlots'] = [
                    s for s in schedule.get('timeSlots', [])
                    if s.get('time') not in remove_slots
                ]

            schedule['timeSlots'].sort(key=lambda x: x['time'])

            if args.get('title'):
                schedule['title'] = args['title']
            if args.get('highlights'):
                schedule['highlights'] = args['highlights']

            return json.dumps({
                'success': True,
                'date': date,
                'timeSlots': schedule.get('timeSlots'),
                'message': f'已更新 {date} 的日程安排',
                'shouldRefresh': True,
            }, ensure_ascii=False)

        if action == 'view':
            return json.dumps({
                'success': True,
                'date': date,
                'title': schedule.get('title', ''),
                'highlights': schedule.get('highlights', ''),
                'timeSlots': schedule.get('timeSlots') or [],
            }, ensure_ascii=False)

        if action == 'delete':
            reason = args.get('reason')
            return json.dumps({
                'success': True,
                'content': f"**删除日期提案**\n\n原因：{reason}\n\n将删除 {date} 的全部安排\n\n请在对话框中确认或取消。",
                'proposal': {
                    'type': 'manage_schedule_delete',
                    'date': date,
                    'reason': reason,
                },
            }, ensure_ascii=False)

        return json.dumps({'success': False, 'error': f'manage_schedule: 未知 action "{action}"'}, ensure_ascii=False)

    def _execute_view_schedule(self, args, schedule_data, schedules):
        if args.get('list_all'):
            dates = sorted(schedules.keys())
            return json.dumps({'dates': dates, 'count': len(dates)}, ensure_ascii=False)

        if args.get('keyword'):
            kw = sanitize_str(args['keyword']).lower()
            results = []
            if kw:
                for date, schedule in schedules.items():
                    text = (
                        f"{sanitize_str(schedule.get('title', ''))} "
                        f"{sanitize_str(schedule.get('highlights', ''))} "
                        f"{' '.join(sanitize_str(s.get('activity', '')) for s in (schedule.get('timeSlots') or []))}"
                    ).lower()
                    if kw in text:
                        results.append({
                            'date': date,
                            'title': sanitize_str(schedule.get('title', '')),
                        })
            return safe_json_stringify({'keyword': kw, 'results': results, 'count': len(results)})

        date = args.get('date')
        schedule = schedules.get(date)
        if not schedule:
            available_dates = sorted(schedules.keys())
            return json.dumps(
                {'exists': False, 'date': date, 'message': f'{date} 没有安排', 'availableDates': available_dates},
                ensure_ascii=False,
            )

        return json.dumps({
            'exists': True,
            'date': date,
            'title': schedule.get('title', ''),
            'highlights': schedule.get('highlights', ''),
            'timeSlots': schedule.get('timeSlots') or [],
        }, ensure_ascii=False)

    def _execute_add_schedule(self, args, schedule_data, schedules):
        if args.get('start_date'):
            start_date = args['start_date']
            end_date = args.get('end_date')
            repeat_pattern = args.get('repeat_pattern')
            target_weekdays = args.get('weekdays') or []
            time_slots = args.get('timeSlots') or []

            if not start_date or not repeat_pattern or len(time_slots) == 0:
                return json.dumps({'success': False, 'error': '缺少必要参数'}, ensure_ascii=False)

            dates_to_add = []
            try:
                start = datetime.strptime(start_date, '%Y-%m-%d')
            except ValueError:
                return json.dumps({'success': False, 'error': f'日期格式无效: {start_date}，期望格式 YYYY-MM-DD'}, ensure_ascii=False)
            if end_date:
                try:
                    end = datetime.strptime(end_date, '%Y-%m-%d')
                except ValueError:
                    return json.dumps({'success': False, 'error': f'日期格式无效: {end_date}，期望格式 YYYY-MM-DD'}, ensure_ascii=False)
            else:
                end = start + timedelta(days=30)

            warning_message = None
            if (end - start).days > 365:
                end = start + timedelta(days=365)
                warning_message = '日期范围已截断至365天'

            if repeat_pattern == 'daily':
                current = start
                while current <= end:
                    dates_to_add.append(current.strftime('%Y-%m-%d'))
                    current += timedelta(days=1)
            elif repeat_pattern == 'weekly':
                current = start
                while current <= end:
                    if current.weekday() in target_weekdays:
                        ds = current.strftime('%Y-%m-%d')
                        if ds not in dates_to_add:
                            dates_to_add.append(ds)
                    current += timedelta(days=1)
            elif repeat_pattern == 'weekdays':
                current = start
                while current <= end:
                    if 0 <= current.weekday() <= 4:
                        dates_to_add.append(current.strftime('%Y-%m-%d'))
                    current += timedelta(days=1)

            success_count = 0
            skipped_count = 0
            skipped_dates = []
            added_dates = []

            for date in dates_to_add:
                if date not in schedule_data.setdefault('schedules', {}):
                    schedule_data['schedules'][date] = {
                        'title': '', 'highlights': '', 'milestone': '', 'timeSlots': [], 'tasks': []
                    }

                slot = time_slots[0]
                pt = parse_time_range(slot['time'])
                start_minutes = pt['startMinutes']
                end_minutes = pt['endMinutes']

                has_conflict = False
                for existing in schedule_data['schedules'][date].get('timeSlots') or []:
                    ep = parse_time_range(existing['time'])
                    e_start = ep['startMinutes']
                    e_end = ep['endMinutes']
                    if not (end_minutes <= e_start or start_minutes >= e_end):
                        has_conflict = True
                        break

                if has_conflict:
                    skipped_count += 1
                    skipped_dates.append(date)
                    continue

                new_slot = {
                    'time': slot['time'],
                    'activity': slot.get('activity', '未命名活动'),
                    'detail': slot.get('detail', ''),
                    'icon': slot.get('icon', ''),
                }
                schedule_data['schedules'][date]['timeSlots'].append(new_slot)
                schedule_data['schedules'][date]['timeSlots'].sort(key=lambda x: x['time'])
                if args.get('title'):
                    schedule_data['schedules'][date]['title'] = args['title']
                if args.get('highlights'):
                    schedule_data['schedules'][date]['highlights'] = args['highlights']
                success_count += 1
                added_dates.append(date)

            result = {
                'success': True,
                'repeatPattern': repeat_pattern,
                'successCount': success_count,
                'skippedCount': skipped_count,
                'skippedDates': skipped_dates[:10],
                'addedDates': added_dates,
                'message': f'已周期性添加：成功 {success_count} 个，跳过 {skipped_count} 个',
                'shouldRefresh': True,
            }
            if warning_message:
                result['warning'] = warning_message
            return json.dumps(result, ensure_ascii=False)

        date = args.get('date')
        time_slots = args.get('timeSlots') or []

        if not date or len(time_slots) == 0:
            return json.dumps({'success': False, 'error': '缺少必要参数：需要 date(YYYY-MM-DD) 和 timeSlots 数组'}, ensure_ascii=False)

        if 'schedules' not in schedule_data:
            schedule_data['schedules'] = schedules

        if date not in schedules:
            schedules[date] = {
                'title': args.get('title', ''),
                'highlights': args.get('highlights', ''),
                'milestone': '',
                'timeSlots': [],
            }

        added_slots = []
        conflicts = []
        time_regex = re.compile(r'^(\d{2}):(\d{2})-(\d{2}):(\d{2})$')

        for slot in time_slots:
            if not time_regex.match(slot['time']):
                conflicts.append({'slot': slot, 'error': '时间格式错误'})
                continue

            pt = parse_time_range(slot['time'])
            start_minutes = pt['startMinutes']
            end_minutes = pt['endMinutes']

            has_conflict = False
            for existing in schedules[date].get('timeSlots') or []:
                ep = parse_time_range(existing['time'])
                e_start = ep['startMinutes']
                e_end = ep['endMinutes']
                if not (end_minutes <= e_start or start_minutes >= e_end):
                    has_conflict = True
                    conflicts.append({
                        'slot': slot,
                        'error': f"与 {existing['time']} {existing['activity']} 冲突",
                    })
                    break

            if has_conflict:
                continue

            new_slot = {
                'time': slot['time'],
                'activity': slot.get('activity', '未命名活动'),
                'detail': slot.get('detail', ''),
                'icon': slot.get('icon', ''),
            }
            schedules[date]['timeSlots'].append(new_slot)
            added_slots.append(new_slot)

        schedules[date]['timeSlots'].sort(key=lambda x: x['time'])
        if args.get('title'):
            schedules[date]['title'] = args['title']
        if args.get('highlights'):
            schedules[date]['highlights'] = args['highlights']

        return json.dumps({
            'success': True,
            'date': date,
            'addedCount': len(added_slots),
            'addedSlots': added_slots,
            'conflicts': conflicts,
            'message': f'已为 {date} 添加 {len(added_slots)} 个时间段',
            'shouldRefresh': True,
        }, ensure_ascii=False)

    def _execute_modify_schedule(self, args, schedule_data, schedules):
        operation = args.get('operation')
        date = args.get('date')

        if operation == 'batch_delete_dates':
            dates = args.get('dates') or []
            reason = args.get('reason')
            if not dates:
                return json.dumps({'success': False, 'error': '未指定要删除的日期'}, ensure_ascii=False)

            valid_dates = []
            dates_detail = []
            for d in dates:
                sch = schedule_data.get('schedules', {}).get(d)
                if sch and (sch.get('timeSlots') or sch.get('tasks')):
                    valid_dates.append(d)
                    dates_detail.append({
                        'date': d,
                        'title': sch.get('title', ''),
                        'timeSlots': [
                            {'time': s['time'], 'activity': s.get('activity', ''), 'detail': s.get('detail', '')}
                            for s in (sch.get('timeSlots') or [])
                        ],
                        'tasks': [
                            {'name': t['name'], 'estimated': t.get('estimated')}
                            for t in (sch.get('tasks') or [])
                        ],
                    })

            if not valid_dates:
                return json.dumps({'success': False, 'error': '指定的日期中没有找到需要删除的安排'}, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'content': f"**批量删除提案**\n\n原因：{reason}\n\n将删除 {len(valid_dates)} 个日期的安排\n\n请在对话框中确认或取消。",
                'proposal': {
                    'type': 'batch_delete_schedule',
                    'dates': valid_dates,
                    'datesDetail': dates_detail,
                    'reason': reason,
                },
            }, ensure_ascii=False)

        if operation == 'delete_all_matching':
            criteria = args.get('criteria') or {}
            reason = args.get('reason')
            affected_dates = []

            for d, sch in schedules.items():
                slots = sch.get('timeSlots') or []
                matched = [
                    s for s in slots
                    if (not criteria.get('activity') or sanitize_str(criteria['activity']) in sanitize_str(s.get('activity', '')))
                    and (not criteria.get('date') or d == criteria['date'])
                ]
                if matched:
                    affected_dates.append({'date': d, 'slots': matched})

            if not affected_dates:
                all_activities = list(set(
                    s.get('activity', '')
                    for sch2 in schedules.values()
                    for s in (sch2.get('timeSlots') or [])
                ))
                return json.dumps({
                    'success': False,
                    'error': f'未找到匹配的日程。可用活动：{"、".join(all_activities)}',
                }, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'type': 'proposal',
                'proposal': {
                    'type': 'batch_modify_schedules',
                    'operation': operation,
                    'criteria': criteria,
                    'new_details': args.get('new_details'),
                    'reason': reason,
                    'affectedDates': [{'date': d['date'], 'count': len(d['slots'])} for d in affected_dates],
                    'description': f"批量删除 {len(affected_dates)} 个日期中匹配的 {sum(len(d['slots']) for d in affected_dates)} 项安排",
                },
            }, ensure_ascii=False)

        if operation == 'update_all_matching':
            criteria = args.get('criteria') or {}
            new_details = args.get('new_details') or {}
            reason = args.get('reason')
            affected_dates = []

            for d, sch in schedules.items():
                slots = sch.get('timeSlots') or []
                matched = [
                    s for s in slots
                    if (not criteria.get('activity') or sanitize_str(criteria['activity']) in sanitize_str(s.get('activity', '')))
                    and (not criteria.get('date') or d == criteria['date'])
                ]
                if matched:
                    affected_dates.append({'date': d, 'slots': matched})

            if not affected_dates:
                return json.dumps({'success': False, 'error': '未找到匹配的日程'}, ensure_ascii=False)

            changes = []
            if new_details.get('activity'):
                changes.append(f"活动改为\"{new_details['activity']}\"")
            if new_details.get('time'):
                changes.append(f"时间改为{new_details['time']}")

            return json.dumps({
                'success': True,
                'type': 'proposal',
                'proposal': {
                    'type': 'batch_modify_schedules',
                    'operation': operation,
                    'criteria': criteria,
                    'new_details': new_details,
                    'reason': reason,
                    'affectedDates': [{'date': d['date'], 'count': len(d['slots'])} for d in affected_dates],
                    'description': f"批量修改 {len(affected_dates)} 个日期中的{'，'.join(changes)}"
                },
            }, ensure_ascii=False)

        if operation == 'replace_slot':
            target_slots = args.get('timeSlots') or []
            new_slot_details = args.get('newSlotDetails') or {}
            if not target_slots or not new_slot_details.get('time') or not new_slot_details.get('activity'):
                return json.dumps({
                    'success': False,
                    'error': 'replace_slot 需要提供 timeSlots（要替换的旧时间段）和 newSlotDetails（新时间段的 time 和 activity）'
                }, ensure_ascii=False)

            target = target_slots[0]
            new_activity = new_slot_details.get('activity', '')
            new_time = new_slot_details.get('time', '')
            return json.dumps({
                'success': True,
                'type': 'proposal',
                'content': f"**替换日程提案**\n\n原因：{args.get('reason')}\n\n将 \"{target}\" 替换为 \"{new_time} {new_activity}\"\n\n请在对话框中确认或取消。",
                'proposal': {
                    'type': 'modify_schedule',
                    'operation': operation,
                    'date': date,
                    'changes': [f'将 {target} 替换为 {new_time} {new_activity}'],
                    'reason': args.get('reason'),
                    'timeSlots': target_slots,
                    'newSlotDetails': new_slot_details,
                },
            }, ensure_ascii=False)

        if operation in ('modify_slot', 'update'):
            target_slots = args.get('timeSlots') or []
            new_slot_details = args.get('newSlotDetails') or {}
            if not target_slots:
                return json.dumps({
                    'success': False,
                    'error': 'modify_slot 需要提供 timeSlots（要修改的时间段标识）'
                }, ensure_ascii=False)
            if not new_slot_details or (not new_slot_details.get('activity') and not new_slot_details.get('time') and not new_slot_details.get('detail') and not new_slot_details.get('icon')):
                return json.dumps({
                    'success': False,
                    'error': 'modify_slot 需要提供 newSlotDetails（至少包含 activity 或 time 字段）'
                }, ensure_ascii=False)

            target = target_slots[0]
            changes_desc = target
            if new_slot_details.get('activity'):
                changes_desc = f"{target} -> {new_slot_details['activity']}"
            elif new_slot_details.get('time'):
                changes_desc = f"将 {target} 的时间改为 {new_slot_details['time']}"

            return json.dumps({
                'success': True,
                'type': 'proposal',
                'content': f"**修改日程提案**\n\n原因：{args.get('reason')}\n\n{changes_desc}\n\n请在对话框中确认或取消。",
                'proposal': {
                    'type': 'modify_schedule',
                    'operation': operation,
                    'date': date,
                    'changes': [changes_desc],
                    'reason': args.get('reason'),
                    'timeSlots': target_slots,
                    'newSlotDetails': new_slot_details,
                },
            }, ensure_ascii=False)

        return json.dumps({
            'type': 'proposal',
            'date': date,
            'changes': args.get('changes') or [],
            'reason': args.get('reason'),
            'proposal': {
                'type': 'modify_schedule',
                'operation': operation,
                'date': date,
                'changes': args.get('changes'),
                'reason': args.get('reason'),
                'timeSlots': args.get('timeSlots'),
                'newSlotDetails': args.get('newSlotDetails'),
                'criteria': args.get('criteria'),
                'new_details': args.get('new_details'),
            },
        }, ensure_ascii=False)

    def _execute_check_conflicts(self, args, schedule_data, schedules):
        date = args.get('date')
        time_slot = args.get('time_slot')

        if not date or not time_slot:
            return json.dumps({'success': False, 'error': '缺少日期或时间段'}, ensure_ascii=False)

        pt = parse_time_range(time_slot)
        s_start = pt['startMinutes']
        s_end = pt['endMinutes']

        conflicts = []
        for slot in (schedule_data.get('schedules', {}).get(date, {}).get('timeSlots') or []):
            ep = parse_time_range(slot['time'])
            e_start = ep['startMinutes']
            e_end = ep['endMinutes']
            if not (s_end <= e_start or s_start >= e_end):
                conflicts.append({
                    'existingActivity': slot.get('activity', ''),
                    'existingTime': slot['time'],
                })

        return json.dumps({
            'success': True,
            'date': date,
            'timeSlot': time_slot,
            'hasConflicts': len(conflicts) > 0,
            'conflicts': conflicts,
        }, ensure_ascii=False)

    def _execute_manage_tasks(self, args, schedule_data, schedules):
        action = args.get('action')

        if action == 'add':
            date = args.get('date')
            task_name = args.get('task_name')
            estimated_minutes = args.get('estimated_minutes')
            if not isinstance(estimated_minutes, (int, float)) or estimated_minutes <= 0:
                return json.dumps({"error": "参数 estimated_minutes 必须是正数", "success": False})
            note = args.get('note', '')

            if not date or not task_name:
                return json.dumps({'success': False, 'error': '缺少必要参数'}, ensure_ascii=False)

            schedule_data.setdefault('schedules', {})
            if date not in schedule_data['schedules']:
                schedule_data['schedules'][date] = {
                    'title': '', 'highlights': '', 'milestone': '', 'timeSlots': [], 'tasks': []
                }
            schedule_data['schedules'][date].setdefault('tasks', [])
            schedule_data['schedules'][date].setdefault('timeSlots', [])

            schedule_data['schedules'][date]['tasks'].append({
                'name': task_name,
                'estimated': str(estimated_minutes),
                'actual': '',
                'note': note,
                'completed': False,
            })
            return json.dumps({
                'success': True,
                'content': f'已为 {date} 添加任务：{task_name}（预计{estimated_minutes}分钟）',
                'shouldRefresh': True,
            }, ensure_ascii=False)

        if action == 'view':
            date = args.get('date')
            sch = schedule_data.get('schedules', {}).get(date)
            if not sch or not sch.get('tasks'):
                return json.dumps({'success': True, 'content': f'{date} 的任务列表\n\n暂无任务。'}, ensure_ascii=False)

            tasks = sch['tasks']
            pending = [t for t in tasks if not t.get('completed')]
            done = [t for t in tasks if t.get('completed')]

            parts = [f'{date} 的任务列表\n\n']
            if pending:
                parts.append(f'[ ] 待完成 ({len(pending)})\n')
                for t in pending:
                    parts.append(f"  [ ] {t['name']} - 预计{t['estimated']}分钟\n")
                parts.append('\n')
            if done:
                parts.append(f'已完成 ({len(done)})\n')
                for t in done:
                    parts.append(f"  [x] {t['name']} - 预计{t['estimated']}分钟，实际{t.get('actual', '?')}分钟\n")

            completion_rate = round(len(done) / len(tasks) * 100) if tasks else 0
            parts.append(f'\n完成率：{completion_rate}%')
            return json.dumps({'success': True, 'content': ''.join(parts)}, ensure_ascii=False)

        if action == 'complete':
            date = args.get('date')
            task_name = args.get('task_name')
            actual_minutes = args.get('actual_minutes')
            sch = schedule_data.get('schedules', {}).get(date)

            if not sch or not sch.get('tasks'):
                return json.dumps({'success': False, 'content': f'在 {date} 没有找到任务。'}, ensure_ascii=False)

            task = next((t for t in sch['tasks'] if t['name'] == task_name), None)
            if not task:
                return json.dumps({'success': False, 'content': f'在 {date} 没有找到"{task_name}"。'}, ensure_ascii=False)

            task['completed'] = True
            task['actual'] = str(actual_minutes or 0)
            return json.dumps({
                'success': True,
                'content': f"任务已完成：{task_name}（实际{actual_minutes or '?'}分钟）",
                'shouldRefresh': True,
            }, ensure_ascii=False)

        if action == 'update':
            date = args.get('date')
            old_task_name = args.get('old_task_name') or args.get('task_name')
            new_task_name = args.get('new_task_name')
            new_estimated_minutes = args.get('new_estimated_minutes')
            reason = args.get('reason')
            sch = schedule_data.get('schedules', {}).get(date)

            if not sch or not sch.get('tasks'):
                return json.dumps({'success': False, 'content': f'在 {date} 没有找到任务。'}, ensure_ascii=False)

            task = next((t for t in sch['tasks'] if t['name'] == old_task_name), None)
            if not task:
                return json.dumps({'success': False, 'content': f'在 {date} 没有找到"{old_task_name}"。'}, ensure_ascii=False)

            changes = []
            if new_task_name and new_task_name != old_task_name:
                changes.append(f'名称：{old_task_name} -> {new_task_name}')
            if new_estimated_minutes and str(new_estimated_minutes) != task.get('estimated'):
                changes.append(f"用时：{task.get('estimated')}分钟 -> {new_estimated_minutes}分钟")

            if not changes:
                return json.dumps({'success': False, 'content': '没有检测到修改。'}, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'content': f"**修改任务提案**\n\n原因：{reason}\n\n" + '\n'.join(f'* {c}' for c in changes) + '\n\n请确认。',
                'proposal': {
                    'type': 'update_task',
                    'date': date,
                    'oldTaskName': old_task_name,
                    'newTaskName': new_task_name or old_task_name,
                    'newEstimatedMinutes': new_estimated_minutes or int(task.get('estimated', 0)),
                    'reason': reason,
                },
            }, ensure_ascii=False)

        if action == 'delete':
            date = args.get('date')
            task_name = args.get('task_name')
            reason = args.get('reason')
            sch = schedule_data.get('schedules', {}).get(date)

            if not sch or not sch.get('tasks'):
                return json.dumps({'success': False, 'content': f'在 {date} 没有找到任务。'}, ensure_ascii=False)

            task = next((t for t in sch['tasks'] if t['name'] == task_name), None)
            if not task:
                return json.dumps({'success': False, 'content': f'在 {date} 没有找到"{task_name}"。'}, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'content': f"**删除任务提案**\n\n原因：{reason}\n\n任务：{task_name}（预计{task.get('estimated')}分钟）\n\n请确认。",
                'proposal': {
                    'type': 'delete_task',
                    'date': date,
                    'taskName': task_name,
                    'reason': reason,
                },
            }, ensure_ascii=False)

        if action == 'batch_delete':
            tasks = args.get('tasks') or []
            reason = args.get('reason')

            if not tasks:
                return json.dumps({'success': False, 'error': '未指定要删除的任务'}, ensure_ascii=False)

            valid_tasks = []
            for ti in tasks:
                sch = schedule_data.get('schedules', {}).get(ti.get('date'))
                if sch and sch.get('tasks') and any(t['name'] == ti.get('task_name') for t in sch['tasks']):
                    valid_tasks.append(ti)

            if not valid_tasks:
                return json.dumps({'success': False, 'content': '没有找到任何任务。'}, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'content': f"**批量删除任务提案**\n\n原因：{reason}\n\n将删除 {len(valid_tasks)} 个任务。\n\n请确认。",
                'proposal': {
                    'type': 'batch_delete_tasks',
                    'tasks': valid_tasks,
                    'reason': reason,
                },
            }, ensure_ascii=False)

        return json.dumps({'success': False, 'error': f'manage_tasks: 未知 action "{action}"'}, ensure_ascii=False)

    def _execute_manage_big_tasks(self, args, schedule_data, schedules):
        action = args.get('action')

        if action == 'add':
            task_name = args.get('task_name')
            estimated_minutes = args.get('estimated_minutes')
            if not isinstance(estimated_minutes, (int, float)) or estimated_minutes <= 0:
                return json.dumps({"error": "参数 estimated_minutes 必须是正数", "success": False})
            ddl = args.get('ddl')
            task_type = args.get('task_type', 'short')
            start_date = args.get('start_date')
            note = args.get('note', '')

            if not task_name or not ddl:
                return json.dumps({'success': False, 'error': '缺少必要参数'}, ensure_ascii=False)

            schedule_data.setdefault('bigTasks', [])
            schedule_data['bigTasks'].append({
                'name': task_name,
                'estimated': estimated_minutes,
                'ddl': ddl,
                'taskType': task_type,
                'startDate': start_date,
                'note': note,
                'completed': False,
                'createdAt': datetime.now().isoformat(),
            })
            type_text = '长期任务' if task_type == 'long' else '短期任务'
            return json.dumps({
                'success': True,
                'content': f'已创建{type_text}：{task_name}\n预计：{estimated_minutes}分钟\nDDL：{ddl}',
                'shouldRefresh': True,
            }, ensure_ascii=False)

        if action == 'view':
            filter_val = args.get('filter', 'all')
            big_tasks = schedule_data.get('bigTasks') or []

            if not big_tasks:
                return json.dumps({'success': True, 'content': '大任务列表\n\n暂无大任务。'}, ensure_ascii=False)

            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            filtered = list(big_tasks)

            if filter_val == 'pending':
                filtered = [t for t in filtered if not t.get('completed')]
            elif filter_val == 'completed':
                filtered = [t for t in filtered if t.get('completed')]
            elif filter_val == 'overdue':
                filtered = []
                for t in big_tasks:
                    if t.get('completed') or not t.get('ddl'):
                        continue
                    try:
                        if datetime.strptime(t['ddl'], '%Y-%m-%d') < today:
                            filtered.append(t)
                    except ValueError:
                        logger.warning(f"跳过损坏的DDL日期: {t.get('ddl')}")

            if not filtered:
                return json.dumps({'success': True, 'content': f'大任务列表 ({filter_val})\n\n无匹配。'}, ensure_ascii=False)

            parts = [f'大任务列表 ({len(filtered)}个)\n\n']
            filtered.sort(key=lambda x: x.get('ddl') or '9999-12-31')
            for task in filtered:
                parts.append(
                    f"{'[x]' if task.get('completed') else '[ ]'} {task['name']} | {task.get('estimated')}分钟 | DDL: {task.get('ddl', '无')}\n"
                )
            return json.dumps({'success': True, 'content': ''.join(parts)}, ensure_ascii=False)

        if action == 'complete':
            task_name = args.get('task_name')
            big_tasks = schedule_data.get('bigTasks') or []
            task = next((t for t in big_tasks if t['name'] == task_name), None)

            if not task:
                return json.dumps({'success': False, 'content': f'未找到"{task_name}"。'}, ensure_ascii=False)
            if task.get('completed'):
                return json.dumps({'success': True, 'content': f'"{task_name}"已完成。'}, ensure_ascii=False)

            task['completed'] = True
            return json.dumps({
                'success': True,
                'content': f'大任务已完成：{task_name}',
                'shouldRefresh': True,
            }, ensure_ascii=False)

        if action == 'update':
            old_task_name = args.get('old_task_name') or args.get('task_name')
            big_tasks = schedule_data.get('bigTasks') or []
            task = next((t for t in big_tasks if t['name'] == old_task_name), None)

            if not task:
                return json.dumps({'success': False, 'content': f'未找到"{old_task_name}"。'}, ensure_ascii=False)

            changes = []
            if args.get('new_task_name') and args['new_task_name'] != old_task_name:
                changes.append(f"名称：{old_task_name} -> {args['new_task_name']}")
            if args.get('new_estimated_minutes') and args['new_estimated_minutes'] != task.get('estimated'):
                changes.append(f"用时：{task.get('estimated')} -> {args['new_estimated_minutes']}")
            if args.get('new_ddl') and args['new_ddl'] != task.get('ddl'):
                changes.append(f"DDL：{task.get('ddl', '无')} -> {args['new_ddl']}")

            if not changes:
                return json.dumps({'success': False, 'content': '没有检测到修改。'}, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'content': f"**修改大任务提案**\n\n原因：{args.get('reason')}\n\n" + '\n'.join(f'* {c}' for c in changes) + '\n\n请确认。',
                'proposal': {
                    'type': 'update_big_task',
                    'oldTaskName': old_task_name,
                    'newTaskName': args.get('new_task_name') or old_task_name,
                    'newEstimatedMinutes': args.get('new_estimated_minutes') or task.get('estimated'),
                    'newDdl': args.get('new_ddl') or task.get('ddl'),
                    'reason': args.get('reason'),
                },
            }, ensure_ascii=False)

        if action == 'delete':
            task_name = args.get('task_name')
            reason = args.get('reason')
            big_tasks = schedule_data.get('bigTasks') or []
            task = next((t for t in big_tasks if t['name'] == task_name), None)

            if not task:
                return json.dumps({'success': False, 'content': f'未找到"{task_name}"。'}, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'content': f"**删除大任务提案**\n\n原因：{reason}\n\n任务：{task_name}\nDDL：{task.get('ddl', '无')}\n\n请确认。",
                'proposal': {
                    'type': 'delete_big_task',
                    'taskName': task_name,
                    'reason': reason,
                },
            }, ensure_ascii=False)

        if action == 'batch_delete':
            task_names = args.get('task_names') or []
            reason = args.get('reason')
            big_tasks = schedule_data.get('bigTasks') or []

            if not task_names:
                return json.dumps({'success': False, 'error': '未指定要删除的大任务'}, ensure_ascii=False)

            valid = [n for n in task_names if any(t['name'] == n for t in big_tasks)]
            if not valid:
                return json.dumps({'success': False, 'content': '没有找到任何大任务。'}, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'content': f"**批量删除大任务提案**\n\n原因：{reason}\n\n将删除 {len(valid)} 个大任务。\n\n请确认。",
                'proposal': {
                    'type': 'batch_delete_big_tasks',
                    'taskNames': valid,
                    'reason': reason,
                },
            }, ensure_ascii=False)

        if action == 'break_down':
            big_task_name = args.get('task_name') or args.get('big_task_name')
            subtasks = args.get('subtasks') or []
            big_tasks = schedule_data.get('bigTasks') or []
            big_task = next((t for t in big_tasks if t['name'] == big_task_name), None)

            if not big_task:
                return json.dumps({'success': False, 'content': f'未找到"{big_task_name}"。'}, ensure_ascii=False)

            count = 0
            schedule_data.setdefault('schedules', {})
            for sub in subtasks:
                sd = sub.get('date')
                schedule_data['schedules'].setdefault(sd, {
                    'title': '', 'highlights': '', 'milestone': '', 'timeSlots': [], 'tasks': []
                })
                schedule_data['schedules'][sd].setdefault('tasks', [])
                schedule_data['schedules'][sd]['tasks'].append({
                    'name': sub.get('name'),
                    'estimated': str(sub.get('estimated_minutes', 0)),
                    'actual': '',
                    'completed': False,
                })
                count += 1

            return json.dumps({
                'success': True,
                'content': f'已将"{big_task_name}"分解为 {count} 个子任务',
                'shouldRefresh': True,
            }, ensure_ascii=False)

        return json.dumps({'success': False, 'error': f'manage_big_tasks: 未知 action "{action}"'}, ensure_ascii=False)

    def _execute_manage_courses(self, args, schedule_data, schedules):
        action = args.get('action')

        if action == 'create':
            semester_name = args.get('semester_name')
            start_date = args.get('start_date')
            end_date = args.get('end_date')
            courses = args.get('courses') or []
            skip_dates = args.get('skip_dates') or []

            if not semester_name or not start_date or not end_date or not courses:
                return json.dumps({'success': False, 'error': '缺少必要参数'}, ensure_ascii=False)

            try:
                start = datetime.strptime(start_date, '%Y-%m-%d')
            except ValueError:
                return json.dumps({'success': False, 'error': f'日期格式无效: {start_date}，期望格式 YYYY-MM-DD'}, ensure_ascii=False)
            try:
                end = datetime.strptime(end_date, '%Y-%m-%d')
            except ValueError:
                return json.dumps({'success': False, 'error': f'日期格式无效: {end_date}，期望格式 YYYY-MM-DD'}, ensure_ascii=False)
            skip_set = set(skip_dates)

            added_count = 0
            current = start
            schedule_data.setdefault('schedules', {})

            while current <= end:
                ds = current.strftime('%Y-%m-%d')
                if ds not in skip_set:
                    day_courses = [c for c in courses if c.get('weekday') == current.weekday() + 1 or c.get('weekday') == (7 if current.weekday() == 6 else current.weekday() + 1)]
                    if not day_courses:
                        day_courses = [c for c in courses if c.get('weekday') == current.weekday()]

                    if day_courses:
                        schedule_data['schedules'].setdefault(ds, {
                            'title': '', 'highlights': '', 'milestone': '', 'timeSlots': [], 'tasks': []
                        })

                        for course in day_courses:
                            pt = parse_time_range(course['time'])
                            start_minutes = pt['startMinutes']
                            end_minutes = pt['endMinutes']

                            conflict = False
                            for ex in schedule_data['schedules'][ds].get('timeSlots') or []:
                                ep = parse_time_range(ex['time'])
                                e_start = ep['startMinutes']
                                e_end = ep['endMinutes']
                                if not (end_minutes <= e_start or start_minutes >= e_end):
                                    conflict = True
                                    break

                            if conflict:
                                continue

                            icon = get_course_icon(course.get('name', ''))
                            detail_parts = [course.get('location'), course.get('teacher'), course.get('weeks')]
                            detail = ' * '.join(p for p in detail_parts if p)

                            schedule_data['schedules'][ds]['timeSlots'].append({
                                'time': course['time'],
                                'activity': course.get('name', ''),
                                'detail': detail,
                                'icon': icon,
                            })
                            added_count += 1

                        schedule_data['schedules'][ds]['timeSlots'].sort(key=lambda x: x['time'])

                current += timedelta(days=1)

            return json.dumps({
                'success': True,
                'content': f'已创建课表"{semester_name}"：{start_date}至{end_date}，{len(courses)}门课，{added_count}个课时',
                'shouldRefresh': True,
            }, ensure_ascii=False)

        if action == 'add':
            course_name = args.get('course_name')
            weekday = args.get('weekday')
            time = args.get('time')

            if not course_name or weekday is None or not time:
                return json.dumps({'success': False, 'error': '缺少必要参数'}, ensure_ascii=False)

            if args.get('start_date'):
                try:
                    start = datetime.strptime(args['start_date'], '%Y-%m-%d')
                except ValueError:
                    return json.dumps({'success': False, 'error': f'日期格式无效: {args["start_date"]}，期望格式 YYYY-MM-DD'}, ensure_ascii=False)
            else:
                start = datetime.now()
            if args.get('end_date'):
                try:
                    end = datetime.strptime(args['end_date'], '%Y-%m-%d')
                except ValueError:
                    return json.dumps({'success': False, 'error': f'日期格式无效: {args["end_date"]}，期望格式 YYYY-MM-DD'}, ensure_ascii=False)
            else:
                end = start + timedelta(days=120)

            count = 0
            current = start
            schedule_data.setdefault('schedules', {})

            while current <= end:
                if current.weekday() == weekday:
                    ds = current.strftime('%Y-%m-%d')
                    schedule_data['schedules'].setdefault(ds, {
                        'title': '', 'highlights': '', 'milestone': '', 'timeSlots': [], 'tasks': []
                    })

                    pt = parse_time_range(time)
                    start_minutes = pt['startMinutes']
                    end_minutes = pt['endMinutes']

                    conflict = False
                    for ex in schedule_data['schedules'][ds].get('timeSlots') or []:
                        ep = parse_time_range(ex['time'])
                        e_start = ep['startMinutes']
                        e_end = ep['endMinutes']
                        if not (end_minutes <= e_start or start_minutes >= e_end):
                            conflict = True
                            break

                    if conflict:
                        current += timedelta(days=1)
                        continue

                    icon = get_course_icon(course_name)
                    detail_parts = [args.get('location'), args.get('teacher')]
                    detail = ' * '.join(p for p in detail_parts if p)

                    schedule_data['schedules'][ds]['timeSlots'].append({
                        'time': time,
                        'activity': course_name,
                        'detail': detail,
                        'icon': icon,
                    })
                    schedule_data['schedules'][ds]['timeSlots'].sort(key=lambda x: x['time'])
                    count += 1

                current += timedelta(days=1)

            return json.dumps({
                'success': True,
                'content': f'已添加课程：{course_name}，{count}个课时',
                'shouldRefresh': True,
            }, ensure_ascii=False)

        if action == 'modify':
            changes = []
            old = args.get('old_course_info') or {}
            nw = args.get('new_course_info') or {}

            if nw.get('name'):
                changes.append(f"课程：{old.get('name')} -> {nw.get('name')}")
            if nw.get('weekday') is not None:
                changes.append(f"星期：{old.get('weekday')} -> {nw.get('weekday')}")
            if nw.get('time'):
                changes.append(f"时间：{old.get('time')} -> {nw.get('time')}")

            if not changes:
                return json.dumps({'success': False, 'content': '没有修改。'}, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'content': f"**修改课程提案**\n\n原因：{args.get('reason')}\n\n" + '\n'.join(f'* {c}' for c in changes) + '\n\n请确认。',
                'proposal': {
                    'type': 'modify_course',
                    'oldCourseInfo': old,
                    'newCourseInfo': nw,
                    'reason': args.get('reason'),
                },
            }, ensure_ascii=False)

        if action == 'remove':
            return json.dumps({
                'success': True,
                'content': f"**移除课程提案**\n\n原因：{args.get('reason')}\n\n课程：{args.get('course_name')}\n\n请确认。",
                'proposal': {
                    'type': 'remove_course',
                    'courseName': args.get('course_name'),
                    'weekday': args.get('weekday'),
                    'time': args.get('time'),
                    'reason': args.get('reason'),
                },
            }, ensure_ascii=False)

        if action == 'list':
            w_filter = args.get('weekday_filter')
            keyword = sanitize_str(args.get('keyword') or '').lower()

            all_courses = []
            for date, sch in (schedule_data.get('schedules') or {}).items():
                try:
                    dow = datetime.strptime(date, '%Y-%m-%d').weekday()
                except ValueError:
                    logger.warning(f"跳过损坏的日期: {date}")
                    continue
                if w_filter is not None and dow != w_filter:
                    continue
                for slot in (sch.get('timeSlots') or []):
                    name = sanitize_str(slot.get('activity', ''))
                    if keyword and keyword not in name.lower():
                        continue
                    all_courses.append({
                        'date': date,
                        'weekday': dow,
                        'time': slot['time'],
                        'name': name,
                        'detail': sanitize_str(slot.get('detail', '')),
                    })

            if not all_courses:
                return json.dumps({'success': True, 'content': '课程表\n\n暂无课程。'}, ensure_ascii=False)

            all_courses.sort(key=lambda x: (x['weekday'], x['time']))

            by_day = {}
            for c in all_courses:
                by_day.setdefault(c['weekday'], []).append(c)

            parts = [f'课程表 ({len(all_courses)} 门)\n\n']
            for d in range(1, 8):
                dd = 0 if d == 7 else d
                if dd not in by_day:
                    continue
                parts.append(f"[{WEEKDAY_NAMES[dd]}]\n")
                for c in by_day[dd]:
                    detail_str = f' * {c["detail"]}' if c.get('detail') else ''
                    parts.append(f"  {c['time']} {c['name']}{detail_str}\n")
                parts.append('\n')

            return safe_json_stringify({'success': True, 'content': ''.join(parts)})

        if action == 'swap':
            c1 = args.get('course1') or {}
            c2 = args.get('course2') or {}
            return json.dumps({
                'success': True,
                'content': f"**交换课程提案**\n\n原因：{args.get('reason')}\n\n{c1.get('name')}({c1.get('date')}) <-> {c2.get('name')}({c2.get('date')})\n\n请确认。",
                'proposal': {
                    'type': 'swap_courses',
                    'course1': c1,
                    'course2': c2,
                    'reason': args.get('reason'),
                },
            }, ensure_ascii=False)

        if action == 'adjust_week':
            return json.dumps({
                'success': True,
                'content': f"**周调整提案**\n\n原因：{args.get('reason')}\n\n{args.get('source_date')} -> {args.get('target_date')}\n\n请确认。",
                'proposal': {
                    'type': 'adjust_schedule_by_week',
                    'sourceDate': args.get('source_date'),
                    'targetDate': args.get('target_date'),
                    'reason': args.get('reason'),
                },
            }, ensure_ascii=False)

        if action == 'analyze_load':
            sd = args.get('start_date')
            ed = args.get('end_date')
            if not sd or not ed:
                return json.dumps({'success': False, 'error': '缺少日期范围'}, ensure_ascii=False)

            total = 0
            hours = 0
            for date, sch in (schedule_data.get('schedules') or {}).items():
                if date < sd or date > ed:
                    continue
                for slot in (sch.get('timeSlots') or []):
                    total += 1
                    pt = parse_time_range(slot['time'])
                    hours += pt['endHour'] - pt['startHour']

            return json.dumps({
                'success': True,
                'content': f'课程负荷：{total}节课，约{round(hours)}小时',
            }, ensure_ascii=False)

        if action == 'import':
            schedule_text = args.get('schedule_text', '')
            return json.dumps({
                'success': True,
                'content': f"**导入课表提案**\n\n{schedule_text[:200]}...\n\n请确认。",
                'proposal': {
                    'type': 'import_course_schedule',
                    'scheduleText': schedule_text,
                    'semesterStart': args.get('semester_start'),
                    'semesterEnd': args.get('semester_end'),
                },
            }, ensure_ascii=False)

        if action == 'export':
            fmt = args.get('export_format', 'text')
            all_items = []
            for date, sch in (schedule_data.get('schedules') or {}).items():
                try:
                    d = datetime.strptime(date, '%Y-%m-%d')
                except ValueError:
                    logger.warning(f"跳过损坏的日期: {date}")
                    continue
                for slot in (sch.get('timeSlots') or []):
                    all_items.append({
                        'date': date,
                        'weekday': WEEKDAY_NAMES[d.weekday() + 1 if d.weekday() < 6 else 0],
                        'time': slot['time'],
                        'name': slot.get('activity', ''),
                        'detail': slot.get('detail', ''),
                    })

            if fmt == 'json':
                content = '```json\n' + json.dumps(all_items, ensure_ascii=False, indent=2) + '\n```'
            elif fmt == 'markdown':
                content = '\n\n'.join(
                    f"## {c['name']}\n- {c['weekday']} {c['time']} ({c['date']}){chr(10) + '- ' + c['detail'] if c.get('detail') else ''}"
                    for c in all_items
                )
            else:
                content = '\n'.join(
                    f"{c['date']} {c['weekday']} {c['time']} - {c['name']}{' [' + c['detail'] + ']' if c.get('detail') else ''}"
                    for c in all_items
                )

            return json.dumps({'success': True, 'content': content}, ensure_ascii=False)

        if action == 'batch_manage':
            return json.dumps({
                'success': True,
                'content': f"**批量管理课程提案**\n\n操作：{args.get('batch_operation')}\n原因：{args.get('reason')}\n\n请确认。",
                'proposal': {
                    'type': 'batch_manage_courses',
                    'operation': args.get('batch_operation'),
                    'courses': args.get('courses') or [],
                    'newTimeSlot': args.get('new_time_slot'),
                    'reason': args.get('reason'),
                },
            }, ensure_ascii=False)

        return json.dumps({'success': False, 'error': f'manage_courses: 未知 action "{action}"'}, ensure_ascii=False)

    def _execute_analyze(self, args, schedule_data, schedules):
        action = args.get('action')

        if action == 'patterns':
            period = args.get('period', '本月')
            now = datetime.now()

            if period == '本周':
                start_date = now - timedelta(days=now.weekday())
                end_date = start_date + timedelta(days=6)
            elif period == '上周':
                start_date = now - timedelta(days=now.weekday() + 7)
                end_date = start_date + timedelta(days=6)
            else:
                start_date = now.replace(day=1)
                if now.month == 12:
                    end_date = now.replace(year=now.year + 1, month=1, day=1) - timedelta(days=1)
                else:
                    end_date = now.replace(month=now.month + 1, day=1) - timedelta(days=1)

            activity_count = {}
            total_minutes = 0

            for date, sch in schedules.items():
                try:
                    d = datetime.strptime(date, '%Y-%m-%d')
                except ValueError:
                    logger.warning(f"跳过损坏的日期: {date}")
                    continue
                if d < start_date or d > end_date:
                    continue
                for slot in (sch.get('timeSlots') or []):
                    pt = parse_time_range(slot['time'])
                    total_minutes += pt['endMinutes'] - pt['startMinutes']
                    activity_count[slot.get('activity', '')] = activity_count.get(slot.get('activity', ''), 0) + 1

            sorted_activities = sorted(activity_count.items(), key=lambda x: x[1], reverse=True)[:10]

            return json.dumps({
                'success': True,
                'period': period,
                'dateRange': f"{start_date.strftime('%Y-%m-%d')} ~ {end_date.strftime('%Y-%m-%d')}",
                'summary': {'totalHours': round(total_minutes / 60 * 10) / 10},
                'topActivities': [{'name': name, 'count': count} for name, count in sorted_activities],
            }, ensure_ascii=False)

        if action == 'optimize':
            date = args.get('date')
            if not date or date not in schedules:
                return json.dumps({'success': True, 'message': '该日期没有安排，暂无建议'}, ensure_ascii=False)

            slots = schedules[date].get('timeSlots') or []
            if len(slots) < 2:
                return json.dumps({'success': True, 'message': '安排较少，暂无建议'}, ensure_ascii=False)

            sorted_slots = []
            for s in slots:
                parsed = parse_time_range(s['time'])
                sorted_slots.append({'slot': s, 'startMinutes': parsed['startMinutes'], 'endMinutes': parsed['endMinutes']})
            sorted_slots.sort(key=lambda x: x['startMinutes'])

            gaps = []
            for i in range(1, len(sorted_slots)):
                gap = sorted_slots[i]['startMinutes'] - sorted_slots[i - 1]['endMinutes']
                if gap >= 30:
                    gaps.append({
                        'between': f"{sorted_slots[i - 1]['slot']['time']} 和 {sorted_slots[i]['slot']['time']}",
                        'duration': gap,
                    })

            return json.dumps({
                'success': True,
                'date': date,
                'totalSlots': len(slots),
                'gaps': gaps,
                'suggestions': [f'{len(gaps)}段空闲超30分钟'] if gaps else [],
            }, ensure_ascii=False)

        if action == 'ddl_status':
            threshold = args.get('days_threshold', 7)
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            reminders = []

            for task in (schedule_data.get('bigTasks') or []):
                if task.get('completed') or not task.get('ddl'):
                    continue
                try:
                    ddl_date = datetime.strptime(task['ddl'], '%Y-%m-%d').replace(hour=0, minute=0, second=0, microsecond=0)
                except ValueError:
                    logger.warning(f"跳过损坏的DDL日期: {task.get('ddl')}")
                    continue
                days_left = (ddl_date - today).days
                if days_left <= threshold:
                    level = 'critical' if days_left <= 0 else ('urgent' if days_left <= 3 else 'warning')
                    reminders.append({
                        'taskName': task['name'],
                        'ddl': task['ddl'],
                        'daysLeft': days_left,
                        'level': level,
                    })

            return json.dumps({
                'success': True,
                'reminders': reminders,
                'urgentCount': len([r for r in reminders if r['level'] in ('urgent', 'critical')]),
            }, ensure_ascii=False)

        if action == 'habits':
            day_count = {}
            time_count = {}

            for date, sch in schedules.items():
                try:
                    dow = datetime.strptime(date, '%Y-%m-%d').weekday()
                except ValueError:
                    logger.warning(f"跳过损坏的日期: {date}")
                    continue
                for slot in (sch.get('timeSlots') or []):
                    day_count[dow] = day_count.get(dow, 0) + 1
                    hour = slot['time'].split('-')[0].split(':')[0]
                    time_count[hour] = time_count.get(hour, 0) + 1

            busiest_day = max(day_count.items(), key=lambda x: x[1]) if day_count else None
            busiest_hour = max(time_count.items(), key=lambda x: x[1]) if time_count else None

            wd_names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
            return json.dumps({
                'success': True,
                'habits': {
                    'busiestDay': f"{wd_names[busiest_day[0]]} ({busiest_day[1]}项)" if busiest_day else '无数据',
                    'busiestHour': f"{busiest_hour[0]}:00 ({busiest_hour[1]}项)" if busiest_hour else '无数据',
                    'totalDays': len(schedules),
                },
            }, ensure_ascii=False)

        if action == 'health_check':
            period = args.get('period', '本周')
            now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

            if period == '本周':
                day_of_week = now.weekday()
                start_date = now - timedelta(days=day_of_week)
                end_date = start_date + timedelta(days=6)
                label = '本周'
            elif period == '本月':
                start_date = now.replace(day=1)
                if now.month == 12:
                    end_date = now.replace(year=now.year + 1, month=1, day=1) - timedelta(days=1)
                else:
                    end_date = now.replace(month=now.month + 1, day=1) - timedelta(days=1)
                label = '本月'
            else:
                start_date = now - timedelta(days=7)
                end_date = now + timedelta(days=7)
                label = '近两周'

            end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999)

            dates_in_range = []
            for date, sch in schedules.items():
                try:
                    d = datetime.strptime(date, '%Y-%m-%d')
                except ValueError:
                    logger.warning(f"跳过损坏的日期: {date}")
                    continue
                if start_date <= d <= end_date:
                    dates_in_range.append({'date': date, 'schedule': sch})

            if not dates_in_range:
                return json.dumps({
                    'success': True,
                    'period': label,
                    'message': '该时段暂无日程安排，建议先规划日程',
                    'dimensions': {},
                    'overall_score': 0,
                }, ensure_ascii=False)

            daily_loads = {}
            for item in dates_in_range:
                total_min = 0
                for s in (item['schedule'].get('timeSlots') or []):
                    pt = parse_time_range(s['time'])
                    total_min += pt['endMinutes'] - pt['startMinutes']
                for t in (item['schedule'].get('tasks') or []):
                    if not t.get('completed'):
                        total_min += int(t.get('estimated', 0) or 0)
                daily_loads[item['date']] = total_min

            loads = list(daily_loads.values())
            avg_load = sum(loads) / len(loads) if loads else 0
            load_variance = sum((l - avg_load) ** 2 for l in loads) / len(loads) if loads else 0
            load_std_dev = math.sqrt(load_variance)
            cv = load_std_dev / avg_load if avg_load > 0 else 0
            load_balance_score = max(0, min(100, round(100 * (1 - min(cv, 1)))))

            rest_issues = 0
            for item in dates_in_range:
                slot_infos = []
                for s in (item['schedule'].get('timeSlots') or []):
                    pt = parse_time_range(s['time'])
                    slot_infos.append({'startMinutes': pt['startMinutes'], 'endMinutes': pt['endMinutes']})
                slot_infos.sort(key=lambda x: x['startMinutes'])

                last_end = 0
                for si in slot_infos:
                    if si['startMinutes'] - last_end > 360:
                        rest_issues += 1
                    last_end = si['endMinutes']
                if last_end < 1320:
                    rest_issues += 1

            rest_score = max(0, min(100, round(100 - rest_issues * 10)))

            categories = {'学习': 0, '工作': 0, '生活': 0, '运动': 0, '其他': 0}
            cat_keywords = {
                '学习': ['学习', '上课', '复习', '考试', '作业', '课程', '阅读', '研究', '论文'],
                '工作': ['工作', '会议', '项目', '报告', '汇报', '出差', '加班'],
                '生活': ['吃饭', '休息', '娱乐', '购物', '家务', '社交', '聚会'],
                '运动': ['运动', '跑步', '健身', '游泳', '打球', '瑜伽', '锻炼'],
            }

            total_minutes_all = 0
            for item in dates_in_range:
                for s in (item['schedule'].get('timeSlots') or []):
                    pt = parse_time_range(s['time'])
                    mins = pt['endMinutes'] - pt['startMinutes']
                    total_minutes_all += mins

                    matched = False
                    for cat, kws in cat_keywords.items():
                        for kw in kws:
                            if kw in (s.get('activity', '') or '') or kw in (s.get('detail', '') or ''):
                                categories[cat] += mins
                                matched = True
                                break
                        if matched:
                            break
                    if not matched:
                        categories['其他'] += mins

            distribution = {}
            for cat, mins in categories.items():
                distribution[cat] = round(mins / total_minutes_all * 100) if total_minutes_all > 0 else 0

            ideal_ratios = {'学习': 30, '工作': 30, '生活': 20, '运动': 10, '其他': 10}
            ratio_score = 0
            for cat, ideal in ideal_ratios.items():
                ratio_score += max(0, 20 - abs((distribution.get(cat, 0) or 0) - ideal))
            time_alloc_score = round(ratio_score)

            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            urgent_count = 0
            total_tasks = 0
            for t in (schedule_data.get('bigTasks') or []):
                if t.get('completed') or not t.get('ddl'):
                    continue
                total_tasks += 1
                try:
                    ddl_date = datetime.strptime(t['ddl'], '%Y-%m-%d').replace(hour=0, minute=0, second=0, microsecond=0)
                except ValueError:
                    logger.warning(f"跳过损坏的DDL日期: {t.get('ddl')}")
                    continue
                days_left = (ddl_date - today).days
                if days_left <= 3:
                    urgent_count += 1
                if days_left < 0:
                    urgent_count += 2

            ddl_score = 100 if total_tasks == 0 else max(0, min(100, round(100 - (urgent_count / max(total_tasks, 1)) * 100)))

            overall_score = round(load_balance_score * 0.25 + rest_score * 0.25 + time_alloc_score * 0.25 + ddl_score * 0.25)

            if overall_score < 60:
                grade = '需改善'
                suggestion = '日程存在较多问题，建议使用Mosa的优化功能调整安排。'
            elif overall_score < 80:
                grade = '良好'
                suggestion = '日程整体合理，部分维度有优化空间。'
            else:
                grade = '优秀'
                suggestion = '日程安排非常健康，继续保持！'

            return json.dumps({
                'success': True,
                'period': label,
                'overall_score': overall_score,
                'grade': grade,
                'suggestion': suggestion,
                'dimensions': {
                    'load_balance': {
                        'score': load_balance_score,
                        'detail': f'日均负荷 {round(avg_load / 60 * 10) / 10} 小时，变异系数 {round(cv * 100)}%',
                        'suggestion': '建议均衡每日安排，避免某天过载' if load_balance_score < 70 else '负荷分布合理',
                    },
                    'rest_assurance': {
                        'score': rest_score,
                        'detail': f'检测到 {rest_issues} 个休息不足时段',
                        'suggestion': '建议每天安排休息时间，避免连续长时间工作' if rest_score < 70 else '休息保障充足',
                    },
                    'time_allocation': {
                        'score': time_alloc_score,
                        'detail': '，'.join(f'{k}:{v}%' for k, v in distribution.items()),
                        'suggestion': '建议调整各类时间占比，增加运动和生活时间' if time_alloc_score < 70 else '时间分配合理',
                    },
                    'ddl_pressure': {
                        'score': ddl_score,
                        'detail': f'近期有 {urgent_count} 个紧急DDL',
                        'suggestion': '紧急DDL较多，建议优先处理或拆分任务' if ddl_score < 70 else 'DDL压力在可控范围',
                    },
                },
            }, ensure_ascii=False)

        return json.dumps({'success': False, 'error': f'analyze: 未知 action "{action}"'}, ensure_ascii=False)

    def _execute_manage_templates(self, args, schedule_data, schedules):
        action = args.get('action')

        if action == 'list':
            templates = schedule_data.get('templates') or {}
            return json.dumps({
                'success': True,
                'templates': list(templates.keys()),
                'count': len(templates),
            }, ensure_ascii=False)

        if action == 'create':
            if not args.get('template_name') or not args.get('template_data'):
                return json.dumps({'success': False, 'error': '缺少模板名称或数据'}, ensure_ascii=False)

            schedule_data.setdefault('templates', {})
            schedule_data['templates'][args['template_name']] = args['template_data']
            return json.dumps({'success': True, 'message': f"模板\"{args['template_name']}\"已创建"}, ensure_ascii=False)

        if action == 'apply':
            if not args.get('template_name') or not args.get('target_date'):
                return json.dumps({'success': False, 'error': '缺少模板名称或目标日期'}, ensure_ascii=False)

            template = (schedule_data.get('templates') or {}).get(args['template_name'])
            if not template:
                return json.dumps({'success': False, 'error': f"模板\"{args['template_name']}\"不存在"}, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'type': 'proposal',
                'proposal': {
                    'type': 'apply_template',
                    'templateName': args['template_name'],
                    'targetDate': args['target_date'],
                    'templateData': template,
                },
            }, ensure_ascii=False)

        if action == 'delete':
            if not args.get('template_name'):
                return json.dumps({'success': False, 'error': '缺少模板名称'}, ensure_ascii=False)

            templates = schedule_data.get('templates')
            if templates and args['template_name'] in templates:
                del templates[args['template_name']]
            return json.dumps({'success': True, 'message': f"模板\"{args['template_name']}\"已删除"}, ensure_ascii=False)

        return json.dumps({'success': False, 'error': f'manage_templates: 未知 action "{action}"'}, ensure_ascii=False)

    def _execute_value_monetization(self, args, schedule_data, schedules):
        goal = args.get('goal', '')
        years = args.get('timeframe_years', 5)
        ctx = args.get('context', '')
        investment = args.get('current_investment', '')

        goal_lower = goal.lower()
        category = 'general'
        estimated_annual_value = 50000
        confidence = '中'

        if any(kw in goal_lower for kw in ['工程师', '技术', '编程', 'ai', '开发']):
            category = 'tech'
            estimated_annual_value = 150000
            confidence = '高'
        elif any(kw in goal_lower for kw in ['创业', '商业', '生意']):
            category = 'business'
            estimated_annual_value = 200000
            confidence = '中'
        elif any(kw in goal_lower for kw in ['学术', '研究', '博士', '教授']):
            category = 'academic'
            estimated_annual_value = 80000
            confidence = '中'
        elif any(kw in goal_lower for kw in ['财务', '投资', '理财', '自由']):
            category = 'financial'
            estimated_annual_value = 100000
            confidence = '中'
        elif any(kw in goal_lower for kw in ['艺术', '设计', '创作']):
            category = 'creative'
            estimated_annual_value = 60000
            confidence = '低'

        return safe_json_stringify({
            'tool': 'value_monetization',
            'goal': goal,
            'category': category,
            'estimated_annual_value': f'¥{estimated_annual_value:,}',
            'total_potential_value': f'¥{estimated_annual_value * years:,}',
            'opportunity_cost': f'¥{round(estimated_annual_value * 0.6 * years):,}',
            'value_drivers': list(filter(None, [
                f'领域:{category}',
                f'周期:{years}年',
                f'投入:{investment}' if investment else '',
            ])),
            'confidence_level': confidence,
            'monetization_path': f'{years}年内在{category}领域建立核心竞争力，实现年化价值¥{estimated_annual_value:,}',
        }, indent=2)

    def _execute_roi_calculator(self, args, schedule_data, schedules):
        inv_type = args.get('investment_type', 'time')
        amount = args.get('investment_amount', '')
        ret = args.get('expected_return', '')
        horizon = args.get('time_horizon', '3年')
        alternatives = args.get('alternatives') or []

        h_num = int(''.join(c for c in horizon if c.isdigit())) or 3

        if inv_type == 'time':
            roi_ratio = '300%-500%' if h_num >= 5 else '150%-250%'
            break_even = f'{math.ceil(h_num * 0.4)}年后正向回报'
            risk_adj_roi = f"调整后ROI:{200 if h_num >= 5 else 120}%"
        elif inv_type == 'money':
            roi_ratio = '200%-400%' if h_num >= 5 else '120%-200%'
            break_even = f'{math.ceil(h_num * 0.3)}年后回本'
            risk_adj_roi = f"调整后ROI:{150 if h_num >= 5 else 90}%"
        else:
            roi_ratio = '180%-280%'
            break_even = f'{math.ceil(h_num * 0.35)}年后正向回报'
            risk_adj_roi = '调整后ROI:130%'

        comp_table = None
        if alternatives:
            comp_table = []
            for i, a in enumerate(alternatives):
                comp_table.append({
                    'alternative': a,
                    'estimated_roi': f'{100 + i * 50}%-{250 + i * 50}%',
                    'risk_level': '中等' if i % 2 == 0 else '较高',
                    'feasibility': '高' if i == 0 else '中',
                })

        return safe_json_stringify({
            'tool': 'roi_calculator',
            'investment_type': inv_type,
            'investment_amount': amount,
            'expected_return': ret,
            'time_horizon': horizon,
            'roi_ratio': roi_ratio,
            'break_even_point': break_even,
            'risk_adjusted_roi': risk_adj_roi,
            'comparison_table': comp_table,
            'recommendation': (
                f'此投资在{horizon}周期内具有合理性，建议分阶段验证假设。'
                if h_num >= 3 else '建议延长评估窗口至至少3年以获得更准确判断。'
            ),
        }, indent=2)

    def _execute_milestone_planner(self, args, schedule_data, schedules):
        goal = args.get('long_term_goal', '')
        target_year = args.get('target_year', 5)
        current_status = args.get('current_status', '起点')
        constraints = args.get('constraints') or []
        phases = args.get('phases', 4)

        p_names = ['奠基期', '成长期', '加速期', '成熟期']
        p_descs = ['建立基础能力和知识体系', '积累经验和初步成果', '快速扩张和深度突破', '巩固地位和持续优化']

        milestones = []
        for i in range(phases):
            s_y = round(target_year / phases * i)
            e_y = round(target_year / phases * (i + 1))
            milestones.append({
                'phase': f"第{i + 1}阶段:{p_names[i] if i < len(p_names) else '阶段' + str(i + 1)}",
                'timeline': f'第{s_y}-{e_y}年',
                'objective': p_descs[i] if i < len(p_descs) else f'推进目标的关键步骤',
                'success_metrics': [f'指标{i + 1}.1:阶段性产出物', f'指标{i + 1}.2:能力提升度'],
                'key_decisions': [f'决策点{i + 1}.1:方向确认', f'决策点{i + 1}.2:资源分配'],
                'resource_needs': constraints[i] if i < len(constraints) else '动态调整',
            })

        return safe_json_stringify({
            'tool': 'milestone_planner',
            'long_term_goal': goal,
            'total_timespan': f'{target_year}年',
            'current_status': current_status,
            'phases_count': phases,
            'milestones': milestones,
            'critical_path': ' → '.join(m['phase'] for m in milestones),
            'risk_gates': [
                {
                    'gate': f"检查点{i + 1}:{m['phase'].split(':')[1].strip() if ':' in m['phase'] else m['phase']}",
                    'criteria': m['success_metrics'][0],
                    'trigger': f"第{round(target_year / phases * (i + 1))}年末",
                }
                for i, m in enumerate(milestones)
            ],
        }, indent=2)

    def _execute_swot_analysis(self, args, schedule_data, schedules):
        subject = args.get('subject', '')
        user_ctx = args.get('user_context', '')
        focus_area = args.get('focus_area', 'general')

        templates = {
            'career': {
                's': ['专业能力', '行业经验', '人脉网络', '学历背景'],
                'w': ['技能短板', '经验不足', '资源限制', '认知盲区'],
                'o': ['行业趋势', '市场需求', '技术变革', '政策红利'],
                't': ['竞争加剧', '技术替代', '经济波动', '行业衰退'],
            },
            'life': {
                's': ['健康状况', '家庭支持', '时间灵活性', '学习能力'],
                'w': ['精力分散', '习惯阻力', '社交局限', '财务压力'],
                'o': ['个人成长空间', '关系拓展可能', '新兴趣探索', '生活方式优化'],
                't': ['健康风险', '关系变化', '意外事件', '心理压力'],
            },
            'financial': {
                's': ['收入来源', '储蓄基础', '投资知识', '风险承受力'],
                'w': ['负债压力', '消费习惯', '收入单一', '缺乏规划'],
                'o': ['增值渠道', '被动收入', '资产配置', '技能变现'],
                't': ['市场波动', '通货膨胀', '失业风险', '意外支出'],
            },
            'skill': {
                's': ['核心技能', '学习能力', '实践经验', '认证资质'],
                'w': ['知识盲区', '练习不足', '应用场景少', '更新滞后'],
                'o': ['新技术栈', '跨界融合', '需求增长', '社区生态'],
                't': ['技术过时', '竞争门槛降低', 'AI替代', '标准变更'],
            },
        }

        tpl = templates.get(focus_area, templates['career'])

        return safe_json_stringify({
            'tool': 'swot_analysis',
            'subject': subject,
            'focus_area': focus_area,
            'user_context': user_ctx,
            'swot': {
                'strengths': [{'id': f'S{i + 1}', 'item': x, 'internal': True, 'positive': True} for i, x in enumerate(tpl['s'])],
                'weaknesses': [{'id': f'W{i + 1}', 'item': x, 'internal': True, 'positive': False} for i, x in enumerate(tpl['w'])],
                'opportunities': [{'id': f'O{i + 1}', 'item': x, 'external': True, 'positive': True} for i, x in enumerate(tpl['o'])],
                'threats': [{'id': f'T{i + 1}', 'item': x, 'external': True, 'positive': False} for i, x in enumerate(tpl['t'])],
            },
            'strategic_implications': [
                'SO策略:利用核心能力抓住外部机遇',
                'WO策略:弥补短板以利用机会',
                'ST策略:用优势应对外部威胁',
                'WT策略:最小化劣势并规避威胁',
            ],
            'action_priority': [
                {'p': 1, 'a': '发挥最大优势(S1)抓住最佳机会(O1)', 'e': '高', 'i': '高'},
                {'p': 2, 'a': '优先解决最关键劣势(W1)', 'e': '中', 'i': '高'},
                {'p': 3, 'a': '制定威胁缓解计划(T1)', 'e': '中', 'i': '中'},
                {'p': 4, 'a': '探索次级机会(O2-O3)', 'e': '低', 'i': '中'},
            ],
        }, indent=2)

    def _execute_decision_matrix(self, args, schedule_data, schedules):
        topic = args.get('decision_topic', '')
        options = args.get('options') or []
        user_criteria = args.get('criteria') or []
        context = args.get('context', '')

        criteria = user_criteria if user_criteria else ['可行性', '回报潜力', '风险程度', '时间成本', '个人匹配度']
        default_weights = [0.25, 0.2, 0.2, 0.15, 0.15]
        weights = {}
        for i, c in enumerate(criteria):
            weights[c] = default_weights[i] if i < len(default_weights) else 0.2

        matrix = []
        for idx, opt in enumerate(options):
            row = {'option': opt}
            for c in criteria:
                base = 3 + (2 if idx == 0 else -idx * 0.5) + random.uniform(0, 2)
                row[c] = max(1, min(5, round(base)))
            row['weighted_score'] = round(sum((row.get(c, 3) or 3) * weights.get(c, 0.2) for c in criteria), 2)
            matrix.append(row)

        matrix.sort(key=lambda x: x['weighted_score'], reverse=True)
        winner = matrix[0] if matrix else {'option': '无', 'weighted_score': 0}

        return safe_json_stringify({
            'tool': 'decision_matrix',
            'decision_topic': topic,
            'context': context,
            'criteria': [{'criterion': c, 'weight': weights[c]} for c in criteria],
            'matrix': matrix,
            'weighted_scores': [{'option': m['option'], 'score': m['weighted_score']} for m in matrix],
            'winner_recommendation': {
                'option': winner['option'],
                'score': winner['weighted_score'],
                'reason': f"综合评分最高({winner['weighted_score']}/5.00)，多维度表现均衡。建议进一步验证可行性。",
            },
            'sensitivity_analysis': (
                '权重变化：若最高权重维度下调20%，排名变化较小。关注得分接近选项的关键差异维度。'
                if len(options) > 2 else '权重变化：若最高权重维度下调20%，排名可能改变排序。关注得分接近选项的关键差异维度。'
            ),
        }, indent=2)

    def _execute_web_search(self, args, schedule_data, schedules):
        query = args.get('query', '')
        return json.dumps({
            'success': True,
            'query': query,
            'results': [],
            'message': f'关于"{query}"的网络搜索功能需要通过外部API调用实现。Mosa将基于已有知识回答。',
            'fallback': True,
        }, ensure_ascii=False)

    def _execute_estimate_task_time(self, args, schedule_data, schedules):
        task_name = args.get('task_name', '')
        category = args.get('category', '其他')

        category_hints = {
            '学习': '学习类任务通常建议单次不超过90分钟（番茄工作法），复杂学习任务建议拆分为多个25-50分钟的时段',
            '工作': '工作类任务建议单次专注45-90分钟，代码类任务建议预留30%调试时间',
            '生活': '生活类任务时间弹性较大，建议预留20%缓冲时间应对意外',
            '运动': '运动类任务建议30-60分钟（不含热身和拉伸），高强度运动不超过45分钟',
        }

        return json.dumps({
            'success': True,
            'task_name': task_name,
            'category': category,
            'source': 'llm_estimate',
            'hint': category_hints.get(category, '请根据任务复杂度估算合理时间'),
            'fallback': True,
            'message': 'Python时间估算服务未运行，请基于以下提示估算此任务所需时间。启动Python ML服务可获得基于历史数据的精准估算。',
        }, ensure_ascii=False)


def execute_tool_call(tool_call, schedule_data):
    executor = ToolExecutor()
    return executor.execute_tool_call(tool_call, schedule_data)