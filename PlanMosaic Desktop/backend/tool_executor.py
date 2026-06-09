import copy
import html as _html
import importlib.util
import json
import logging
import math
import os
import random
import re
import shutil
import sys
import time
from datetime import datetime, timedelta
from urllib.parse import quote as _url_quote

import httpx

from .paths import (
    get_data_file_path,
    get_backup_dir,
)

logger = logging.getLogger(__name__)

# ============ web_search_evaluate 工具常量 ============
_WEB_SEARCH_CACHE = {}  # key: normalized query, value: (timestamp, payload_dict)
_WEB_SEARCH_CACHE_TTL_SECONDS = 300
# 单源请求超时（兜底值，实际请求会用 min(此值, 剩余预算)）
_WEB_SEARCH_TIMEOUT_SECONDS = 2.5
# 整个 web_search_evaluate 调用的总预算（含主源 + 回退），超此值不再尝试后续源
_WEB_SEARCH_TOTAL_BUDGET_SECONDS = 8
# 剩余预算低于该值时直接放弃，避免无意义的尾段请求
_WEB_SEARCH_MIN_REMAINING_SECONDS = 1.0
_WEB_SEARCH_MAX_RESULTS = 5
_WEB_SEARCH_SUMMARY_MAX_CHARS = 2400
_WEB_SEARCH_SNIPPET_CAP = 200
_WEB_SEARCH_UA = 'PlanMosaic/1.0 (web_search_evaluate; +https://github.com/planmosaic)'
_WEB_SEARCH_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
_PERSON_QUERY_SUFFIXES = ('老师', '教授', '博士', '医生', '导师', '教练', '院长', '主任')
_PERSON_CONTEXT_KEYWORDS = ('老师', '教授', '讲师', '导师', '学校', '学院', '大学', '个人主页', '授课', '课程', '教育')
_PERSON_AMBIGUOUS_KEYWORDS = ('百科', '豆瓣', '创始人', 'CEO', '董事长', '公司', '企业')


def _normalize_web_search_query(query):
    """规范化搜索 query：合并连续空白、去除首尾空白与尾标点，提升 DuckDuckGo 命中率。"""
    if not isinstance(query, str):
        return ''
    q = re.sub(r'\s+', ' ', query).strip()
    # 去除尾部中英文问号/叹号/句号
    q = re.sub(r'[\?？！!！\.。]+$', '', q).strip()
    return q


def _protect_search_phrase(query):
    """为中文短语查询添加短语保护，避免被搜索引擎拆词误召回。"""
    if not isinstance(query, str):
        return ''
    q = query.strip()
    if not q:
        return ''
    if '"' in q or '“' in q or '”' in q:
        return q
    if re.search(r'[\u4e00-\u9fff]', q) and ' ' not in q and len(q) <= 20:
        return f'"{q}"'
    return q


def _is_cjk_query(query):
    return isinstance(query, str) and bool(re.search(r'[\u4e00-\u9fff]', query))


def _is_person_query(query):
    return isinstance(query, str) and any(suffix in query for suffix in _PERSON_QUERY_SUFFIXES)


def _extract_person_query_core(query):
    if not isinstance(query, str):
        return ''
    core = query
    for suffix in _PERSON_QUERY_SUFFIXES:
        core = core.replace(suffix, ' ')
    return re.sub(r'\s+', '', core).strip()


def _web_search_cache_get(key):
    """读取缓存，过期返回 None。"""
    if not key:
        return None
    entry = _WEB_SEARCH_CACHE.get(key)
    if not entry:
        return None
    ts, payload = entry
    if (time.time() - ts) > _WEB_SEARCH_CACHE_TTL_SECONDS:
        try:
            del _WEB_SEARCH_CACHE[key]
        except KeyError:
            pass
        return None
    return payload


def _web_search_cache_set(key, payload):
    """写入缓存（仅缓存 success 响应，失败不缓存以避免污染）。"""
    if not key or not isinstance(payload, dict):
        return
    if not payload.get('success'):
        return
    _WEB_SEARCH_CACHE[key] = (time.time(), payload)


def _build_summary_text(results, max_chars=_WEB_SEARCH_SUMMARY_MAX_CHARS, snippet_cap=_WEB_SEARCH_SNIPPET_CAP):
    """把 results 列表拼接成 LLM 易消费的纯文本摘要。

    格式: [1] title — snippet (来源: <source>, URL: <url>)
    返回总长度严格不超过 max_chars。
    """
    if not results:
        return '未找到相关搜索结果，建议尝试其他关键词'
    lines = []
    for i, r in enumerate(results, 1):
        title = (r.get('title') or '').strip() or f'结果{i}'
        snippet = (r.get('snippet') or '').strip()
        if len(snippet) > snippet_cap:
            snippet = snippet[:snippet_cap].rstrip() + '…'
        source = (r.get('source') or 'DuckDuckGo').strip()
        url = (r.get('url') or '').strip()
        line = f'[{i}] {title} — {snippet} (来源: {source}, URL: {url})'
        lines.append(line)
    text = '\n'.join(lines)
    if len(text) > max_chars:
        # 给尾部 "…" 预留 1 个字符
        text = text[:max_chars - 1].rstrip() + '…'
    return text


def _rerank_search_results(query, results):
    if not results:
        return results
    query = (query or '').strip()
    compact_query = re.sub(r'\s+', '', query)
    person_query = _is_person_query(query)
    core_name = _extract_person_query_core(query)
    ranked = []
    for idx, item in enumerate(results):
        title = (item.get('title') or '').strip()
        snippet = (item.get('snippet') or '').strip()
        compact_title = re.sub(r'\s+', '', title)
        compact_snippet = re.sub(r'\s+', '', snippet)
        score = 0
        if compact_query and compact_query in compact_title:
            score += 20
        if compact_query and compact_query in compact_snippet:
            score += 12
        if person_query:
            if compact_query and compact_query in compact_title:
                score += 18
            if core_name and core_name in compact_title:
                score += 8
            if core_name and core_name in compact_snippet:
                score += 5
            if any(suffix in title for suffix in _PERSON_QUERY_SUFFIXES):
                score += 10
            if any(suffix in snippet for suffix in _PERSON_QUERY_SUFFIXES):
                score += 6
            if any(keyword in title for keyword in _PERSON_CONTEXT_KEYWORDS):
                score += 8
            if any(keyword in snippet for keyword in _PERSON_CONTEXT_KEYWORDS):
                score += 5
            if any(keyword in title for keyword in _PERSON_AMBIGUOUS_KEYWORDS) and compact_query not in compact_title:
                score -= 8
            if snippet == '(无摘要)':
                score -= 2
        score -= idx
        ranked.append((score, idx, item))
    ranked.sort(key=lambda row: (-row[0], row[1]))
    return [item for _, _, item in ranked]


def _prune_person_results(query, results, max_keep=3):
    if not results:
        return results
    compact_query = re.sub(r'\s+', '', (query or '').strip())
    core_name = _extract_person_query_core(query)
    exact_matches = []
    contextual_matches = []
    fallback_matches = []
    for item in results:
        title = (item.get('title') or '').strip()
        snippet = (item.get('snippet') or '').strip()
        compact_title = re.sub(r'\s+', '', title)
        compact_snippet = re.sub(r'\s+', '', snippet)
        if compact_query and (compact_query in compact_title or compact_query in compact_snippet):
            exact_matches.append(item)
        elif any(keyword in title or keyword in snippet for keyword in _PERSON_CONTEXT_KEYWORDS):
            contextual_matches.append(item)
        elif core_name and (core_name in compact_title or core_name in compact_snippet):
            fallback_matches.append(item)
    if len(exact_matches) >= min(2, max_keep):
        deduped_exact = []
        seen_titles = set()
        for item in exact_matches:
            title = (item.get('title') or '').strip()
            if title in seen_titles:
                continue
            seen_titles.add(title)
            deduped_exact.append(item)
            if len(deduped_exact) >= max_keep:
                break
        return deduped_exact
    pruned = []
    seen_titles = set()
    for group in (exact_matches, contextual_matches, fallback_matches):
        for item in group:
            title = (item.get('title') or '').strip()
            if title in seen_titles:
                continue
            seen_titles.add(title)
            pruned.append(item)
            if len(pruned) >= max_keep:
                return pruned
    return results[:max_keep]


def _build_person_query_summary(query, results):
    detail_text = _build_summary_text(results)
    meaningful_snippet = any((item.get('snippet') or '').strip() not in ('', '(无摘要)') for item in results[:3])
    if meaningful_snippet:
        caution = '提示：人物身份、性别与任职信息需至少用两条独立来源交叉核实，以下仅为候选搜索结果。'
    else:
        caution = '提示：当前仅拿到标题级候选或弱摘要，请勿据此确认人物身份、性别与任职信息。'
    return caution + '\n' + detail_text


def _parse_duckduckgo_instant_answer(data, max_results=_WEB_SEARCH_MAX_RESULTS):
    """把 DuckDuckGo Instant Answer JSON 解析成 results 列表。"""
    results = []
    if not isinstance(data, dict):
        return results
    abstract = (data.get('AbstractText') or '').strip()
    if abstract:
        results.append({
            'title': (data.get('Heading') or '摘要').strip() or '摘要',
            'snippet': abstract,
            'source': (data.get('AbstractSource') or 'DuckDuckGo').strip(),
            'url': (data.get('AbstractURL') or '').strip(),
        })
    topics = data.get('RelatedTopics') or []
    for topic in topics:
        if len(results) >= max_results:
            break
        if not isinstance(topic, dict):
            continue
        if 'Topics' in topic and isinstance(topic['Topics'], list):
            # 嵌套的二级话题
            for sub in topic['Topics']:
                if len(results) >= max_results:
                    break
                if isinstance(sub, dict) and sub.get('Text') and sub.get('FirstURL'):
                    text = sub['Text'].strip()
                    title = text.split(' - ')[0] if ' - ' in text else text
                    results.append({
                        'title': title[:120] or '相关结果',
                        'snippet': text,
                        'source': 'DuckDuckGo',
                        'url': (sub.get('FirstURL') or '').strip(),
                    })
            continue
        text = (topic.get('Text') or '').strip()
        url = (topic.get('FirstURL') or '').strip()
        if text and url:
            title = text.split(' - ')[0] if ' - ' in text else text
            results.append({
                'title': title[:120] or '相关结果',
                'snippet': text,
                'source': 'DuckDuckGo',
                'url': url,
            })
    return results[:max_results]


def _parse_duckduckgo_html_fallback(html, max_results=_WEB_SEARCH_MAX_RESULTS):
    """解析 DuckDuckGo HTML 端点（无依赖，仅用正则）。

    期望匹配: <a class="result__a" href="...">title</a> + <a class="result__snippet">snippet</a>
    """
    results = []
    if not html:
        return results
    # 用 result 块开头作为分隔符（更可靠）
    block_re = re.compile(
        r'<div[^>]*class="[^"]*\bresult\b[^"]*"[^>]*>(.*?)(?=<div[^>]*class="[^"]*\bresult\b|</body>|$)',
        re.DOTALL | re.IGNORECASE,
    )
    link_re = re.compile(
        r'<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        re.DOTALL | re.IGNORECASE,
    )
    snippet_re = re.compile(
        r'<a[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>(.*?)</a>',
        re.DOTALL | re.IGNORECASE,
    )
    tag_re = re.compile(r'<[^>]+>')
    for block in block_re.findall(html):
        link_match = link_re.search(block)
        if not link_match:
            continue
        url = link_match.group(1).strip()
        raw_title = tag_re.sub(' ', link_match.group(2))
        title = re.sub(r'\s+', ' ', raw_title).strip()
        snippet_match = snippet_re.search(block)
        snippet = ''
        if snippet_match:
            snippet = re.sub(r'\s+', ' ', tag_re.sub(' ', snippet_match.group(1))).strip()
        if not title:
            continue
        results.append({
            'title': title[:120],
            'snippet': snippet or '(无摘要)',
            'source': 'DuckDuckGo',
            'url': url,
        })
        if len(results) >= max_results:
            break
    return results


def _parse_bing_html_fallback(html, max_results=_WEB_SEARCH_MAX_RESULTS):
    """解析 Bing HTML 搜索结果（无依赖，仅用正则）。"""
    results = []
    if not html:
        return results
    block_re = re.compile(
        r'<li[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>(.*?)(?=<li[^>]*class="[^"]*\bb_algo\b|</ol>|</body>|$)',
        re.DOTALL | re.IGNORECASE,
    )
    link_re = re.compile(
        r'<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        re.DOTALL | re.IGNORECASE,
    )
    snippet_re = re.compile(
        r'<p[^>]*>(.*?)</p>',
        re.DOTALL | re.IGNORECASE,
    )
    tag_re = re.compile(r'<[^>]+>')
    for block in block_re.findall(html):
        link_match = link_re.search(block)
        if not link_match:
            continue
        url = _html.unescape(link_match.group(1).strip())
        raw_title = tag_re.sub(' ', link_match.group(2))
        title = _html.unescape(re.sub(r'\s+', ' ', raw_title).strip())
        if not title:
            continue
        snippet = ''
        snippet_match = snippet_re.search(block)
        if snippet_match:
            snippet = _html.unescape(re.sub(r'\s+', ' ', tag_re.sub(' ', snippet_match.group(1))).strip())
        results.append({
            'title': title[:120],
            'snippet': snippet or '(无摘要)',
            'source': 'Bing',
            'url': url,
        })
        if len(results) >= max_results:
            break
    return results


def _parse_baidu_html_fallback(html, max_results=_WEB_SEARCH_MAX_RESULTS):
    """解析百度 HTML 搜索结果。"""
    results = []
    if not html:
        return results
    block_start_re = re.compile(
        r'<div[^>]*class="[^"]*\bresult\b[^"]*\bc-container\b[^"]*"[^>]*>',
        re.IGNORECASE,
    )
    title_patterns = [
        re.compile(
            r'<h3[^>]*class="[^"]*\bt\b[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>\s*</h3>',
            re.DOTALL | re.IGNORECASE,
        ),
        re.compile(
            r'<a[^>]*data-module="title"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
            re.DOTALL | re.IGNORECASE,
        ),
    ]
    snippet_patterns = [
        re.compile(r'<span[^>]*class="[^"]*\bsummary-text_[^"]*"[^>]*>(.*?)</span>', re.DOTALL | re.IGNORECASE),
        re.compile(r'<div[^>]*data-module="abstract"[^>]*>(.*?)</div>', re.DOTALL | re.IGNORECASE),
        re.compile(r'<div[^>]*class="[^"]*\bc-abstract\b[^"]*"[^>]*>(.*?)</div>', re.DOTALL | re.IGNORECASE),
        re.compile(r'<span[^>]*class="[^"]*\bcontent-right_8Zs40\b[^"]*"[^>]*>(.*?)</span>', re.DOTALL | re.IGNORECASE),
    ]
    tag_re = re.compile(r'<[^>]+>')
    seen = set()
    block_starts = [match.start() for match in block_start_re.finditer(html)]
    if not block_starts:
        return results
    block_starts.append(len(html))
    for idx in range(len(block_starts) - 1):
        block = html[block_starts[idx]:block_starts[idx + 1]]
        title_match = None
        for pat in title_patterns:
            title_match = pat.search(block)
            if title_match:
                break
        if not title_match:
            continue
        url = _html.unescape(title_match.group(1).strip())
        raw_title = tag_re.sub(' ', title_match.group(2))
        title = _html.unescape(re.sub(r'\s+', ' ', raw_title).strip())
        if not title or title in seen:
            continue
        seen.add(title)
        snippet = ''
        for snippet_pat in snippet_patterns:
            snippet_match = snippet_pat.search(block)
            if snippet_match:
                snippet = _html.unescape(re.sub(r'\s+', ' ', tag_re.sub(' ', snippet_match.group(1))).strip())
                if snippet:
                    break
        results.append({
            'title': title[:120],
            'snippet': snippet or '(无摘要)',
            'source': 'Baidu',
            'url': url,
        })
        if len(results) >= max_results:
            return results
    return results


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

WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']


_DATE_KEY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TIME_ESTIMATION_CATEGORIES = {'学习', '工作', '生活', '运动'}
MAX_STRUCTURED_STEPS_COUNT = 12
TIME_ESTIMATION_SERVICE_BASE = (os.environ.get('PLANMOSAIC_TIME_ESTIMATION_API') or 'http://127.0.0.1:5100').rstrip('/')
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TIME_ESTIMATION_DIR = os.path.join(PROJECT_ROOT, 'PlanMosaic Desktop', 'backend', 'time_estimation')
ESTIMATE_SNAPSHOT_FILE = os.path.join(TIME_ESTIMATION_DIR, 'estimate_snapshots.json')
LOCAL_TIME_ESTIMATION_MODEL_FILE = os.path.join(TIME_ESTIMATION_DIR, 'model.py')
LOCAL_TIME_ESTIMATION_BRIDGE = None
TIME_CATEGORY_KEYWORDS = {
    '学习': ['学习', '复习', '预习', '刷题', '背', '作业', '课程', '考试', '论文', '实验报告', '阅读', '笔记', '听课', '训练题'],
    '工作': ['工作', '开发', '代码', '编程', '调试', '测试', '文档', '方案', '汇报', '邮件', '会议', '需求', '产品', '设计稿', '接口', '排查'],
    '生活': ['做饭', '买菜', '洗衣', '打扫', '收拾', '整理房间', '采购', '缴费', '搬家', '出门', '办理', '家务', '收纳', '清洁'],
    '运动': ['跑步', '健身', '游泳', '打球', '瑜伽', '拉伸', '骑行', '散步', '训练', '跳绳', '力量', '热身'],
}
TIME_OUTPUT_TYPE_LABELS = {
    'deliverable': '有明确交付物',
    'communication': '以沟通协作为主',
    'learning': '需要理解和吸收内容',
    'execution': '偏执行或操作类任务',
    'planning': '偏整理和规划',
    'other': '信息较少的通用任务',
}
TIME_OUTPUT_TYPE_BASELINE_DELTAS = {
    'deliverable': 25,
    'communication': -5,
    'learning': 15,
    'execution': 5,
    'planning': 0,
    'other': 0,
}
TIME_DEADLINE_PRESSURE_DELTAS = {
    1: -5,
    2: 0,
    3: 5,
    4: 15,
    5: 25,
}


def _valid_date_keys(schedules):
    """返回 schedules 中所有合法的 YYYY-MM-DD 形式的 key（已排序）。

    用于在 view_schedule 等接口过滤掉因数据损坏/迁移产生的脏 key（如 "null"）。
    """
    return sorted(k for k in (schedules or {}).keys() if isinstance(k, str) and _DATE_KEY_RE.match(k))


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


def parse_weekday_candidates(raw_value):
    """把星期入参（0-6 / 1-7 / 中文星期名）归一化到 0-6 区间并返回 {value} 集合。

    说明：先前版本会同时返回 {0, 1} / {1, 2} / … 多候选集合以兼容 0-6 和 1-7 两种习惯，
    这导致 Agent 用 1-7 习惯传 weekday=1 时同时命中周一和周二（"延一天"）。现在统一到 0-6 单值。
    """
    if raw_value is None or raw_value == '':
        return set()
    value = str(raw_value).strip()
    weekday_names = {
        '周一': 0, '星期一': 0,
        '周二': 1, '星期二': 1,
        '周三': 2, '星期三': 2,
        '周四': 3, '星期四': 3,
        '周五': 4, '星期五': 4,
        '周六': 5, '星期六': 5,
        '周日': 6, '星期日': 6, '周天': 6, '星期天': 6,
    }
    if value in weekday_names:
        return {weekday_names[value]}
    if value.lstrip('-').isdigit():
        numeric = int(value)
        if 1 <= numeric <= 7:
            return {numeric - 1}
        if 0 <= numeric <= 6:
            return {numeric}
        return set()
    return set()


def date_weekday_candidates(value):
    """返回某日期的星期候选集。统一使用 Python weekday 0-6 单值，避免命中多天。"""
    weekday = value.weekday() if hasattr(value, 'weekday') else int(value)
    return {weekday}


def get_course_icon(course_name):
    for key, icon in COURSE_ICON_MAP.items():
        if key in course_name:
            return icon
    return ''


def parse_template_weekday(raw_value):
    """把星期入参归一化为 0-6 整数（0=周一，6=周日）。

    接受 0-6 直接值、1-7 习惯（自动 -1）、中文名（"周一"～"周日"）。
    非法值（None、负数、>7、非整数、未知字符串）一律返回 None。
    """
    if raw_value is None or raw_value == '':
        return None
    if isinstance(raw_value, bool):
        return None
    if isinstance(raw_value, (int, float)):
        if not float(raw_value).is_integer():
            return None
        value = int(raw_value)
        if 1 <= value <= 7:
            return value - 1
        if 0 <= value <= 6:
            return value
        return None
    value = str(raw_value).strip()
    if not value:
        return None
    weekday_map = {
        '周一': 0, '星期一': 0,
        '周二': 1, '星期二': 1,
        '周三': 2, '星期三': 2,
        '周四': 3, '星期四': 3,
        '周五': 4, '星期五': 4,
        '周六': 5, '星期六': 5,
        '周日': 6, '星期日': 6, '周天': 6, '星期天': 6,
    }
    if value in weekday_map:
        return weekday_map[value]
    if value.lstrip('-').isdigit():
        numeric = int(value)
        if 1 <= numeric <= 7:
            return numeric - 1
        if 0 <= numeric <= 6:
            return numeric
    return None


def normalize_week_type(raw_value, default=''):
    value = sanitize_str(raw_value).strip().lower()
    mapping = {
        'odd': 'odd',
        'single': 'odd',
        '单周': 'odd',
        '奇数周': 'odd',
        'even': 'even',
        'double': 'even',
        '双周': 'even',
        '偶数周': 'even',
        'all': 'all',
        'both': 'all',
        '单双周': 'all',
        '全部': 'all',
    }
    return mapping.get(value, default)


def parse_section_range(source):
    if not isinstance(source, dict):
        return None, None, None
    section_start = _safe_int(
        source.get('section_start', source.get('sectionStart', source.get('section'))),
        0,
    )
    section_end = _safe_int(source.get('section_end', source.get('sectionEnd')), 0)
    merge_span = _safe_int(source.get('merge_span', source.get('mergeSpan')), 0)
    if section_start <= 0:
        return None, None, None
    if section_end <= 0:
        section_end = section_start + merge_span - 1 if merge_span > 0 else section_start
    section_end = max(section_start, section_end)
    merge_span = section_end - section_start + 1
    return section_start, section_end, merge_span


def _format_template_course_detail(cell):
    if not isinstance(cell, dict):
        return ''
    parts = []
    if cell.get('location'):
        parts.append(f"地点：{sanitize_str(cell.get('location'))}")
    if cell.get('teacher'):
        parts.append(f"教师：{sanitize_str(cell.get('teacher'))}")
    if cell.get('note'):
        parts.append(f"备注：{sanitize_str(cell.get('note'))}")
    return ' * '.join(parts)


def _normalize_template_course_cell(source):
    if not isinstance(source, dict):
        return {}
    section_start, section_end, merge_span = parse_section_range(source)
    weekday = parse_template_weekday(source.get('weekday'))
    course_name = sanitize_str(
        source.get('course_name')
        or source.get('courseName')
        or source.get('name')
        or source.get('course')
        or ''
    ).strip()
    normalized = {
        'template_name': sanitize_str(source.get('template_name') or source.get('templateName') or '').strip(),
        'week_type': normalize_week_type(source.get('week_type') or source.get('weekType'), 'all'),
        'weekday': weekday,
        'section_start': section_start,
        'section_end': section_end,
        'merge_span': merge_span,
        'course_name': course_name,
        'location': sanitize_str(source.get('location') or '').strip(),
        'teacher': sanitize_str(source.get('teacher') or '').strip(),
        'note': sanitize_str(source.get('note') or source.get('remark') or '').strip(),
    }
    return normalized


def _template_cell_from_args(args, key=None):
    source = args.get(key) if key and isinstance(args.get(key), dict) else None
    if isinstance(source, dict):
        merged = dict(args)
        merged.update(source)
        return _normalize_template_course_cell(merged)
    return _normalize_template_course_cell(args)


def _resolve_target_template(schedule_data, template_name=''):
    templates = schedule_data.get('scheduleTemplates') or []
    if template_name:
        for template in templates:
            if isinstance(template, dict) and template.get('name') == template_name:
                return template
        return None
    if len(templates) == 1 and isinstance(templates[0], dict):
        return templates[0]
    return None


def _iter_template_cells(course_map):
    if not isinstance(course_map, dict):
        return
    for cell_key, cell_data in course_map.items():
        if not isinstance(cell_data, dict):
            continue
        try:
            row_index, day_index = [int(part) for part in str(cell_key).split('-', 1)]
        except (TypeError, ValueError):
            continue
        merge_span = max(1, _safe_int(cell_data.get('mergeSpan'), 1))
        yield cell_key, row_index + 1, row_index + merge_span, day_index, cell_data


def _find_template_cell(course_map, cell_ref):
    if not isinstance(course_map, dict) or not isinstance(cell_ref, dict):
        return None, None
    target_day = cell_ref.get('weekday')
    target_start = cell_ref.get('section_start')
    target_end = cell_ref.get('section_end')
    target_name = cell_ref.get('course_name')
    for cell_key, start_section, end_section, day_index, cell_data in _iter_template_cells(course_map):
        if target_day is not None and day_index != target_day:
            continue
        if target_start and target_end:
            if not (target_start == start_section and target_end == end_section):
                continue
        elif target_start and not (start_section <= target_start <= end_section):
            continue
        if target_name and sanitize_str(cell_data.get('course') or '').strip() != target_name:
            continue
        return cell_key, cell_data
    return None, None


def _remove_template_overlaps(course_map, weekday, section_start, section_end):
    if not isinstance(course_map, dict):
        return 0
    removed = 0
    to_delete = []
    for cell_key, start_section, end_section, day_index, _cell_data in _iter_template_cells(course_map):
        if day_index != weekday:
            continue
        if end_section < section_start or start_section > section_end:
            continue
        to_delete.append(cell_key)
    for cell_key in to_delete:
        del course_map[cell_key]
        removed += 1
    return removed


def _upsert_template_cell(template, cell_ref, *, overwrite=True):
    if not isinstance(template, dict):
        return False, '模板不存在'
    template_name = template.get('name') or ''
    week_type = normalize_week_type(cell_ref.get('week_type'), 'all')
    # cell_ref 在外层（_normalize_template_course_cell）已经统一归一化到 0-6；
    # 这里只做格式校验，确保 0-6 整数，避免脏数据
    raw_weekday = cell_ref.get('weekday')
    if not isinstance(raw_weekday, int) or isinstance(raw_weekday, bool) or raw_weekday < 0 or raw_weekday > 6:
        return False, f'weekday 必须是 0-6 整数：{raw_weekday!r}'
    weekday = raw_weekday
    section_start = cell_ref.get('section_start')
    section_end = cell_ref.get('section_end')
    merge_span = cell_ref.get('merge_span') or 1
    course_name = cell_ref.get('course_name') or ''
    if section_start is None or section_end is None or not course_name:
        return False, '模板格子缺少 weekday/section/course_name 等必要字段'
    if week_type not in ('odd', 'even', 'all'):
        return False, 'week_type 必须为 odd/even/all'
    maps = []
    if week_type in ('odd', 'all'):
        template.setdefault('oddWeekCourses', {})
        maps.append(template['oddWeekCourses'])
    if week_type in ('even', 'all'):
        template.setdefault('evenWeekCourses', {})
        maps.append(template['evenWeekCourses'])
    if not maps:
        return False, '未找到要写入的单双周课表'
    cell_payload = {
        'course': course_name,
        'mergeSpan': merge_span,
    }
    if cell_ref.get('location'):
        cell_payload['location'] = cell_ref['location']
    if cell_ref.get('teacher'):
        cell_payload['teacher'] = cell_ref['teacher']
    if cell_ref.get('note'):
        cell_payload['note'] = cell_ref['note']
    target_key = f"{section_start - 1}-{weekday}"
    for course_map in maps:
        if overwrite:
            _remove_template_overlaps(course_map, weekday, section_start, section_end)
        course_map[target_key] = copy.deepcopy(cell_payload)
    if not template_name and cell_ref.get('template_name'):
        template['name'] = cell_ref['template_name']
    return True, None


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


def _contains_any(text, keywords):
    return any(keyword in text for keyword in keywords)


def _safe_int(value, default=0):
    try:
        if value in (None, ''):
            return default
        return int(round(float(value)))
    except (TypeError, ValueError):
        return default


def _clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def _pick_structured_time_fields(source):
    if not isinstance(source, dict):
        return {}
    raw = source.get('structuredFeatures')
    if not isinstance(raw, dict):
        raw = source.get('structured_features')
    if not isinstance(raw, dict):
        raw = source
    result = {}
    for key in ('difficulty', 'familiarity', 'steps_count', 'deadline_pressure', 'output_type'):
        value = raw.get(key)
        if value not in (None, ''):
            result[key] = value
    return result


def _normalize_estimate_category(category, task_name='', context=''):
    return _resolve_estimate_category(category, task_name, context)['category']


def _resolve_estimate_category(category, task_name='', context=''):
    raw_category = category.strip() if isinstance(category, str) else ''
    if raw_category in TIME_ESTIMATION_CATEGORIES:
        return {
            'category': raw_category,
            'inferred': False,
            'reason': '',
        }
    text = f'{task_name} {context}'.lower()
    for candidate, keywords in TIME_CATEGORY_KEYWORDS.items():
        if _contains_any(text, keywords):
            return {
                'category': candidate,
                'inferred': True,
                'reason': f'任务描述命中{candidate}类关键词',
            }
    return {
        'category': raw_category or '其他',
        'inferred': not raw_category or raw_category == '其他',
        'reason': '未命中明显类别关键词',
    }


def _normalize_output_type(value):
    if not isinstance(value, str):
        return ''
    normalized = value.strip().lower()
    aliases = {
        '文档': 'deliverable',
        '报告': 'deliverable',
        '作业': 'deliverable',
        '代码': 'deliverable',
        '交付物': 'deliverable',
        'deliverable': 'deliverable',
        '沟通': 'communication',
        '会议': 'communication',
        '回复': 'communication',
        'communication': 'communication',
        '学习': 'learning',
        '练习': 'learning',
        '复习': 'learning',
        'learning': 'learning',
        '执行': 'execution',
        '跑腿': 'execution',
        '运动': 'execution',
        'execution': 'execution',
        '规划': 'planning',
        '计划': 'planning',
        'planning': 'planning',
        '其他': 'other',
        'other': 'other',
    }
    return aliases.get(normalized, '')


def _infer_output_type(task_name, category, context):
    text = f'{task_name} {category} {context}'.lower()
    if _contains_any(text, ['学习', '复习', '刷题', '背诵', '笔记', '课程', '考试', '练习', '阅读']):
        return 'learning'
    if _contains_any(text, ['会议', '沟通', '讨论', '联系', '回复', '汇报', '邮件', '消息', '答辩', '电话']):
        return 'communication'
    if _contains_any(text, ['计划', '规划', '安排', '整理', '拆解', '清单']):
        return 'planning'
    if _contains_any(text, ['文档', '报告', 'ppt', '方案', '代码', '设计稿', '文章', '作业', '实验报告', '接口', '简历']):
        return 'deliverable'
    if _contains_any(text, ['执行', '测试', '调试', '安装', '清洁', '采购', '提交', '跑步', '健身', '办理']):
        return 'execution'
    return 'other'


def _normalize_score(value, default_value):
    aliases = {
        '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
        '低': 2, '较低': 2, '中': 3, '中等': 3, '高': 4, '较高': 4, '很高': 5,
        '简单': 2, '普通': 3, '困难': 4, '很难': 5,
        '陌生': 2, '一般': 3, '熟悉': 4, '非常熟悉': 5,
        '轻': 2, '紧': 4,
    }
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in aliases:
            return aliases[normalized]
    return _clamp(_safe_int(value, default_value), 1, 5)


def _infer_difficulty(task_name, category, context, output_type):
    text = f'{task_name} {category} {context}'.lower()
    score = 3
    if output_type in {'deliverable', 'learning'}:
        score += 1
    if _contains_any(text, ['论文', '架构', '系统', '开发', '调试', '分析', '实验', '研究', '压测', '复杂', '困难']):
        score += 1
    if _contains_any(text, ['热身', '整理', '回复', '简单', '例行', '日常']):
        score -= 1
    return _clamp(score, 1, 5)


def _infer_familiarity(task_name, category, context):
    text = f'{task_name} {category} {context}'.lower()
    if _contains_any(text, ['第一次', '新手', '陌生', '没做过', '不熟', '初次']):
        return 2
    if _contains_any(text, ['熟悉', '日常', '重复', '例行', '平时', '常规']):
        return 4
    return 3


def _infer_steps_count(task_name, context, output_type):
    text = f'{task_name} {context}'
    score = 1 + text.count('并') + text.count('、') + text.count('和')
    if _contains_any(text, ['整理', '分析', '设计', '撰写', '调试', '测试', '复盘', '汇总']):
        score += 1
    if output_type in {'deliverable', 'planning'}:
        score += 1
    if _contains_any(text, ['论文', '项目', '实验报告', '方案']):
        score += 2
    return _clamp(score, 1, MAX_STRUCTURED_STEPS_COUNT)


def _infer_deadline_pressure(task_name, context):
    text = f'{task_name} {context}'.lower()
    if _contains_any(text, ['马上', '立刻', '尽快', 'ddl', 'deadline', '今晚', '今天截止', '明天截止']):
        return 5
    if _contains_any(text, ['今天', '明天', '本周', '截止', '到期', '赶']):
        return 4
    if _contains_any(text, ['这周', '近期', '本月']):
        return 3
    return 2


def _normalize_structured_time_fields(source, task_name='', category='', context=''):
    raw = _pick_structured_time_fields(source)
    output_type = _normalize_output_type(raw.get('output_type')) or _infer_output_type(task_name, category, context)
    return {
        'difficulty': _normalize_score(raw.get('difficulty'), _infer_difficulty(task_name, category, context, output_type)),
        'familiarity': _normalize_score(raw.get('familiarity'), _infer_familiarity(task_name, category, context)),
        'steps_count': _clamp(_safe_int(raw.get('steps_count'), _infer_steps_count(task_name, context, output_type)), 1, MAX_STRUCTURED_STEPS_COUNT),
        'deadline_pressure': _normalize_score(raw.get('deadline_pressure'), _infer_deadline_pressure(task_name, context)),
        'output_type': output_type,
    }


def _round_minutes(value):
    rounded = int(round(float(value) / 5.0) * 5) if value not in (None, '') else 5
    return max(5, rounded)


def _build_time_factor(name, impact_minutes, reason, stage='baseline'):
    rounded_impact = int(round(float(impact_minutes or 0)))
    direction = 'neutral'
    if rounded_impact > 0:
        direction = 'increase'
    elif rounded_impact < 0:
        direction = 'decrease'
    return {
        'name': name,
        'impact_minutes': rounded_impact,
        'direction': direction,
        'reason': reason,
        'stage': stage,
    }


def _format_minutes(value):
    minutes = max(5, _round_minutes(value))
    hours = minutes // 60
    mins = minutes % 60
    if hours <= 0:
        return f'{mins}分钟'
    return f'{hours}小时{mins}分钟' if mins > 0 else f'{hours}小时'


def _get_keyword_time_factors(task_name, category, context):
    text = f'{task_name} {category} {context}'.lower()
    factors = []
    if _contains_any(text, ['论文', '报告', 'ppt', '原型', '方案', '代码', '开发', '调试', '实验报告', '答辩']):
        factors.append(_build_time_factor('任务内容', 20, '任务描述显示需要产出较完整成果，通常更耗时'))
    if _contains_any(text, ['整理', '核对', '回复', '热身', '签到', '打卡', '例行']):
        factors.append(_build_time_factor('任务内容', -10, '任务描述更像短流程或例行事项，基础耗时会更短'))
    if _contains_any(text, ['第一次', '新手', '陌生', '没做过', '从零开始']):
        factors.append(_build_time_factor('经验情况', 10, '任务文本提示是首次或不熟悉场景，需要预留摸索时间'))
    if _contains_any(text, ['复盘', '总结', '汇总', '分析', '设计']):
        factors.append(_build_time_factor('处理深度', 10, '任务包含分析或总结环节，往往不止是机械执行'))
    return factors


def _calculate_rule_baseline(task_name, category, context='', structured_features=None):
    normalized_features = _normalize_structured_time_fields(
        structured_features or {},
        task_name,
        category,
        context,
    )
    factors = []
    total_minutes = 30

    output_delta = TIME_OUTPUT_TYPE_BASELINE_DELTAS.get(normalized_features.get('output_type'), 0)
    total_minutes += output_delta
    factors.append(_build_time_factor(
        '产出类型',
        output_delta,
        TIME_OUTPUT_TYPE_LABELS.get(normalized_features.get('output_type'), '根据任务产出类型调整基础耗时'),
    ))

    difficulty_delta = (normalized_features.get('difficulty', 3) - 3) * 15
    if difficulty_delta:
        factors.append(_build_time_factor(
            '任务难度',
            difficulty_delta,
            f'当前难度评分为 {normalized_features.get("difficulty")}，难度越高越需要额外时间',
        ))
    total_minutes += difficulty_delta

    familiarity_delta = (3 - normalized_features.get('familiarity', 3)) * 12
    if familiarity_delta:
        factors.append(_build_time_factor(
            '熟悉度',
            familiarity_delta,
            (
                f'当前熟悉度为 {normalized_features.get("familiarity")}，越不熟悉越需要摸索'
                if familiarity_delta > 0 else
                f'当前熟悉度为 {normalized_features.get("familiarity")}，熟悉任务通常会更快'
            ),
        ))
    total_minutes += familiarity_delta

    steps_delta = (normalized_features.get('steps_count', 1) - 1) * 8
    if steps_delta:
        factors.append(_build_time_factor(
            '步骤数',
            steps_delta,
            f'步骤数为 {normalized_features.get("steps_count")}，拆分环节越多通常越耗时',
        ))
    total_minutes += steps_delta

    deadline_delta = TIME_DEADLINE_PRESSURE_DELTAS.get(normalized_features.get('deadline_pressure'), 0)
    if deadline_delta:
        factors.append(_build_time_factor(
            '截止压力',
            deadline_delta,
            (
                f'截止压力为 {normalized_features.get("deadline_pressure")}，通常需要预留沟通或返工缓冲'
                if deadline_delta > 0 else
                '截止压力较低，可按更平稳节奏安排'
            ),
        ))
    total_minutes += deadline_delta

    keyword_factors = _get_keyword_time_factors(task_name, category, context)
    for factor in keyword_factors:
        total_minutes += factor['impact_minutes']
        factors.append(factor)

    baseline_minutes = _clamp(_round_minutes(total_minutes), 5, 24 * 60)
    top_factors = sorted(
        [factor for factor in factors if factor['impact_minutes'] != 0],
        key=lambda factor: abs(factor['impact_minutes']),
        reverse=True,
    )[:3]

    return {
        'baseline_minutes': baseline_minutes,
        'structured_features': normalized_features,
        'factor_details': factors,
        'top_factors': top_factors,
        'major_factors': [factor['reason'] for factor in top_factors],
        'baseline_comparison': '当前直接使用规则基线估算',
        'summary': ' + '.join(factor['reason'] for factor in top_factors[:2]) or '根据结构化字段生成基础时间',
    }


def _build_estimate_context(task_name, category, context, structured_features, category_meta):
    parts = []
    trimmed_context = context.strip() if isinstance(context, str) else ''
    if trimmed_context:
        parts.append(trimmed_context)
    parts.append(f'类别:{category}')
    parts.append(f'难度:{structured_features["difficulty"]}/5')
    parts.append(f'熟悉度:{structured_features["familiarity"]}/5')
    parts.append(f'步骤数:{structured_features["steps_count"]}')
    parts.append(f'截止压力:{structured_features["deadline_pressure"]}/5')
    parts.append(f'产出类型:{TIME_OUTPUT_TYPE_LABELS.get(structured_features["output_type"], structured_features["output_type"])}')
    if category_meta and category_meta.get('inferred') and category_meta.get('category') != '其他':
        parts.append(f'类别依据:{category_meta.get("reason", "")}')
    return '；'.join(parts)


def _calculate_buffer_minutes(baseline_minutes, structured_features):
    ratio = 0.2
    if structured_features.get('difficulty', 3) >= 4:
        ratio += 0.05
    if structured_features.get('familiarity', 3) <= 2:
        ratio += 0.05
    if structured_features.get('deadline_pressure', 3) >= 4:
        ratio += 0.05
    if structured_features.get('steps_count', 1) >= 4:
        ratio += 0.03
    return _clamp(_round_minutes(baseline_minutes * min(ratio, 0.4)), 5, 120)


def _build_time_estimate_success_payload(task_name, category, structured_features, estimate_data, source):
    estimated_minutes = _safe_int(estimate_data.get('estimated_minutes'), 0)
    baseline_minutes = _safe_int(estimate_data.get('baseline_minutes', estimated_minutes), estimated_minutes)
    calibrated_minutes = _safe_int(estimate_data.get('calibrated_minutes', estimated_minutes), estimated_minutes)
    confidence_level = estimate_data.get('confidence_level') or '中'
    low_confidence = bool(estimate_data.get('low_confidence'))
    confidence_reasons = estimate_data.get('confidence_reasons')
    if not isinstance(confidence_reasons, list):
        confidence_reasons = []

    if low_confidence:
        suggestion = '当前估算可信度较低，建议预留额外缓冲时间，或先拆成更具体的子任务后再估算。'
    elif source == 'local_model_bridge':
        suggestion = '已通过本地两阶段估算链路完成校准；完成后记录实际用时，可继续提升后续估算准确度。'
    else:
        suggestion = (
            f'基于 {estimate_data.get("model_version", "当前")} 模型估算，'
            '实际用时可能因个人情况有所不同。完成此任务后请记录实际用时，帮助Mosa更准确地估算。'
        )

    return {
        'success': True,
        'task_name': task_name,
        'category': category,
        'estimated_minutes': estimated_minutes,
        'estimated_time_display': _format_minutes(estimated_minutes),
        'baseline_minutes': baseline_minutes,
        'baseline': {
            'minutes': baseline_minutes,
            'display': _format_minutes(baseline_minutes),
        },
        'calibrated_minutes': calibrated_minutes,
        'comparison': estimate_data.get('baseline_comparison'),
        'calibration_ratio': estimate_data.get('calibration_ratio'),
        'calibration_delta_minutes': estimate_data.get('calibration_delta_minutes'),
        'baseline_comparison': estimate_data.get('baseline_comparison'),
        'confidence_interval': estimate_data.get('confidence_interval'),
        'confidence_level': confidence_level,
        'low_confidence': low_confidence,
        'confidence_reasons': confidence_reasons,
        'relative_interval_width': estimate_data.get('relative_interval_width'),
        'major_factors': estimate_data.get('major_factors') if isinstance(estimate_data.get('major_factors'), list) else [],
        'factor_details': estimate_data.get('factor_details') if isinstance(estimate_data.get('factor_details'), list) else [],
        'structured_features': estimate_data.get('structured_features') if isinstance(estimate_data.get('structured_features'), dict) else structured_features,
        'training_summary': estimate_data.get('training_summary'),
        'model_version': estimate_data.get('model_version'),
        'estimator_mode': estimate_data.get('estimator_mode'),
        'used_model': estimate_data.get('used_model'),
        'fallback': bool(estimate_data.get('fallback')),
        'source': source,
        'message': estimate_data.get('message') or '已返回时间估算结果',
        'suggestion': suggestion,
    }


def _load_local_time_estimation_bridge():
    global LOCAL_TIME_ESTIMATION_BRIDGE
    if LOCAL_TIME_ESTIMATION_BRIDGE is not None:
        return LOCAL_TIME_ESTIMATION_BRIDGE

    bridge = {
        'module': None,
        'model': None,
        'vectorizer': None,
        'metadata': {},
        'init_info': {},
        'error': None,
    }
    try:
        if not os.path.exists(LOCAL_TIME_ESTIMATION_MODEL_FILE):
            raise FileNotFoundError(f'Local time estimation model file not found: {LOCAL_TIME_ESTIMATION_MODEL_FILE}')

        module_dir = os.path.dirname(LOCAL_TIME_ESTIMATION_MODEL_FILE)
        if module_dir not in sys.path:
            sys.path.insert(0, module_dir)

        spec = importlib.util.spec_from_file_location(
            'planmosaic_ai_agent_python_model',
            LOCAL_TIME_ESTIMATION_MODEL_FILE,
        )
        if spec is None or spec.loader is None:
            raise ImportError('Unable to create import spec for local time estimation model')

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model, vectorizer, init_info = module.initialize_model()
        metadata = init_info.get('metadata', {}) if isinstance(init_info, dict) else {}
        bridge.update({
            'module': module,
            'model': model,
            'vectorizer': vectorizer,
            'metadata': metadata,
            'init_info': init_info if isinstance(init_info, dict) else {},
        })
        logger.info(
            '[Estimate Task Time] Local estimator bridge ready (%s)',
            bridge['init_info'].get('status', 'loaded'),
        )
    except Exception as exc:
        bridge['error'] = exc
        logger.warning('[Estimate Task Time] Failed to initialize local estimator bridge: %s', exc)

    LOCAL_TIME_ESTIMATION_BRIDGE = bridge
    return LOCAL_TIME_ESTIMATION_BRIDGE


def _estimate_task_time_via_local_model(task_name, category, context, structured_features):
    bridge = _load_local_time_estimation_bridge()
    module = bridge.get('module')
    if module is None:
        return None

    try:
        prediction = module.predict(
            bridge.get('model'),
            bridge.get('vectorizer'),
            task_name,
            category,
            context,
            structured_features=structured_features,
            metadata=bridge.get('metadata') or {},
        )
    except Exception as exc:
        logger.warning('[Estimate Task Time] Local estimator bridge prediction failed: %s', exc)
        return None

    if not prediction.get('used_model'):
        logger.info('[Estimate Task Time] Local estimator bridge has no calibrated model, falling back to rule baseline response')
        return None

    metadata = bridge.get('metadata') or {}
    return {
        'estimated_minutes': prediction.get('estimated_minutes'),
        'baseline_minutes': prediction.get('baseline_minutes'),
        'calibrated_minutes': prediction.get('calibrated_minutes'),
        'calibration_ratio': prediction.get('calibration_ratio'),
        'calibration_delta_minutes': prediction.get('calibration_delta_minutes'),
        'baseline_comparison': prediction.get('baseline_comparison'),
        'confidence_interval': prediction.get('confidence_interval'),
        'confidence_level': prediction.get('confidence_level'),
        'low_confidence': prediction.get('low_confidence'),
        'confidence_reasons': prediction.get('confidence_reasons'),
        'relative_interval_width': prediction.get('relative_interval_width'),
        'major_factors': prediction.get('major_factors'),
        'factor_details': prediction.get('factor_details'),
        'structured_features': prediction.get('structured_features'),
        'fallback': False,
        'estimator_mode': prediction.get('estimator_mode') or metadata.get('estimator_mode'),
        'used_model': True,
        'message': '已通过 Desktop 本地两阶段时间估算链路返回结果，无需独立 Flask 时间估算服务。',
        'model_version': metadata.get('estimator_mode', 'local_model_bridge'),
        'training_summary': {
            'total_samples': metadata.get('total_samples', 0),
            'preset_samples': metadata.get('preset_samples', 0),
            'user_samples': metadata.get('user_samples', 0),
            'filtered_samples': metadata.get('filtered_samples', 0),
            'low_confidence_samples': metadata.get('low_confidence_samples', {}),
        },
    }


def _extract_time_estimation_meta(source, task_name='', estimated_minutes=0):
    if not isinstance(source, dict):
        return None
    meta = source.get('timeEstimation')
    if not isinstance(meta, dict):
        meta = source.get('time_estimation')
    if not isinstance(meta, dict):
        meta = source
    category = _normalize_estimate_category(meta.get('category', ''), task_name, meta.get('context') or meta.get('note') or '')
    context = str(meta.get('context') or meta.get('note') or '').strip()
    structured_features = _normalize_structured_time_fields(meta, task_name, category, context)
    normalized_estimated_minutes = _safe_int(
        meta.get('estimatedMinutes', meta.get('estimated_minutes', estimated_minutes)),
        estimated_minutes,
    )
    has_signal = any([
        meta.get('category'),
        context,
        meta.get('structuredFeatures'),
        meta.get('structured_features'),
        meta.get('difficulty') is not None,
        meta.get('familiarity') is not None,
        meta.get('steps_count') is not None,
        meta.get('deadline_pressure') is not None,
        meta.get('output_type') is not None,
        normalized_estimated_minutes > 0,
    ])
    if not has_signal:
        return None
    return {
        'category': category,
        'context': context,
        'structuredFeatures': structured_features,
        'estimatedMinutes': normalized_estimated_minutes,
        'estimatedAt': meta.get('estimatedAt') or meta.get('estimated_at') or datetime.now().isoformat(),
        'source': meta.get('source') or 'task_metadata',
    }


def _load_estimate_snapshots():
    if not os.path.exists(ESTIMATE_SNAPSHOT_FILE):
        return []
    try:
        with open(ESTIMATE_SNAPSHOT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _find_estimate_snapshot(task_name, estimated_minutes=0):
    if not task_name:
        return None
    snapshots = [item for item in _load_estimate_snapshots() if isinstance(item, dict) and item.get('task_name') == task_name]
    if not snapshots:
        return None
    def _sort_key(item):
        snapshot_minutes = _safe_int(item.get('estimated_minutes'), 0)
        estimated_at = item.get('estimated_at') or ''
        try:
            timestamp = datetime.fromisoformat(estimated_at.replace('Z', '+00:00')).timestamp()
        except ValueError:
            timestamp = 0
        return (abs(snapshot_minutes - max(estimated_minutes, 0)), -timestamp)
    snapshots.sort(key=_sort_key)
    return snapshots[0]


def _time_estimation_meta_score(meta):
    if not isinstance(meta, dict):
        return -1
    structured = meta.get('structuredFeatures') or {}
    score = 0
    if meta.get('category') and meta.get('category') != '其他':
        score += 2
    if meta.get('context'):
        score += 2
    for key in ('difficulty', 'familiarity', 'steps_count', 'deadline_pressure'):
        if _safe_int(structured.get(key), 0) > 0:
            score += 1
    if structured.get('output_type'):
        score += 1
    return score


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
            'verify_changes': self._execute_verify_changes,
        }

        handler = dispatcher.get(routed_name)
        if handler is None:
            return json.dumps({'error': 'Unknown tool', 'name': routed_name}, ensure_ascii=False)

        return handler(routed_args, schedule_data, schedules)

    def _execute_manage_schedule(self, args, schedule_data, schedules):
        action = args.get('action')
        date = args.get('date')

        if not date:
            return json.dumps({'success': False, 'error': '缺少必要参数：date（需要 YYYY-MM-DD 格式，例如 2026-06-08）'}, ensure_ascii=False)

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
            dates = _valid_date_keys(schedules)
            return json.dumps({'dates': dates, 'count': len(dates)}, ensure_ascii=False)

        if args.get('keyword'):
            kw = sanitize_str(args['keyword']).lower()
            results = []
            if kw:
                for date, schedule in schedules.items():
                    if not (isinstance(date, str) and _DATE_KEY_RE.match(date)):
                        continue
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
            available_dates = _valid_date_keys(schedules)
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

            time_estimation = _extract_time_estimation_meta(
                {
                    'category': args.get('category'),
                    'context': args.get('context') or note,
                    'structured_features': args.get('structured_features'),
                    'difficulty': args.get('difficulty'),
                    'familiarity': args.get('familiarity'),
                    'steps_count': args.get('steps_count'),
                    'deadline_pressure': args.get('deadline_pressure'),
                    'output_type': args.get('output_type'),
                    'estimated_minutes': estimated_minutes,
                    'source': 'manage_tasks.add',
                },
                task_name=task_name,
                estimated_minutes=_safe_int(estimated_minutes, 0),
            )

            schedule_data['schedules'][date]['tasks'].append({
                'name': task_name,
                'estimated': str(estimated_minutes),
                'actual': '',
                'note': note,
                'completed': False,
                'timeEstimation': time_estimation,
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
            estimated_minutes = _safe_int(task.get('estimated'), 0)
            training_collection = {
                'attempted': False,
                'success': False,
                'source': 'skipped',
            }

            if _safe_int(actual_minutes, 0) > 0:
                task_meta = _extract_time_estimation_meta(task, task_name=task_name, estimated_minutes=estimated_minutes)
                snapshot_meta = _extract_time_estimation_meta(
                    _find_estimate_snapshot(task_name, estimated_minutes=estimated_minutes) or {},
                    task_name=task_name,
                    estimated_minutes=estimated_minutes,
                )
                effective_meta = task_meta
                if _time_estimation_meta_score(snapshot_meta) > _time_estimation_meta_score(task_meta):
                    effective_meta = snapshot_meta
                if effective_meta and effective_meta is not task_meta:
                    task['timeEstimation'] = effective_meta
                category = effective_meta.get('category') if effective_meta else _normalize_estimate_category('其他', task_name, '')
                context = effective_meta.get('context') if effective_meta else ''
                structured_features = (
                    effective_meta.get('structuredFeatures')
                    if effective_meta else
                    _normalize_structured_time_fields({}, task_name, category, context)
                )
                payload = {
                    'task_name': task_name,
                    'category': category,
                    'context': context,
                    'estimated_minutes': estimated_minutes,
                    'actual_minutes': _safe_int(actual_minutes, 0),
                    'structured_features': structured_features,
                }
                training_collection = {
                    'attempted': True,
                    'success': False,
                    'source': (
                        'estimate_snapshot'
                        if effective_meta is snapshot_meta and snapshot_meta is not None
                        else ('task_metadata' if task_meta else 'inferred_defaults')
                    ),
                    'payload': payload,
                }
                try:
                    with httpx.Client(timeout=5.0) as client:
                        response = client.post(
                            f'{TIME_ESTIMATION_SERVICE_BASE}/api/collect-training-data',
                            json=payload,
                        )
                    if response.is_success:
                        training_collection['success'] = True
                        training_collection['result'] = response.json()
                    else:
                        training_collection['error'] = f'HTTP {response.status_code}'
                        training_collection['response_text'] = response.text[:300]
                        logger.warning('[Training Data] collect-training-data failed: %s', training_collection['error'])
                except Exception as exc:
                    training_collection['error'] = str(exc)
                    logger.warning('[Training Data] collect-training-data exception: %s', exc)
            return json.dumps({
                'success': True,
                'content': f"任务已完成：{task_name}（实际{actual_minutes or '?'}分钟）",
                'shouldRefresh': True,
                'trainingDataCollection': training_collection,
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
            current_type = task.get('type') or task.get('taskType') or task.get('task_type') or 'short'
            current_start_date = task.get('startDate') or task.get('start_date')
            if args.get('new_task_type') and args['new_task_type'] != current_type:
                changes.append(f"类型：{current_type} -> {args['new_task_type']}")
            if args.get('new_start_date') and args['new_start_date'] != current_start_date:
                changes.append(f"开始日期：{current_start_date or '无'} -> {args['new_start_date']}")
            if 'new_note' in args and args.get('new_note') != task.get('note', ''):
                changes.append(f"备注：{task.get('note', '无')} -> {args.get('new_note') or '无'}")

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
                    'newTaskType': args.get('new_task_type') or current_type,
                    'newStartDate': args.get('new_start_date') if 'new_start_date' in args else current_start_date,
                    'newNote': args.get('new_note') if 'new_note' in args else task.get('note', ''),
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

            missing = [k for k, v in {
                'semester_name': semester_name,
                'start_date': start_date,
                'end_date': end_date,
                'courses': courses,
            }.items() if not v]
            if missing:
                return json.dumps({
                    'success': False,
                    'error': f"create 课表缺少必要参数：{', '.join(missing)}（start_date/end_date 必须是 YYYY-MM-DD，courses 必须是课程数组）",
                }, ensure_ascii=False)

            try:
                start = datetime.strptime(start_date, '%Y-%m-%d')
            except ValueError:
                return json.dumps({'success': False, 'error': f'日期格式无效: {start_date}，期望格式 YYYY-MM-DD'}, ensure_ascii=False)
            try:
                end = datetime.strptime(end_date, '%Y-%m-%d')
            except ValueError:
                return json.dumps({'success': False, 'error': f'日期格式无效: {end_date}，期望格式 YYYY-MM-DD'}, ensure_ascii=False)
            # 校验每门课的 weekday 都能归一化到 0-6，避免把 1-7 误命中
            for idx, course in enumerate(courses):
                normalized = parse_template_weekday(course.get('weekday'))
                if normalized is None:
                    return json.dumps({
                        'success': False,
                        'error': f'courses[{idx}].weekday 非法: {course.get("weekday")!r}，期望 0-6 / 1-7 整数或"周一"～"周日"',
                    }, ensure_ascii=False)
            skip_set = set(skip_dates)

            added_count = 0
            current = start
            schedule_data.setdefault('schedules', {})

            while current <= end:
                ds = current.strftime('%Y-%m-%d')
                if ds not in skip_set:
                    current_weekday_candidates = date_weekday_candidates(current)
                    day_courses = [
                        c for c in courses
                        if not current_weekday_candidates.isdisjoint(parse_weekday_candidates(c.get('weekday')))
                    ]

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
            template_cell = _template_cell_from_args(args, 'course_cell')
            if template_cell.get('template_name'):
                template = _resolve_target_template(schedule_data, template_cell.get('template_name'))
                if not template:
                    return json.dumps({'success': False, 'error': f'未找到课表模板：{template_cell.get("template_name")}'}, ensure_ascii=False)
                if not isinstance(template.get('timeSlots'), list) or len(template.get('timeSlots')) == 0:
                    return json.dumps({'success': False, 'error': '目标课表模板缺少节次配置，请先在课表编辑器中设置时间槽'}, ensure_ascii=False)
                success, error = _upsert_template_cell(template, template_cell, overwrite=True)
                if not success:
                    return json.dumps({'success': False, 'error': error}, ensure_ascii=False)
                return json.dumps({
                    'success': True,
                    'content': f"已写入课表格子：{template_cell['template_name']} / {template_cell.get('week_type', 'all')} / 周{template_cell['weekday'] + 1} / 第{template_cell['section_start']}-{template_cell['section_end']}节 / {template_cell['course_name']}",
                    'shouldRefresh': True,
                    'editorEcho': {
                        'templateName': template_cell['template_name'],
                        'weekType': template_cell.get('week_type', 'all'),
                        'weekday': template_cell['weekday'],
                        'sectionStart': template_cell['section_start'],
                        'sectionEnd': template_cell['section_end'],
                        'courseName': template_cell['course_name'],
                        'location': template_cell.get('location', ''),
                        'teacher': template_cell.get('teacher', ''),
                        'note': template_cell.get('note', ''),
                    },
                }, ensure_ascii=False)

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
            weekday_candidates = parse_weekday_candidates(weekday)
            if not weekday_candidates:
                return json.dumps({'success': False, 'error': f'星期参数无效: {weekday}'}, ensure_ascii=False)

            while current <= end:
                if not date_weekday_candidates(current).isdisjoint(weekday_candidates):
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
            old_cell = _template_cell_from_args(args, 'old_course_cell')
            new_cell = _template_cell_from_args(args, 'new_course_cell')
            if old_cell.get('template_name') or new_cell.get('template_name'):
                template_name = old_cell.get('template_name') or new_cell.get('template_name')
                if not template_name:
                    return json.dumps({'success': False, 'error': '修改模板格子时缺少 template_name'}, ensure_ascii=False)
                if not old_cell.get('course_name') and args.get('course_name'):
                    old_cell['course_name'] = args.get('course_name')
                if not new_cell.get('course_name') and args.get('course_name'):
                    new_cell['course_name'] = args.get('course_name')
                if not old_cell.get('template_name'):
                    old_cell['template_name'] = template_name
                if not new_cell.get('template_name'):
                    new_cell['template_name'] = template_name
                if not old_cell.get('week_type'):
                    old_cell['week_type'] = new_cell.get('week_type') or 'all'
                if not new_cell.get('week_type'):
                    new_cell['week_type'] = old_cell.get('week_type') or 'all'
                changes = []
                if old_cell.get('course_name') != new_cell.get('course_name'):
                    changes.append(f"课程：{old_cell.get('course_name', '')} -> {new_cell.get('course_name', '')}")
                if old_cell.get('week_type') != new_cell.get('week_type'):
                    changes.append(f"单双周：{old_cell.get('week_type', '')} -> {new_cell.get('week_type', '')}")
                if old_cell.get('weekday') != new_cell.get('weekday'):
                    changes.append(f"星期：{old_cell.get('weekday')} -> {new_cell.get('weekday')}")
                if old_cell.get('section_start') != new_cell.get('section_start') or old_cell.get('section_end') != new_cell.get('section_end'):
                    changes.append(
                        f"节次：第{old_cell.get('section_start')}-{old_cell.get('section_end')}节 -> 第{new_cell.get('section_start')}-{new_cell.get('section_end')}节"
                    )
                for field, label in (('location', '地点'), ('teacher', '教师'), ('note', '备注')):
                    if old_cell.get(field) != new_cell.get(field):
                        changes.append(f"{label}：{old_cell.get(field, '')} -> {new_cell.get(field, '')}")
                if not changes:
                    return json.dumps({'success': False, 'content': '没有修改。'}, ensure_ascii=False)
                return json.dumps({
                    'success': True,
                    'content': f"**修改课表格子提案**\n\n原因：{args.get('reason')}\n\n" + '\n'.join(f'* {c}' for c in changes) + '\n\n请确认。',
                    'proposal': {
                        'type': 'modify_template_course',
                        'oldCourseCell': old_cell,
                        'newCourseCell': new_cell,
                        'reason': args.get('reason'),
                    },
                }, ensure_ascii=False)

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
            course_cell = _template_cell_from_args(args, 'course_cell')
            if not course_cell.get('template_name'):
                course_cell = _template_cell_from_args(args, 'old_course_cell')
            if course_cell.get('template_name'):
                if not course_cell.get('course_name') and args.get('course_name'):
                    course_cell['course_name'] = args.get('course_name')
                return json.dumps({
                    'success': True,
                    'content': (
                        f"**删除课表格子提案**\n\n原因：{args.get('reason')}\n\n"
                        f"模板：{course_cell.get('template_name')}\n"
                        f"单双周：{course_cell.get('week_type', 'all')}\n"
                        f"星期：{course_cell.get('weekday')}\n"
                        f"节次：第{course_cell.get('section_start')}-{course_cell.get('section_end')}节\n"
                        f"课程：{course_cell.get('course_name', '')}\n\n请确认。"
                    ),
                    'proposal': {
                        'type': 'remove_template_course',
                        'courseCell': course_cell,
                        'reason': args.get('reason'),
                    },
                }, ensure_ascii=False)

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
            template_name = sanitize_str(args.get('template_name') or '').strip()
            if template_name:
                template = _resolve_target_template(schedule_data, template_name)
                if not template:
                    return json.dumps({'success': False, 'error': f'未找到课表模板：{template_name}'}, ensure_ascii=False)
                week_type = normalize_week_type(args.get('week_type'), 'all')
                rows = []
                maps = []
                if week_type in ('odd', 'all'):
                    maps.append(('单周', template.get('oddWeekCourses') or {}))
                if week_type in ('even', 'all'):
                    maps.append(('双周', template.get('evenWeekCourses') or {}))
                for label, course_map in maps:
                    for _cell_key, start_section, end_section, day_index, cell_data in _iter_template_cells(course_map):
                        rows.append({
                            'weekType': label,
                            'weekday': day_index,
                            'sectionStart': start_section,
                            'sectionEnd': end_section,
                            'courseName': sanitize_str(cell_data.get('course') or ''),
                            'location': sanitize_str(cell_data.get('location') or ''),
                            'teacher': sanitize_str(cell_data.get('teacher') or ''),
                            'note': sanitize_str(cell_data.get('note') or ''),
                        })
                rows.sort(key=lambda item: (item['weekType'], item['weekday'], item['sectionStart']))
                return safe_json_stringify({
                    'success': True,
                    'templateName': template_name,
                    'count': len(rows),
                    'cells': rows,
                })

            w_filter = args.get('weekday_filter')
            keyword = sanitize_str(args.get('keyword') or '').lower()
            weekday_filter_candidates = parse_weekday_candidates(w_filter)

            all_courses = []
            for date, sch in (schedule_data.get('schedules') or {}).items():
                try:
                    date_obj = datetime.strptime(date, '%Y-%m-%d')
                    dow = date_obj.weekday()
                except ValueError:
                    logger.warning(f"跳过损坏的日期: {date}")
                    continue
                if w_filter is not None and weekday_filter_candidates and date_weekday_candidates(date_obj).isdisjoint(weekday_filter_candidates):
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
            # weekday 统一 0-6（0=周一，6=周日），按 0..6 顺序输出
            for wd in range(7):
                if wd not in by_day:
                    continue
                parts.append(f"[{WEEKDAY_NAMES[wd]}]\n")
                for c in by_day[wd]:
                    detail_str = f' * {c["detail"]}' if c.get('detail') else ''
                    parts.append(f"  {c['time']} {c['name']}{detail_str}\n")
            parts.append('\n')

            # 模板聚合：当存在 scheduleTemplates 但未指定 template_name 时，一并展示
            template_summaries = []
            for tpl in (schedule_data.get('scheduleTemplates') or []):
                if not isinstance(tpl, dict):
                    continue
                tpl_name = sanitize_str(tpl.get('name') or '').strip()
                if not tpl_name:
                    continue
                tpl_rows = []
                for label, course_map in (('单周', tpl.get('oddWeekCourses') or {}), ('双周', tpl.get('evenWeekCourses') or {})):
                    for _cell_key, start_section, end_section, day_index, cell_data in _iter_template_cells(course_map):
                        tpl_rows.append({
                            'weekType': label,
                            'weekday': day_index,
                            'sectionStart': start_section,
                            'sectionEnd': end_section,
                            'courseName': sanitize_str(cell_data.get('course') or ''),
                            'location': sanitize_str(cell_data.get('location') or ''),
                            'teacher': sanitize_str(cell_data.get('teacher') or ''),
                            'note': sanitize_str(cell_data.get('note') or ''),
                        })
                tpl_rows.sort(key=lambda r: (r['weekType'], r['weekday'], r['sectionStart']))
                if tpl_rows:
                    template_summaries.append({
                        'templateName': tpl_name,
                        'count': len(tpl_rows),
                        'cells': tpl_rows,
                    })
                    parts.append(f"--- 模板：{tpl_name}（{len(tpl_rows)} 格）---\n")
                    for r in tpl_rows:
                        wd = r['weekday']
                        wd_name = WEEKDAY_NAMES[wd] if 0 <= wd < len(WEEKDAY_NAMES) else '?'
                        meta = ' / '.join(p for p in (r.get('location'), r.get('teacher')) if p)
                        meta_str = f' * {meta}' if meta else ''
                        parts.append(f"  {wd_name} 第{r['sectionStart']}-{r['sectionEnd']}节 [{r['weekType']}] {r['courseName']}{meta_str}\n")
                    parts.append('\n')

            return safe_json_stringify({
                'success': True,
                'content': ''.join(parts),
                'actual': all_courses,
                'templates': template_summaries,
            })

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
                        'weekday': WEEKDAY_NAMES[d.weekday()],
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
            templates = schedule_data.get('scheduleTemplates') or []
            return json.dumps({
                'success': True,
                'templates': [t.get('name', '') for t in templates if isinstance(t, dict) and t.get('name')],
                'count': len(templates),
            }, ensure_ascii=False)

        if action == 'create':
            if not args.get('template_name') or not args.get('template_data'):
                return json.dumps({'success': False, 'error': '缺少模板名称或数据'}, ensure_ascii=False)

            schedule_data.setdefault('scheduleTemplates', [])
            templates = schedule_data['scheduleTemplates']
            template_name = args['template_name']
            template_data = copy.deepcopy(args['template_data']) if isinstance(args.get('template_data'), dict) else {}
            template = {
                'id': template_data.get('id') or int(datetime.now().timestamp() * 1000),
                'name': template_name,
                'startDate': template_data.get('startDate', ''),
                'totalWeeks': template_data.get('totalWeeks', 16),
                'timeSlots': template_data.get('timeSlots') if isinstance(template_data.get('timeSlots'), list) else [],
                'oddWeekCourses': template_data.get('oddWeekCourses') if isinstance(template_data.get('oddWeekCourses'), dict) else {},
                'evenWeekCourses': template_data.get('evenWeekCourses') if isinstance(template_data.get('evenWeekCourses'), dict) else {},
            }
            existing_index = next((i for i, item in enumerate(templates) if item.get('name') == template_name), None)
            if existing_index is None:
                templates.append(template)
                message = f"模板\"{template_name}\"已创建"
            else:
                templates[existing_index] = template
                message = f"模板\"{template_name}\"已更新"
            return json.dumps({
                'success': True,
                'message': message,
                'shouldRefresh': True,
            }, ensure_ascii=False)

        if action == 'apply':
            if not args.get('template_name') or not args.get('target_date'):
                return json.dumps({'success': False, 'error': '缺少模板名称或目标日期'}, ensure_ascii=False)

            template = next(
                (
                    item for item in (schedule_data.get('scheduleTemplates') or [])
                    if isinstance(item, dict) and item.get('name') == args['template_name']
                ),
                None,
            )
            if not template:
                return json.dumps({'success': False, 'error': f"模板\"{args['template_name']}\"不存在"}, ensure_ascii=False)

            return json.dumps({
                'success': True,
                'type': 'proposal',
                'content': f"**应用模板提案**\n\n将模板“{args['template_name']}”应用到 {args['target_date']}\n\n请确认。",
                'proposal': {
                    'type': 'apply_template',
                    'templateName': args['template_name'],
                    'targetDate': args['target_date'],
                    'templateData': copy.deepcopy(template),
                    'reason': args.get('reason'),
                },
            }, ensure_ascii=False)

        if action == 'delete':
            if not args.get('template_name'):
                return json.dumps({'success': False, 'error': '缺少模板名称'}, ensure_ascii=False)

            templates = schedule_data.get('scheduleTemplates') or []
            before = len(templates)
            schedule_data['scheduleTemplates'] = [
                item for item in templates
                if not (isinstance(item, dict) and item.get('name') == args['template_name'])
            ]
            deleted = before - len(schedule_data['scheduleTemplates'])
            return json.dumps({
                'success': deleted > 0,
                'message': f"模板\"{args['template_name']}\"已删除" if deleted > 0 else f"模板\"{args['template_name']}\"不存在",
                'shouldRefresh': deleted > 0,
            }, ensure_ascii=False)

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
            for c_idx, c in enumerate(criteria):
                # 基础分 3.5，按 option 索引略降（首个最强），按 criterion 索引在三档间轮转
                # 保证分数落在 1~5 区间且 option / criterion 两个维度都有区分度
                criterion_offset = (c_idx % 3 - 1) * 0.6  # -0.6, 0, +0.6 三档
                option_offset = -idx * 0.5
                base = 3.5 + option_offset + criterion_offset + random.uniform(-0.3, 0.3)
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
        """执行网络搜索（web_search_evaluate）。

        流程：参数校验 → 缓存查找 → DuckDuckGo Instant Answer（主源）→ HTML 回退 →
              构造 summary_text / citations → 写入缓存 → 返回。
        """
        started = time.time()
        raw_query = args.get('query', '')
        query = _normalize_web_search_query(raw_query)
        purpose = args.get('purpose') or 'general'
        max_results = args.get('max_results') or _WEB_SEARCH_MAX_RESULTS
        try:
            max_results = max(1, min(int(max_results), 10))
        except (TypeError, ValueError):
            max_results = _WEB_SEARCH_MAX_RESULTS

        def _remaining_budget():
            return _WEB_SEARCH_TOTAL_BUDGET_SECONDS - (time.time() - started)

        def _effective_timeout(default=_WEB_SEARCH_TIMEOUT_SECONDS):
            """单源请求实际超时 = min(兜底超时, 剩余预算)，剩余 < 1s 时返回 0（跳过）。"""
            rem = _remaining_budget()
            if rem < _WEB_SEARCH_MIN_REMAINING_SECONDS:
                return 0
            return max(0.1, min(default, rem))

        # 1. 参数缺失
        if not query:
            logger.info('[WebSearch] missing query, args=%s', args)
            return json.dumps({
                'success': False,
                'query': raw_query,
                'error_code': 'missing_query',
                'error_message': '缺少 query 参数',
                'user_message': '请提供搜索关键词后再重试。',
                'fallback': True,
            }, ensure_ascii=False)

        cache_key = query.lower()

        # 2. 缓存命中
        cached = _web_search_cache_get(cache_key)
        if cached is not None:
            age = int(time.time() - (started - 0))  # 缓存中的 payload 自带时间戳会覆盖
            payload = dict(cached)
            payload['cached'] = True
            payload['cache_age_seconds'] = age if 'cache_age_seconds' not in payload else payload.get('cache_age_seconds')
            logger.info(
                '[WebSearch] query="%s" source=%s cache=hit elapsed=%dms',
                query, payload.get('source', 'unknown'), int((time.time() - started) * 1000),
            )
            return json.dumps(payload, ensure_ascii=False)

        # 3. 主源：DuckDuckGo Instant Answer API
        results = []
        source_used = None
        primary_error_code = None
        primary_timeout = _effective_timeout()
        if primary_timeout <= 0:
            primary_error_code = 'timeout'
            logger.warning('[WebSearch] primary skipped (budget exhausted) for query="%s"', query)
        else:
            try:
                ddg_url = f"https://api.duckduckgo.com/?q={_url_quote(query)}&format=json&no_html=1&skip_disambig=1"
                with httpx.Client(timeout=primary_timeout) as client:
                    resp = client.get(
                        ddg_url,
                        headers={'User-Agent': _WEB_SEARCH_UA, 'Accept': 'application/json'},
                    )
                if resp.status_code == 429:
                    primary_error_code = 'rate_limited'
                    logger.warning('[WebSearch] primary rate limited (HTTP 429) for query="%s"', query)
                elif resp.status_code != 200:
                    primary_error_code = 'api_error'
                    logger.warning('[WebSearch] primary HTTP %s for query="%s"', resp.status_code, query)
                else:
                    try:
                        data = resp.json()
                    except ValueError as e:
                        primary_error_code = 'api_error'
                        logger.warning('[WebSearch] primary JSON parse error: %s', e)
                    else:
                        results = _parse_duckduckgo_instant_answer(data, max_results=max_results)
                        if results:
                            source_used = 'duckduckgo_instant_answer'
            except httpx.TimeoutException:
                primary_error_code = 'timeout'
                logger.warning('[WebSearch] primary timeout (%.1fs) for query="%s"', primary_timeout, query)
            except (httpx.ConnectError, httpx.NetworkError) as e:
                primary_error_code = 'network_error'
                logger.warning('[WebSearch] primary network error: %s', e)
            except Exception as e:  # noqa: BLE001
                primary_error_code = 'api_error'
                logger.warning('[WebSearch] primary unexpected error: %s', e)

        # 4. 主源无结果 → HTML 回退
        if not results:
            fallback_timeout = _effective_timeout()
            if fallback_timeout <= 0:
                primary_error_code = primary_error_code or 'timeout'
                logger.warning('[WebSearch] html fallback skipped (budget exhausted) for query="%s"', query)
            else:
                try:
                    html_url = f"https://html.duckduckgo.com/html/?q={_url_quote(query)}"
                    with httpx.Client(timeout=fallback_timeout) as client:
                        html_resp = client.get(
                            html_url,
                            headers={'User-Agent': _WEB_SEARCH_BROWSER_UA, 'Accept': 'text/html'},
                        )
                    if html_resp.status_code == 200 and html_resp.text:
                        fb_results = _parse_duckduckgo_html_fallback(html_resp.text, max_results=max_results)
                        if fb_results:
                            results = fb_results
                            source_used = 'duckduckgo_html_fallback'
                        else:
                            logger.info('[WebSearch] html fallback returned 0 results for query="%s"', query)
                    elif html_resp.status_code == 429:
                        primary_error_code = primary_error_code or 'rate_limited'
                        logger.warning('[WebSearch] html fallback rate limited (HTTP 429) for query="%s"', query)
                    else:
                        logger.info('[WebSearch] html fallback HTTP %s for query="%s"', html_resp.status_code, query)
                except httpx.TimeoutException:
                    primary_error_code = primary_error_code or 'timeout'
                    logger.warning('[WebSearch] html fallback timeout (%.1fs) for query="%s"', fallback_timeout, query)
                except (httpx.ConnectError, httpx.NetworkError) as e:
                    primary_error_code = primary_error_code or 'network_error'
                    logger.warning('[WebSearch] html fallback network error: %s', e)
                except Exception as e:  # noqa: BLE001
                    logger.info('[WebSearch] html fallback error: %s', e)

        # 5. 中文查询优先回退到 Baidu HTML，其他查询回退到 Bing HTML
        if not results:
            provider_timeout = _effective_timeout()
            provider_name = 'baidu' if _is_cjk_query(query) else 'bing'
            if provider_timeout <= 0:
                primary_error_code = primary_error_code or 'timeout'
                logger.warning('[WebSearch] %s fallback skipped (budget exhausted) for query="%s"', provider_name, query)
            else:
                try:
                    search_query = query if provider_name == 'baidu' else _protect_search_phrase(query)
                    if provider_name == 'baidu':
                        provider_url = f"http://www.baidu.com/s?wd={_url_quote(search_query)}"
                    else:
                        provider_url = f"https://www.bing.com/search?q={_url_quote(search_query)}"
                    with httpx.Client(timeout=provider_timeout, follow_redirects=True) as client:
                        provider_resp = client.get(
                            provider_url,
                            headers={'User-Agent': _WEB_SEARCH_BROWSER_UA, 'Accept': 'text/html'},
                        )
                    if provider_resp.status_code == 200 and provider_resp.text:
                        provider_results = (
                            _parse_baidu_html_fallback(provider_resp.text, max_results=max_results)
                            if provider_name == 'baidu'
                            else _parse_bing_html_fallback(provider_resp.text, max_results=max_results)
                        )
                        if provider_results:
                            results = provider_results
                            source_used = f'{provider_name}_html_fallback'
                        else:
                            logger.info('[WebSearch] %s fallback returned 0 results for query="%s"', provider_name, query)
                    elif provider_resp.status_code == 429:
                        primary_error_code = primary_error_code or 'rate_limited'
                        logger.warning('[WebSearch] %s fallback rate limited (HTTP 429) for query="%s"', provider_name, query)
                    else:
                        logger.info('[WebSearch] %s fallback HTTP %s for query="%s"', provider_name, provider_resp.status_code, query)
                except httpx.TimeoutException:
                    primary_error_code = primary_error_code or 'timeout'
                    logger.warning('[WebSearch] %s fallback timeout (%.1fs) for query="%s"', provider_name, provider_timeout, query)
                except (httpx.ConnectError, httpx.NetworkError) as e:
                    primary_error_code = primary_error_code or 'network_error'
                    logger.warning('[WebSearch] %s fallback network error: %s', provider_name, e)
                except Exception as e:  # noqa: BLE001
                    logger.info('[WebSearch] %s fallback error: %s', provider_name, e)

        elapsed_ms = int((time.time() - started) * 1000)

        results = _rerank_search_results(query, results)
        if _is_person_query(query):
            results = _prune_person_results(query, results, max_keep=min(max_results, 3))

        # 6. 没有任何结果：可能是真无结果，也可能是网络错误
        if not results:
            if primary_error_code:
                user_message = {
                    'timeout': f'搜索超时（>={_WEB_SEARCH_TOTAL_BUDGET_SECONDS:.0f}秒未返回），建议简化查询关键词后重试。Mosa将基于已有知识回答。',
                    'network_error': '网络连接失败，请检查网络后重试。Mosa将基于已有知识回答。',
                    'rate_limited': '搜索服务暂时限流，请稍后重试。Mosa将基于已有知识回答。',
                    'api_error': '搜索服务暂时不可用，Mosa将基于已有知识回答。',
                }.get(primary_error_code, '搜索失败，Mosa将基于已有知识回答。')
                payload = {
                    'success': False,
                    'query': query,
                    'purpose': purpose,
                    'results': [],
                    'summary_text': '搜索失败，Mosa将基于已有知识回答。',
                    'citations': [],
                    'total_found': 0,
                    'error_code': primary_error_code,
                    'error_message': {
                        'timeout': '搜索超时',
                        'network_error': '网络连接失败',
                        'rate_limited': '搜索服务限流',
                        'api_error': '搜索服务异常',
                    }.get(primary_error_code, '搜索失败'),
                    'user_message': user_message,
                    'fallback': True,
                }
            else:
                payload = {
                    'success': True,
                    'query': query,
                    'purpose': purpose,
                    'results': [],
                    'summary_text': '未找到相关搜索结果，建议尝试其他关键词',
                    'citations': [],
                    'total_found': 0,
                    'source': 'duckduckgo',
                    'message': '未找到相关搜索结果，建议尝试其他关键词',
                }
            logger.info(
                '[WebSearch] query="%s" source=%s cache=miss elapsed=%dms total_found=0 error=%s',
                query, source_used or 'duckduckgo', elapsed_ms, primary_error_code or 'none',
            )
            return json.dumps(payload, ensure_ascii=False)

        # 7. 有结果：构造 summary / citations 并缓存
        summary_text = _build_summary_text(results)
        if _is_person_query(query):
            summary_text = _build_person_query_summary(query, results)
        citations = [
            {'title': r.get('title', ''), 'snippet': r.get('snippet', ''),
             'source': r.get('source', 'DuckDuckGo'), 'url': r.get('url', '')}
            for r in results
        ]
        payload = {
            'success': True,
            'query': query,
            'purpose': purpose,
            'results': results,
            'summary_text': summary_text,
            'citations': citations,
            'total_found': len(results),
            'source': source_used or 'duckduckgo_instant_answer',
        }
        _web_search_cache_set(cache_key, payload)
        logger.info(
            '[WebSearch] query="%s" source=%s cache=miss elapsed=%dms total_found=%d',
            query, source_used, elapsed_ms, len(results),
        )
        return json.dumps(payload, ensure_ascii=False)

    def _execute_estimate_task_time(self, args, schedule_data, schedules):
        task_name = args.get('task_name', '')
        raw_context = args.get('context', '')
        category_meta = _resolve_estimate_category(args.get('category', '其他'), task_name, raw_context)
        category = category_meta['category']
        structured_features = _normalize_structured_time_fields(args, task_name, category, raw_context)
        context = _build_estimate_context(task_name, category, raw_context, structured_features, category_meta)

        category_hints = {
            '学习': '学习类任务通常建议单次不超过90分钟（番茄工作法），复杂学习任务建议拆分为多个25-50分钟的时段',
            '工作': '工作类任务建议单次专注45-90分钟，代码类任务建议预留30%调试时间',
            '生活': '生活类任务时间弹性较大，建议预留20%缓冲时间应对意外',
            '运动': '运动类任务建议30-60分钟（不含热身和拉伸），高强度运动不超过45分钟',
        }

        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.post(
                    f'{TIME_ESTIMATION_SERVICE_BASE}/api/estimate-task-time',
                    json={
                        'task_name': task_name,
                        'category': category,
                        'context': context,
                        'structured_features': structured_features,
                    },
                )
            if response.is_success:
                py_data = response.json()
                payload = _build_time_estimate_success_payload(
                    task_name,
                    category,
                    structured_features,
                    py_data,
                    'ml_model' if py_data.get('used_model') else 'time_estimation_service',
                )
                return json.dumps(payload, ensure_ascii=False)
            logger.warning('[Estimate Task Time] Python service returned HTTP %s: %s', response.status_code, response.text[:300])
        except Exception as exc:
            logger.info('[Estimate Task Time] Python service unavailable, using rule baseline fallback: %s', exc)

        local_estimate = _estimate_task_time_via_local_model(task_name, category, context, structured_features)
        if local_estimate:
            payload = _build_time_estimate_success_payload(
                task_name,
                category,
                structured_features,
                local_estimate,
                'local_model_bridge',
            )
            return json.dumps(payload, ensure_ascii=False)

        fallback_estimate = _calculate_rule_baseline(task_name, category, raw_context, structured_features)
        buffer_minutes = _calculate_buffer_minutes(
            fallback_estimate['baseline_minutes'],
            fallback_estimate['structured_features'],
        )
        suggested_total_minutes = fallback_estimate['baseline_minutes'] + buffer_minutes
        return json.dumps({
            'success': True,
            'task_name': task_name,
            'category': category,
            'source': 'rule_baseline',
            'fallback_strategy': 'rule_baseline',
            'estimated_minutes': fallback_estimate['baseline_minutes'],
            'estimated_time_display': _format_minutes(fallback_estimate['baseline_minutes']),
            'baseline_minutes': fallback_estimate['baseline_minutes'],
            'baseline': {
                'minutes': fallback_estimate['baseline_minutes'],
                'display': _format_minutes(fallback_estimate['baseline_minutes']),
            },
            'calibrated_minutes': fallback_estimate['baseline_minutes'],
            'comparison': fallback_estimate['baseline_comparison'],
            'calibration_ratio': 1,
            'calibration_delta_minutes': 0,
            'baseline_comparison': fallback_estimate['baseline_comparison'],
            'buffer_minutes': buffer_minutes,
            'buffer_time_display': _format_minutes(buffer_minutes),
            'suggested_total_minutes': suggested_total_minutes,
            'suggested_total_time_display': _format_minutes(suggested_total_minutes),
            'structured_features': fallback_estimate['structured_features'],
            'major_factors': fallback_estimate['major_factors'],
            'factor_details': fallback_estimate['factor_details'],
            'top_factors': fallback_estimate['top_factors'],
            'estimator_mode': 'baseline_only',
            'used_model': False,
            'hint': category_hints.get(category, '请根据任务复杂度估算合理时间'),
            'fallback': True,
            'message': (
                f'Python时间估算服务暂不可用，已按任务类别和关键特征给出基础建议：'
                f'预计专注 {_format_minutes(fallback_estimate["baseline_minutes"])}，'
                f'再预留 {_format_minutes(buffer_minutes)} 缓冲。'
            ),
            'suggestion': (
                f'{fallback_estimate["summary"]}。'
                f'如果时间特别紧，建议按 {_format_minutes(suggested_total_minutes)} 安排；'
                '若任务可拆分，优先拆成更小步骤再执行。'
            ),
        }, ensure_ascii=False)

    # ============ 自检工具 verify_changes ============
    def _execute_verify_changes(self, args, schedule_data, schedules):
        """
        自检工具：从数据源回读实际数据并与期望值对比。

        支持两种调用模式：
        - 单条断言：args 含 date + slotKey(可选) + expect
        - 批量断言：args 含 assertions: [{date, slotKey?, expect}, ...]

        返回结构：
        {
            passed: bool,
            passed_count: int,
            total_count: int,
            assertions: [{key, expected, actual, pass, reason?}],
            source: 'memory' | 'disk',
            error?: str
        }
        """
        try:
            scope = args.get('scope', 'memory')
            if scope == 'disk':
                try:
                    from .paths import get_data_file_path
                    disk_path = get_data_file_path()
                    if os.path.exists(disk_path):
                        with open(disk_path, 'r', encoding='utf-8') as f:
                            fresh = json.load(f)
                        if isinstance(fresh, dict):
                            schedules = fresh.get('schedules', {}) or {}
                except Exception:
                    pass

            assertions = args.get('assertions')
            if not assertions or not isinstance(assertions, list) or len(assertions) == 0:
                # 单条断言模式
                date = args.get('date')
                if not date:
                    return json.dumps({
                        'passed': False,
                        'error': 'verify_changes: 缺少参数 date 或 assertions',
                        'source': scope,
                    }, ensure_ascii=False)
                single = {
                    'date': date,
                    'slotKey': args.get('slotKey'),
                    'expect': args.get('expect') or {},
                }
                assertions = [single]

            results = []
            passed_count = 0
            for asm in assertions:
                adate = asm.get('date')
                aslot = asm.get('slotKey')
                aexpect = asm.get('expect') or {}

                if not adate:
                    results.append({
                        'key': 'date',
                        'expected': '',
                        'actual': '',
                        'pass': False,
                        'reason': '断言缺少 date',
                    })
                    continue

                schedule = schedules.get(adate)
                if not schedule:
                    results.append({
                        'date': adate,
                        'slotKey': aslot,
                        'key': 'date',
                        'expected': aexpect,
                        'actual': None,
                        'pass': False,
                        'reason': f'数据源中无该日期: {adate}',
                    })
                    continue

                slots = schedule.get('timeSlots') or []
                slot = None
                if aslot:
                    for s in slots:
                        if isinstance(s, dict) and s.get('time') == aslot:
                            slot = s
                            break

                # 处理 slotExists 断言
                if 'slotExists' in aexpect:
                    expected_exists = bool(aexpect['slotExists'])
                    actual_exists = slot is not None
                    ok = (expected_exists == actual_exists)
                    if ok:
                        passed_count += 1
                    results.append({
                        'date': adate,
                        'slotKey': aslot,
                        'key': 'slotExists',
                        'expected': expected_exists,
                        'actual': actual_exists,
                        'pass': ok,
                    })
                    if not ok:
                        continue

                # 当 expect 只含 slotExists 而无需校验具体字段时跳过字段比对
                if not slot and aslot and 'slotExists' not in aexpect:
                    results.append({
                        'date': adate,
                        'slotKey': aslot,
                        'key': 'slot',
                        'expected': aexpect,
                        'actual': None,
                        'pass': False,
                        'reason': f'找不到时间段 {aslot}',
                    })
                    continue

                # 逐字段断言
                field_results = self._verify_slot_fields(slot, aexpect, adate, aslot)
                for fr in field_results:
                    results.append(fr)
                    if fr.get('pass'):
                        passed_count += 1

            return json.dumps({
                'passed': passed_count == len(results),
                'passed_count': passed_count,
                'total_count': len(results),
                'assertions': results,
                'source': scope,
            }, ensure_ascii=False)

        except Exception as e:
            logger.error('[verify_changes] exception: %s', e)
            return json.dumps({
                'passed': False,
                'error': f'verify_changes 内部错误: {e}',
                'source': args.get('scope', 'memory') if isinstance(args, dict) else 'memory',
            }, ensure_ascii=False)

    def _verify_slot_fields(self, slot, expect, date, slot_key):
        """
        对单个时间段逐字段断言。slot 为 None 或 expect 为空时返回空列表。
        支持的键：activity / detail / time / title / highlights。
        """
        if not expect or not isinstance(expect, dict):
            return []
        results = []
        # 字段键到数据源的映射
        for key in ('activity', 'detail', 'time', 'title', 'highlights'):
            if key not in expect:
                continue
            expected_value = expect[key]
            if key in ('title', 'highlights'):
                # 这些是 schedule 级别字段，从 schedule 容器读取
                # 不可在 _verify_slot_fields 中获取 schedule，改为上层处理
                continue
            actual_value = slot.get(key) if isinstance(slot, dict) else None
            ok = (actual_value == expected_value)
            results.append({
                'date': date,
                'slotKey': slot_key,
                'key': key,
                'expected': expected_value,
                'actual': actual_value,
                'pass': ok,
            })
        return results


def execute_tool_call(tool_call, schedule_data):
    executor = ToolExecutor()
    return executor.execute_tool_call(tool_call, schedule_data)
