"""
web_search_evaluate 验证脚本（手动 mock 网络层，不发起真实请求）。

覆盖：
  1. 中文 query 命中（mock 主源返回 1 条摘要 + 2 条 RelatedTopics）
  2. 英文 query 命中（mock 主源返回 1 条摘要）
  3. 主源无结果 → HTML 回退命中
  4. 主源无结果 + HTML 回退也无 → success:true total_found:0
  5. 超时（mock 主源 timeout）
  6. 网络错误（mock 主源 ConnectError）
  7. HTTP 429（mock 主源 rate_limited）
  8. 缓存命中
  9. 参数缺失（query 空 / 缺失）
 10. summary_text 长度不超过 2400

用法：
    cd "d:\\Trae CN\\Projects\\PlanMosaic\\PlanMosaic Desktop"
    python -m backend._verify_web_search

无需联网；通过 monkey-patch httpx.Client 实现隔离。
"""
import json
import sys
import io
from unittest.mock import patch, MagicMock

# 强制 stdout 使用 UTF-8（避免 Windows GBK 编码报错）
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from . import tool_executor
from .tool_executor import (
    ToolExecutor,
    _build_summary_text,
    _parse_duckduckgo_instant_answer,
    _parse_duckduckgo_html_fallback,
    _normalize_web_search_query,
    _WEB_SEARCH_CACHE,
)


def _execute_web_search(args, schedule_data=None, schedules=None):
    """通过 ToolExecutor 实例调用 _execute_web_search。"""
    return ToolExecutor()._execute_web_search(args, schedule_data or {}, schedules or {})


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None, text=''):
        self.status_code = status_code
        self._json = json_data
        self.text = text
        self.is_success = 200 <= status_code < 300

    def json(self):
        if self._json is None:
            raise ValueError('no json')
        return self._json


class _MockClient:
    """httpx.Client 的 mock，支持 with 上下文管理器。"""
    def __init__(self, primary_json=None, primary_status=200,
                 html_text='', html_status=200,
                 primary_exc=None, html_exc=None):
        self._primary_json = primary_json
        self._primary_status = primary_status
        self._html_text = html_text
        self._html_status = html_status
        self._primary_exc = primary_exc
        self._html_exc = html_exc

    def get(self, url, headers=None):
        if 'api.duckduckgo.com' in url:
            if self._primary_exc is not None:
                raise self._primary_exc
            return _FakeResponse(self._primary_status, self._primary_json)
        if 'html.duckduckgo.com' in url:
            if self._html_exc is not None:
                raise self._html_exc
            return _FakeResponse(self._html_status, None, text=self._html_text)
        return _FakeResponse(404)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _make_client(primary_json=None, primary_status=200,
                 html_text='', html_status=200,
                 primary_exc=None, html_exc=None):
    """构造一个 mock 的 httpx.Client 工厂。"""
    def factory(*args, **kwargs):
        return _MockClient(primary_json, primary_status, html_text, html_status, primary_exc, html_exc)
    return factory


def _clear_cache():
    _WEB_SEARCH_CACHE.clear()


def _run(label, expected_keys, expected_substrings, args, client_factory):
    _clear_cache()
    with patch('httpx.Client', side_effect=client_factory):
        result_str = _execute_web_search(args, {}, {})
    result = json.loads(result_str)
    print(f'\n=== {label} ===')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    # 校验
    missing = [k for k in expected_keys if k not in result]
    if missing:
        print(f'  [FAIL] MISSING KEYS: {missing}')
        return False
    for substr in expected_substrings:
        haystack = json.dumps(result, ensure_ascii=False)
        if substr not in haystack:
            print(f'  [FAIL] MISSING SUBSTRING: {substr}')
            return False
    print('  [OK]')
    return True


def main():
    results = []

    # 1. 中文 query 命中
    primary = {
        'AbstractText': '英语听力提升需要长期大量输入和输出练习。',
        'Heading': '英语听力学习方法',
        'AbstractSource': 'Wikipedia',
        'AbstractURL': 'https://example.com/listening',
        'RelatedTopics': [
            {'Text': '影子跟读法 - 跟读音频提高语感', 'FirstURL': 'https://example.com/shadow'},
            {'Text': '精听训练 - 逐句听写', 'FirstURL': 'https://example.com/intensive'},
        ],
    }
    results.append(_run(
        '1. 中文 query 命中',
        ['success', 'summary_text', 'citations', 'total_found', 'source'],
        ['影子跟读法', 'duckduckgo_instant_answer'],
        {'query': '如何高效学习英语听力？'},
        _make_client(primary_json=primary),
    ))

    # 2. 英文 query 命中
    primary_en = {
        'AbstractText': 'Learning piano requires consistent daily practice of scales and pieces.',
        'Heading': 'Piano learning',
        'AbstractSource': 'Wikipedia',
        'AbstractURL': 'https://example.com/piano',
        'RelatedTopics': [
            {'Text': 'Finger exercises - Hanon and Czerny', 'FirstURL': 'https://example.com/hanon'},
        ],
    }
    results.append(_run(
        '2. 英文 query 命中',
        ['success', 'source'],
        ['Hanon', 'duckduckgo_instant_answer'],
        {'query': 'how to learn piano'},
        _make_client(primary_json=primary_en),
    ))

    # 3. 主源空 → HTML 回退命中
    primary_empty = {'AbstractText': '', 'RelatedTopics': []}
    html_with_results = '''
    <html><body>
        <div class="result">
            <a class="result__a" href="https://example.com/a">Title A</a>
            <a class="result__snippet">Snippet A goes here</a>
        </div>
        <div class="result">
            <a class="result__a" href="https://example.com/b">Title B</a>
            <a class="result__snippet">Snippet B goes here</a>
        </div>
    </body></html>
    '''
    import sys as _sys
    _sys.stdout.flush()
    # Debug: call _parse_duckduckgo_html_fallback directly first
    _clear_cache()
    direct = _parse_duckduckgo_html_fallback(html_with_results, max_results=5)
    print(f'\n[DEBUG test 3] direct parser returned: {len(direct)} results', flush=True)
    # Debug: call _execute_web_search and check what html_resp.text contains
    from unittest.mock import patch as _patch
    _clear_cache()
    with _patch('httpx.Client', side_effect=_make_client(primary_json=primary_empty, html_text=html_with_results)):
        # Monkey-patch html parser to log input
        orig_parser = _parse_duckduckgo_html_fallback
        def logged_parser(html, max_results=5):
            print(f'[DEBUG test 3] parser called with html length: {len(html) if html else 0}', flush=True)
            print(f'[DEBUG test 3] html first 100 chars: {html[:100] if html else None}', flush=True)
            return orig_parser(html, max_results)
        with _patch('backend.tool_executor._parse_duckduckgo_html_fallback', side_effect=logged_parser):
            result_str_3 = _execute_web_search({'query': '学习钢琴'}, {}, {})
            print(f'[DEBUG test 3] result: {result_str_3[:500]}', flush=True)
    _sys.stdout.flush()
    results.append(_run(
        '3. 主源空 → HTML 回退命中',
        ['success', 'source'],
        ['Title A', 'duckduckgo_html_fallback'],
        {'query': '学习钢琴_2'},
        _make_client(primary_json=primary_empty, html_text=html_with_results),
    ))

    # 4. 主源 + HTML 都空 → total_found:0
    results.append(_run(
        '4. 主源 + HTML 都空 → total_found:0',
        ['success', 'total_found', 'summary_text'],
        ['未找到相关搜索结果'],
        {'query': 'xyzzzz no result query'},
        _make_client(primary_json=primary_empty, html_text='<html></html>'),
    ))

    # 5. 超时
    import httpx
    results.append(_run(
        '5. 超时',
        ['success', 'error_code', 'fallback'],
        ['timeout'],
        {'query': 'slow query'},
        _make_client(primary_exc=httpx.TimeoutException('timeout')),
    ))

    # 6. 网络错误
    results.append(_run(
        '6. 网络错误',
        ['success', 'error_code', 'fallback'],
        ['network_error'],
        {'query': 'no network'},
        _make_client(primary_exc=httpx.ConnectError('connect failed')),
    ))

    # 7. HTTP 429
    results.append(_run(
        '7. HTTP 429',
        ['success', 'error_code', 'fallback'],
        ['rate_limited'],
        {'query': 'rate limited'},
        _make_client(primary_status=429),
    ))

    # 8. 缓存命中（先跑一次有结果的，再跑同 query 应 cached:true）
    _clear_cache()
    with patch('httpx.Client', side_effect=_make_client(primary_json=primary)):
        first = json.loads(_execute_web_search({'query': 'cached query test'}, {}, {}))
    with patch('httpx.Client', side_effect=_make_client(primary_json=primary)):
        second = json.loads(_execute_web_search({'query': 'cached query test'}, {}, {}))
    ok_cache = first.get('success') and second.get('cached') is True
    print(f'\n=== 8. 缓存命中 ===\nfirst.cached={first.get("cached")} second.cached={second.get("cached")}')
    print('  [OK]' if ok_cache else '  [FAIL]')
    results.append(ok_cache)

    # 9. 参数缺失
    results.append(_run(
        '9. 参数缺失（query=""）',
        ['success', 'error_code'],
        ['missing_query'],
        {'query': ''},
        _make_client(),
    ))
    results.append(_run(
        '9b. 参数缺失（无 query 字段）',
        ['success', 'error_code'],
        ['missing_query'],
        {},
        _make_client(),
    ))

    # 10. summary_text 长度不超过 2400
    big_results = [{'title': f'Title {i}', 'snippet': 'x' * 250, 'source': 'S', 'url': f'https://e.com/{i}'} for i in range(10)]
    summary = _build_summary_text(big_results)
    ok_summary = len(summary) <= 2400
    print(f'\n=== 10. summary_text 长度 ===\nlen={len(summary)} (limit 2400)')
    print('  [OK]' if ok_summary else '  [FAIL]')
    results.append(ok_summary)

    # 11. 单元：_normalize_web_search_query
    norm_cases = [
        ('  hello   world  ', 'hello world'),
        ('如何学习英语？', '如何学习英语'),
        ('如何学习英语???', '如何学习英语'),
        ('查询！！！', '查询'),
        ('', ''),
        (None, ''),
    ]
    norm_ok = all(_normalize_web_search_query(q) == exp for q, exp in norm_cases)
    print(f'\n=== 11. _normalize_web_search_query 单元 ===\n  [OK]' if norm_ok else f'\n=== 11. _normalize_web_search_query 单元 ===\n  [FAIL]: {_normalize_web_search_query("如何学习英语？")}')
    results.append(norm_ok)

    # 12. 单元：_parse_duckduckgo_html_fallback 边界
    fb = _parse_duckduckgo_html_fallback(html_with_results, max_results=5)
    fb_ok = len(fb) == 2 and fb[0]['title'] == 'Title A' and fb[0]['url'] == 'https://example.com/a'
    print(f'\n=== 12. _parse_duckduckgo_html_fallback 单元 ===\nfb={fb}\n  [OK]' if fb_ok else f'\n=== 12. _parse_duckduckgo_html_fallback 单元 ===\nfb={fb}\n  [FAIL]')
    results.append(fb_ok)

    # 13. 预算控制：主源 timeout 后，剩余预算不足以支撑回退时，整个调用应在总预算内返回
    _clear_cache()
    import time as _time
    slow_primary = _MockClient  # 使用一个 sleep 1.2s 的"主源"以模拟慢响应
    class _SlowClient:
        def __init__(self, *a, **kw):
            self._delay = 1.2
        def get(self, url, headers=None):
            _time.sleep(self._delay)
            if 'api.duckduckgo.com' in url:
                return _FakeResponse(200, {'AbstractText': '', 'RelatedTopics': []})
            return _FakeResponse(200, None, text=html_with_results)
        def __enter__(self): return self
        def __exit__(self, *a): return False
    budget_t0 = _time.time()
    with patch('httpx.Client', side_effect=_SlowClient):
        budget_result = json.loads(_execute_web_search({'query': 'budget test query'}, {}, {}))
    budget_elapsed = _time.time() - budget_t0
    # 期望：总耗时不超过 _WEB_SEARCH_TOTAL_BUDGET_SECONDS + 1s 余量
    from .tool_executor import _WEB_SEARCH_TOTAL_BUDGET_SECONDS
    budget_ok = budget_elapsed <= (_WEB_SEARCH_TOTAL_BUDGET_SECONDS + 1.0)
    print(f'\n=== 13. 全局预算控制 ===\nelapsed={budget_elapsed:.2f}s (limit {_WEB_SEARCH_TOTAL_BUDGET_SECONDS}s+1s) total_found={budget_result.get("total_found")} source={budget_result.get("source")}')
    print('  [OK]' if budget_ok else '  [FAIL]')
    results.append(budget_ok)

    print('\n' + '=' * 50)
    passed = sum(1 for r in results if r)
    total = len(results)
    print(f'PASSED {passed}/{total}')
    if passed != total:
        sys.exit(1)


if __name__ == '__main__':
    main()
