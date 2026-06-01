import asyncio
import json
import logging
import os
import random
import re
import shutil
import time
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, Response

from . import paths
from .config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_API_URL,
    MODEL_NAME,
    REASONER_MODEL_NAME,
    QWEN_API_KEY,
    QWEN_API_URL,
    QWEN_MODEL_NAME,
    AGENT_PROVIDER,
    PORT,
    HOST,
    REJECT_UNAUTHORIZED,
    API_TIMEOUT_MS,
    DEEP_PLANNING_SYSTEM_PROMPT,
)
from .config import config as app_config
from .tools import AI_TOOLS
from .tool_executor import execute_tool_call, _create_backup, safe_json_stringify

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("planmosaic.server")

app = FastAPI(title="PlanMosaic Server")

is_production = os.environ.get("NODE_ENV") == "production"
if is_production:
    cors_origins_env = os.environ.get("CORS_ALLOWED_ORIGINS", "")
    cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()] if cors_origins_env else []
    if not cors_origins:
        cors_origins = [f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

SCRIPT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "PlanMosaic Desktop")
if not os.path.isdir(SCRIPT_DIR):
    SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEEP_PLANNING_TOOL_WHITELIST = [
    "value_monetization",
    "roi_calculator",
    "milestone_planner",
    "swot_analysis",
    "decision_matrix",
    "view_schedule",
]

TIMEOUT_SECONDS = 600
HTTP_CLIENT_TIMEOUT = httpx.Timeout(TIMEOUT_SECONDS, connect=30.0)

MIME_TYPES = {
    ".html": "text/html; charset=UTF-8",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".txt": "text/plain",
}


def _get_mime_type(ext):
    return MIME_TYPES.get(ext, "application/octet-stream")


def _safe_error_message(e):
    """在 production 模式下返回通用错误信息，始终记录完整错误日志"""
    logger.error("Error: %s", e)
    if os.environ.get("NODE_ENV") == "production":
        return "服务内部错误"
    return str(e)


def _sanitize_str(s):
    return re.sub(r"[\uD800-\uDFFF]", "", s or "")


def _safe_json_stringify(obj, indent=None):
    def _replacer(o):
        if isinstance(o, str):
            return re.sub(r"[\uD800-\uDFFF]", "\uFFFD", o)
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


def _parse_time_range(time_str):
    start, end = time_str.split("-")
    start_hour, start_min = map(int, start.split(":"))
    end_hour, end_min = map(int, end.split(":"))
    return {
        "startMinutes": start_hour * 60 + start_min,
        "endMinutes": end_hour * 60 + end_min,
        "startHour": start_hour,
        "startMin": start_min,
        "endHour": end_hour,
        "endMin": end_min,
    }


def _get_current_api_key():
    if app_config.agent_provider == "qwen":
        return app_config.qwen_key
    return app_config.deepseek_key


def _get_current_api_url():
    if app_config.agent_provider == "qwen":
        return app_config.qwen_base_url
    return app_config.deepseek_base_url


def _get_current_model_name():
    if app_config.agent_provider == "qwen":
        return app_config.qwen_model
    return app_config.deepseek_model


def _is_reasoner_model(model_name):
    return "reasoner" in model_name.lower() or "v4-flash" in model_name.lower() or "v4-pro" in model_name.lower()


def _needs_reasoning(message):
    if not message:
        return False
    msg = message.lower()
    planning_keywords = [
        "规划", "计划", "安排", "排", "调整", "优化", "整理", "重新",
        "帮我安排", "帮我规划", "帮我排", "怎么安排", "怎么规划",
        "推荐", "建议", "应该", "好不好", "合理", "更好",
        "冲突", "撞了", "重叠", "空闲", "有空",
        "本周", "下周", "这周", "本月", "这个月",
        "周计划", "日计划", "月计划", "学习计划", "复习计划",
        "课表", "选课", "加课", "退课", "换课",
    ]
    modification_keywords = [
        "添加", "新增", "增加", "删除", "移除", "修改", "改", "换",
        "取消", "推迟", "提前", "延期", "挪", "移",
        "添加日程", "加个", "建一个", "创建", "新建",
        "设置", "设为", "标记", "完成", "未完成",
        "批量", "全部",
    ]
    analysis_keywords = [
        "分析", "统计", "总结", "回顾", "对比", "比较",
        "多久", "频率", "规律", "习惯", "模式",
        "进度", "ddl", "deadline", "截止",
    ]
    for kw in planning_keywords + modification_keywords + analysis_keywords:
        if kw in msg:
            return True
    return False


class RateLimiter:
    def __init__(self, min_interval=1.0):
        self.min_interval = min_interval
        self.last_call_time = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.time()
            time_since_last = now - self.last_call_time
            if time_since_last < self.min_interval:
                wait_time = self.min_interval - time_since_last
                logger.info("Rate limit: waiting %.2fs", wait_time)
                await asyncio.sleep(wait_time)
            self.last_call_time = time.time()


_api_rate_limiter = RateLimiter(1.0)


def _read_schedule_data():
    try:
        path = paths.get_data_file_path()
        if not os.path.exists(path):
            return {"startDate": "", "endDate": "", "schedules": {}}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = path + '.corrupted.' + timestamp
        shutil.copy2(path, backup_path)
        logger.warning("Schedule data file corrupted, backed up to: %s", backup_path)
        return {"startDate": "", "endDate": "", "schedules": {}, "_corrupted": True}
    except OSError:
        return {"startDate": "", "endDate": "", "schedules": {}}


def _write_schedule_data(data):
    # 明文存储——未来迭代加密
    _create_backup("data.json")
    path = paths.get_data_file_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    content = _safe_json_stringify(data, indent=2)
    tmp_path = path + '.tmp'
    old_data = json.loads(json.dumps(data))
    try:
        with open(tmp_path, 'w', encoding='utf-8') as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except OSError as e:
        logger.error("[Write] Schedule data write failed: %s", e)
        data.clear()
        data.update(old_data)
        raise


def _read_agent_history():
    try:
        path = paths.get_agent_log_path()
        if not os.path.exists(path):
            return {"userProfile": {}, "conversations": [], "archivedConversations": [], "lastUpdate": ""}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = path + '.corrupted.' + timestamp
        shutil.copy2(path, backup_path)
        logger.warning("Agent history file corrupted, backed up to: %s", backup_path)
        return {"userProfile": {}, "conversations": [], "archivedConversations": [], "lastUpdate": "", "_corrupted": True}
    except OSError:
        return {"userProfile": {}, "conversations": [], "archivedConversations": [], "lastUpdate": ""}


def _write_agent_history(data):
    # 明文存储——未来迭代加密
    path = paths.get_agent_log_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    content = _safe_json_stringify(data, indent=2)
    tmp_path = path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)


def _compress_conversation(conversation):
    if not conversation or not conversation.get("content"):
        return conversation
    content = conversation["content"]
    compressed = content
    emoji_pattern = re.compile(
        r"[\U0001F300-\U0001F5FF\U0001F600-\U0001F64F\U0001F680-\U0001F6FF"
        r"\U0001F900-\U0001F9FF\u2600-\u26FF\u2700-\u27BF\u2B50"
        r"\U0001F7E0-\U0001F7FF\u25AA\u25AB\u25B6\u25C0]"
    )
    compressed = emoji_pattern.sub("", compressed)
    compressed = compressed.replace("**", "").replace("*", "")
    compressed = re.sub(r"#{1,6}\s", "", compressed)
    compressed = re.sub(r"\n{3,}", "\n", compressed)
    compressed = re.sub(r"\s{2,}", " ", compressed).strip()
    core_patterns = [
        (re.compile(r"我的分析[:：][\s\S]*?(?=\n\n|$)", re.IGNORECASE), "[分析]"),
        (re.compile(r"建议[:：][\s\S]*?(?=\n\n|$)", re.IGNORECASE), "[建议]"),
        (re.compile(r"注意[:：][\s\S]*?(?=\n\n|$)", re.IGNORECASE), "[注意]"),
    ]
    for pat, repl in core_patterns:
        compressed = pat.sub(repl, compressed)
    target_length = max(20, int(len(content) * 0.05))
    if len(compressed) > target_length:
        compressed = compressed[:target_length] + "..."
    return {**conversation, "content": compressed, "compressed": True}


def _archive_and_compress(history):
    conversations = history.get("conversations") or []
    if not conversations:
        return history
    compressed = [_compress_conversation(c) for c in conversations]
    archived = history.get("archivedConversations") or []
    active_limit = 50
    if len(compressed) > active_limit:
        to_archive = compressed[: len(compressed) - active_limit]
        to_keep = compressed[len(compressed) - active_limit :]
        return {
            **history,
            "conversations": to_keep,
            "archivedConversations": archived + to_archive,
        }
    return {**history, "conversations": compressed}


def _clean_reasoner_content(content):
    if not content:
        return content
    cleaned = content
    cleaned = re.sub(r"<think[^>]*>[\s\S]*?" + chr(60) + chr(47) + "think" + chr(62), "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"<thinking>[\s\S]*?" + chr(60) + chr(47) + "thinking" + chr(62), "", cleaned, flags=re.IGNORECASE).strip()
    return cleaned or content


def _build_system_prompt(profile_section):
    local_now = datetime.now().astimezone()
    tz_name = local_now.tzinfo
    if tz_name is None:
        tz_str = "UTC+8"
    else:
        tz_str = str(tz_name)
    today = local_now.strftime("%Y-%m-%d")
    tomorrow = (local_now + timedelta(days=1)).strftime("%Y-%m-%d")
    yesterday = (local_now - timedelta(days=1)).strftime("%Y-%m-%d")
    weekday_names = ["日", "一", "二", "三", "四", "五", "六"]
    date_info = f"今天是 {today}（周{weekday_names[local_now.weekday()]}），昨天是 {yesterday}，明天是 {tomorrow}。"

    prompt = f"""你是 Mosa，日程管理助理。用中文回复，简洁直接，不说废话。

【当前日期】{date_info}（用户本地时间，时区: {tz_str}）。工具 date 参数统一用 YYYY-MM-DD 格式。
{profile_section}

【核心规则】
1. 先调用工具获取数据，不猜测用户日程内容。
2. 一次请求可连续调用多个工具，完成所有必要操作后再回复。
3. 需要用户确认的操作（删除/修改日程）必须返回 proposal，不要直接执行。
4. 直接执行类操作（添加任务、完成任务、查看日程）无需确认，直接调用工具。
5. 回复控制在2句话以内，直接给出结果或确认已完成。
6. 所有"删除"和"移除"操作需用户确认，所有"批量"操作需用户确认。

7. **关键：modify_schedule 返回 success 只表示提案创建成功，不代表数据已修改。数据只有在用户确认提案后才会真正写入。**

8. **后验校验规则：任何修改操作被用户确认后，你必须主动调用 view_schedule 再查一次该日期，确认修改确实已落盘。如果发现数据不一致，立即告知用户。**

【修改操作选择指南】
- "把X改成Y"/"X换成Y"（只改内容不改时间）→ modify_schedule(operation="modify_slot", timeSlots=["X"], newSlotDetails={{"activity":"Y"}})
- "把X调到Y时间"（只改时间不改内容）→ modify_schedule(operation="modify_slot", timeSlots=["X"], newSlotDetails={{"time":"Y"}})
- "把X换成Y（时间和内容都换）" → modify_schedule(operation="replace_slot", timeSlots=["X"], newSlotDetails={{"time":"时间", "activity":"Y"}})
- "删掉X" → modify_schedule(operation="delete_slots", timeSlots=["X"])
- "加个X"/"安排X" → add_schedule 或 add_task
- "所有/全部X" → batch操作

【意图识别】
- "明天有什么" → view_schedule(date=明天日期)
- "有什么任务/DDL" → view_tasks 或 list_big_tasks
- "X和Y冲突吗" → check_conflicts
- "完成了X" → complete_task 或 complete_big_task"""
    return prompt


def _build_deep_planning_system_prompt(profile_section):
    local_now = datetime.now().astimezone()
    tz_name = local_now.tzinfo
    if tz_name is None:
        tz_str = "UTC+8"
    else:
        tz_str = str(tz_name)
    today = local_now.strftime("%Y-%m-%d")
    weekday_names = ["日", "一", "二", "三", "四", "五", "六"]
    date_info = f"今天是 {today}（周{weekday_names[local_now.weekday()]}）。用户本地时间，时区: {tz_str}。"

    prompt = f"""你是 Mosa 的【深度规划模式】—— 战略人生顾问。

【当前日期】{date_info}
{('\\n【用户背景】\\n' + profile_section) if profile_section else ''}

【核心身份】
你不是普通的日程管理助手。你是一个有耐心的战略顾问，帮助用户思考5-10年维度的长期方向。

【最重要的原则：慢热与先问后答】

你的工作方式是**咨询式的**，不是报告生成器。真正的战略规划需要先充分了解一个人，再给出判断。

🔑 **阶段一：信息收集（前3-5轮对话）**
- 用户打招呼/说模糊的话时，不要开始"分析"。先回应，然后问1-2个关键问题。
- 你需要了解的核心信息（按优先级）：
  1. 用户现在在做什么（学生？工作？什么领域？）
  2. 用户有没有一个模糊的方向或困惑
  3. 用户最在意的是什么（钱？自由？成就感？影响力？）
  4. 用户觉得目前最大的瓶颈是什么
- 每次回复只问1-2个问题，不要一次性问太多。让对话自然流动。
- 如果用户主动说了具体目标，可以跳过部分问题，但仍然要确认关键背景。

🔑 **阶段二：诊断与挑战（信息基本清楚后）**
- 在你开始任何"分析"之前，先用你自己的话复述一遍你对用户情况的理解
- 指出你看到的1-2个可能的认知盲区或矛盾点（这是你的价值所在）
- 问："我理解得对吗？还有我没覆盖到的重要方面吗？"

🔑 **阶段三：结构化分析（确认理解之后）**
- 只有在你对用户有了足够具体的了解后，才使用量化分析工具和框架
- 分析要有针对性，针对这个具体的人，而不是泛泛而谈

【对话风格】
- 像一个聪明的朋友在认真听你说话，而不是一个PPT机器
- 简洁。每条回复不超过4-5行。
- 可以用口语化的表达，不需要每句话都像论文
- 敢于说"我不确定，但我的直觉是..."——这比装作什么都知道更有价值

【核心原则】
1. **远见性思维**：引导用户思考更长期的影响
2. **客观理性**：不附和。如果想法有明显漏洞，直接指出
3. **量化分析**：在适当时机使用数据和量化方法（阶段三）
4. **挑战性提问**：提出用户可能忽视的问题

【禁止行为】
- ❌ 用户只是打个招呼你就开始"战略分析"
- ❌ 在不了解用户的情况下给具体建议
- ❌ 说"这个想法很好"之类的空话
- ❌ 进行日常日程安排（这不是你的职责范围）
- ❌ 使用过于学术化或晦涩的语言
- ❌ 一次输出超过6段长文——分多次对话逐步深入

【可用工具】（仅在阶段三、且确实需要时调用）
- value_monetization: 价值货币化评估
- roi_calculator: 投资回报率计算
- milestone_planner: 里程碑规划
- swot_analysis: SWOT分析
- decision_matrix: 决策矩阵分析
- view_schedule: 查看用户当前日程（只读）

记住：好的顾问70%的时间在提问和倾听，30%的时间在给出见解。"""
    return prompt


def _get_fallback_response(error_msg, last_user_message):
    if "1302" in error_msg or "速率限制" in error_msg or "429" in error_msg:
        return {"content": "请求过于频繁，请稍等几秒再试。", "proposal": None}
    if "看看" in last_user_message or "查看" in last_user_message or "schedule" in last_user_message:
        return {"content": "啧，网断了。不过我记得你这周排挺满的，自己翻翻日历看？", "proposal": None}
    if "累" in last_user_message or "忙" in last_user_message:
        return {"content": "网络连接失败，请检查网络后重试。", "proposal": None}
    if "删除" in last_user_message or "删掉" in last_user_message:
        return {"content": "网络连接失败，请检查网络后重试。", "proposal": None}
    return {"content": f"哎呀，网络出问题了（{error_msg}）。这破网老掉链子...过会儿再试试？", "proposal": None}


async def _call_ai_api(messages, tools, model_name, max_tokens, temperature=None,
                       retry_count=0, depth=0, max_retries=3, retry_delay=1.0,
                       _parent_modified=False, _parent_write_error=False,
                       _pending_proposal=None):
    api_key = _get_current_api_key()
    api_url = _get_current_api_url()

    if not api_key or api_key.startswith("YOUR_"):
        logger.error("[API] ERROR: API key not configured!")
        return {"content": "AI服务未配置，请在config.json中设置有效的API密钥。", "proposal": _pending_proposal, "shouldRefresh": False}

    await _api_rate_limiter.acquire()

    MAX_DEPTH = 10
    if depth > MAX_DEPTH:
        logger.error("[API] Maximum tool call depth exceeded")
        return {"content": "工具调用轮次过多，请简化您的请求。", "proposal": _pending_proposal, "shouldRefresh": False}

    is_reasoner = _is_reasoner_model(model_name)
    req_body = {
        "model": model_name,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "max_tokens": max_tokens,
    }
    if not is_reasoner and temperature is not None:
        req_body["temperature"] = temperature

    # Qwen extra_body
    if app_config.agent_provider == "qwen":
        use_thinking = _needs_reasoning(messages[-1].get("content", "") if messages else "")
        req_body["extra_body"] = {"enable_thinking": use_thinking}

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    verify_ssl = REJECT_UNAUTHORIZED if REJECT_UNAUTHORIZED is not None else True

    try:
        async with httpx.AsyncClient(timeout=HTTP_CLIENT_TIMEOUT, verify=verify_ssl) as client:
            response = await client.post(api_url, json=req_body, headers=headers)
    except (httpx.ConnectError, httpx.RemoteProtocolError, httpx.ReadError,
            httpx.ConnectTimeout, httpx.ReadTimeout) as e:
        error_str = str(e)
        logger.error("[API] Network error: %s", error_str)
        if retry_count < max_retries:
            base_delay = 1.0
            delay = base_delay * (2 ** retry_count) + random.uniform(0, base_delay)
            await asyncio.sleep(delay)
            return await _call_ai_api(messages, tools, model_name, max_tokens, temperature,
                                      retry_count + 1, depth, max_retries, retry_delay,
                                      _parent_modified=_parent_modified,
                                      _parent_write_error=_parent_write_error,
                                      _pending_proposal=_pending_proposal)
        return {"content": None, "proposal": _pending_proposal, "shouldRefresh": _parent_modified,
                "_error": _get_fallback_response(error_str, messages[-1].get("content", "") if messages else "")}

    if response.status_code in (500, 502, 503, 504, 429):
        logger.error("[API] HTTP %d error", response.status_code)
        if retry_count < max_retries:
            base_delay = 1.0
            delay = base_delay * (2 ** retry_count) + random.uniform(0, base_delay)
            if response.status_code == 429:
                retry_after = response.headers.get('Retry-After')
                if retry_after:
                    try:
                        delay = int(retry_after)
                    except ValueError:
                        delay = max(delay, 5)
            await asyncio.sleep(delay)
            return await _call_ai_api(messages, tools, model_name, max_tokens, temperature,
                                      retry_count + 1, depth, max_retries, retry_delay,
                                      _parent_modified=_parent_modified,
                                      _parent_write_error=_parent_write_error,
                                      _pending_proposal=_pending_proposal)
        return {"content": None, "proposal": _pending_proposal, "shouldRefresh": _parent_modified,
                "_error": _get_fallback_response(f"HTTP {response.status_code}",
                                                 messages[-1].get("content", "") if messages else "")}

    if response.status_code != 200:
        logger.error("[API] HTTP %d: %s", response.status_code, response.text[:500])
        error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
        if retry_count < max_retries:
            base_delay = 1.0
            delay = base_delay * (2 ** retry_count) + random.uniform(0, base_delay)
            await asyncio.sleep(delay)
            return await _call_ai_api(messages, tools, model_name, max_tokens, temperature,
                                      retry_count + 1, depth, max_retries, retry_delay,
                                      _parent_modified=_parent_modified,
                                      _parent_write_error=_parent_write_error,
                                      _pending_proposal=_pending_proposal)
        return {"content": None, "proposal": _pending_proposal, "shouldRefresh": _parent_modified,
                "_error": _get_fallback_response(error_msg,
                                                 messages[-1].get("content", "") if messages else "")}

    try:
        result = response.json()
    except ValueError:
        return {"content": None, "proposal": _pending_proposal, "shouldRefresh": False,
                "_error": _get_fallback_response("Invalid JSON response",
                                                 messages[-1].get("content", "") if messages else "")}

    choice = result.get("choices", [{}])[0]
    message = choice.get("message", {})
    tool_calls = message.get("tool_calls") or []

    logger.info("[AI] Response - tool_calls:%d, finish_reason:%s",
                len(tool_calls), choice.get("finish_reason"))

    has_data_modification = False
    all_tools_succeeded = True
    if tool_calls:
        schedule_data = _read_schedule_data()
        tool_results_list = []
        has_data_modification = False
        all_tools_succeeded = True
        write_error = _parent_write_error

        for tc in tool_calls:
            try:
                tool_result_str = execute_tool_call(tc, schedule_data)
                try:
                    result_obj = json.loads(tool_result_str)
                    if result_obj.get("shouldRefresh") and result_obj.get("success") is not False and "error" not in result_obj:
                        has_data_modification = True
                        logger.info("[AI] Tool %s set has_data_modification=True", tc.get("function", {}).get("name", "unknown"))
                except (json.JSONDecodeError, TypeError):
                    pass
                tool_results_list.append({
                    "toolCallId": tc.get("id", ""),
                    "result": tool_result_str,
                })
                logger.info("[AI] Tool executed: %s", tc.get("function", {}).get("name", "unknown"))
            except Exception as e:
                logger.error("[AI] Tool execution error: %s", e)
                all_tools_succeeded = False
                tool_results_list.append({
                    "toolCallId": tc.get("id", ""),
                    "result": json.dumps({"error": str(e)}, ensure_ascii=False),
                })

        pending_proposal = _pending_proposal
        for tr in tool_results_list:
            try:
                tr_obj = json.loads(tr["result"])
                if tr_obj.get("proposal"):
                    pending_proposal = tr_obj["proposal"]
                    break
            except (json.JSONDecodeError, TypeError):
                pass

        if has_data_modification and all_tools_succeeded:
            try:
                _write_schedule_data(schedule_data)
                logger.info("[AI] Schedule data written after all tools succeeded")
            except OSError as e:
                logger.error("[AI] Schedule data write failed: %s", e)
                has_data_modification = False
                write_error = True

        assistant_msg = {
            "role": "assistant",
            "content": message.get("content") or "",
            "tool_calls": tool_calls,
        }
        if message.get("reasoning_content") and is_reasoner:
            assistant_msg["reasoning_content"] = message["reasoning_content"]

        new_messages = list(messages) + [assistant_msg]
        for tr in tool_results_list:
            new_messages.append({
                "role": "tool",
                "tool_call_id": tr["toolCallId"],
                "content": tr["result"],
            })

        logger.info("[AI] Making follow-up call with tool results, depth: %d", depth + 1)
        follow_up = await _call_ai_api(new_messages, tools, model_name, max_tokens, temperature,
                                       retry_count, depth + 1, max_retries, retry_delay,
                                       _parent_modified=has_data_modification or _parent_modified,
                                       _parent_write_error=write_error or _parent_write_error,
                                       _pending_proposal=pending_proposal)
        follow_up["shouldRefresh"] = has_data_modification or follow_up.get("shouldRefresh", False)
        return follow_up

    content = message.get("content") or "我没听懂，再说一遍？"
    return {"content": content, "proposal": _pending_proposal, "shouldRefresh": _parent_modified or has_data_modification}


async def _call_ai_api_stream(messages, tools, model_name, max_tokens, temperature=None,
                               retry_count=0, depth=0, max_retries=3, retry_delay=1.0,
                               _parent_modified=False, _parent_write_error=False,
                               _pending_proposal=None):
    api_key = _get_current_api_key()
    api_url = _get_current_api_url()

    if not api_key or api_key.startswith("YOUR_"):
        yield _sse_event("content", "AI服务未配置，请在config.json中设置有效的API密钥。")
        yield _sse_done()
        return

    await _api_rate_limiter.acquire()

    MAX_DEPTH = 10
    if depth > MAX_DEPTH:
        yield _sse_event("content", "工具调用轮次过多，请简化您的请求。")
        yield _sse_done()
        return

    is_reasoner = _is_reasoner_model(model_name)
    req_body = {
        "model": model_name,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "max_tokens": max_tokens,
        "stream": True,
    }
    if not is_reasoner and temperature is not None:
        req_body["temperature"] = temperature

    if app_config.agent_provider == "qwen":
        use_thinking = _needs_reasoning(messages[-1].get("content", "") if messages else "")
        req_body["extra_body"] = {"enable_thinking": use_thinking}

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    verify_ssl = REJECT_UNAUTHORIZED if REJECT_UNAUTHORIZED is not None else True

    try:
        async with httpx.AsyncClient(timeout=HTTP_CLIENT_TIMEOUT, verify=verify_ssl) as client:
            yield _sse_status("thinking")

            accumulated = {
                "content": "",
                "reasoning_content": "",
                "tool_calls": [],
            }

            async with client.stream("POST", api_url, json=req_body, headers=headers) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    error_text = body.decode("utf-8", errors="replace")[:500]
                    logger.error("[API Stream] HTTP %d: %s", response.status_code, error_text)
                    if retry_count < max_retries:
                        yield _sse_event("retry", "")
                        base_delay = 1.0
                        delay = base_delay * (2 ** retry_count) + random.uniform(0, base_delay)
                        await asyncio.sleep(delay)
                        async for ev in _call_ai_api_stream(messages, tools, model_name, max_tokens,
                                                            temperature, retry_count + 1, depth,
                                                            max_retries, retry_delay,
                                                            _parent_modified=_parent_modified,
                                                            _parent_write_error=_parent_write_error,
                                                            _pending_proposal=_pending_proposal):
                            yield ev
                        return
                    if _parent_modified:
                        logger.info("[AI Stream] HTTP error but _parent_modified=True, sending shouldRefresh")
                        result_ev = {"shouldRefresh": True}
                        if _pending_proposal:
                            result_ev["proposal"] = _pending_proposal
                        yield _sse_event("result", result_ev)
                    yield _sse_event("content", f"API请求失败 (HTTP {response.status_code})")
                    yield _sse_done()
                    return

                buffer = ""
                async for chunk in response.aiter_bytes():
                    buffer += chunk.decode("utf-8", errors="replace")
                    lines = buffer.split("\n")
                    buffer = lines.pop()

                    for line in lines:
                        line = line.strip()
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            continue
                        try:
                            parsed = json.loads(data)
                            delta = parsed.get("choices", [{}])[0].get("delta", {})
                            if delta.get("content"):
                                current_content = accumulated.get("content", "")
                                if len(current_content) < 50000:
                                    accumulated["content"] = current_content + delta["content"]
                                yield _sse_event("content", delta["content"])
                            if delta.get("reasoning_content"):
                                accumulated["reasoning_content"] += delta["reasoning_content"]
                                yield _sse_event("reasoning", delta["reasoning_content"])
                            if delta.get("tool_calls"):
                                for tc in delta["tool_calls"]:
                                    idx = tc.get("index", 0)
                                    while len(accumulated["tool_calls"]) <= idx:
                                        accumulated["tool_calls"].append({
                                            "id": "",
                                            "type": "function",
                                            "function": {"name": "", "arguments": ""},
                                        })
                                    if tc.get("id"):
                                        accumulated["tool_calls"][idx]["id"] = tc["id"]
                                    if tc.get("function", {}).get("name"):
                                        accumulated["tool_calls"][idx]["function"]["name"] = tc["function"]["name"]
                                    if tc.get("function", {}).get("arguments"):
                                        accumulated["tool_calls"][idx]["function"]["arguments"] += tc["function"]["arguments"]
                        except json.JSONDecodeError:
                            pass

        has_data_modification = False
        all_tools_succeeded = True
        write_error = _parent_write_error
        tool_calls = [tc for tc in accumulated["tool_calls"] if tc.get("id")]
        if tool_calls:
            yield _sse_status("executing_tools", len(tool_calls))
            schedule_data = _read_schedule_data()
            tool_results_list = []

            for tc in tool_calls:
                try:
                    tool_result_str = execute_tool_call(tc, schedule_data)
                    try:
                        result_obj = json.loads(tool_result_str)
                        if result_obj.get("shouldRefresh") and result_obj.get("success") is not False and "error" not in result_obj:
                            has_data_modification = True
                            logger.info("[AI Stream] Tool %s set has_data_modification=True", tc.get("function", {}).get("name", "unknown"))
                    except (json.JSONDecodeError, TypeError):
                        pass
                    tool_results_list.append({
                        "toolCallId": tc.get("id", ""),
                        "result": tool_result_str,
                    })
                except Exception as e:
                    all_tools_succeeded = False
                    tool_results_list.append({
                        "toolCallId": tc.get("id", ""),
                        "result": json.dumps({"error": str(e)}, ensure_ascii=False),
                    })

            pending_proposal = _pending_proposal
            for tr in tool_results_list:
                try:
                    tr_obj = json.loads(tr["result"])
                    if tr_obj.get("proposal"):
                        pending_proposal = tr_obj["proposal"]
                        break
                except (json.JSONDecodeError, TypeError):
                    pass

            if has_data_modification and all_tools_succeeded:
                try:
                    _write_schedule_data(schedule_data)
                    logger.info("[AI Stream] Schedule data written after all tools succeeded")
                except OSError as e:
                    logger.error("[AI Stream] Schedule data write failed: %s", e)
                    has_data_modification = False
                    write_error = True

            assistant_msg = {
                "role": "assistant",
                "content": accumulated["content"],
                "tool_calls": tool_calls,
            }
            if accumulated["reasoning_content"] and is_reasoner:
                assistant_msg["reasoning_content"] = accumulated["reasoning_content"]

            new_messages = list(messages) + [assistant_msg]
            for tr in tool_results_list:
                new_messages.append({
                    "role": "tool",
                    "tool_call_id": tr["toolCallId"],
                    "content": tr["result"],
                })

            logger.info("[AI Stream] Making follow-up call with tool results, depth: %d", depth + 1)
            async for ev in _call_ai_api_stream(new_messages, tools, model_name, max_tokens,
                                                temperature, retry_count, depth + 1,
                                                max_retries, retry_delay,
                                                _parent_modified=has_data_modification or _parent_modified,
                                                _parent_write_error=write_error or _parent_write_error,
                                                _pending_proposal=pending_proposal):
                yield ev
            return

        total_modified = has_data_modification or _parent_modified
        result_data = {"shouldRefresh": total_modified}
        if _pending_proposal:
            result_data["proposal"] = _pending_proposal
        if write_error or _parent_write_error:
            result_data["writeError"] = True
        logger.info("[AI Stream] Sending result: shouldRefresh=%s, writeError=%s", total_modified, result_data.get("writeError", False))
        yield _sse_event("result", result_data)
        yield _sse_done()

    except (httpx.ConnectError, httpx.RemoteProtocolError, httpx.ReadError,
            httpx.ConnectTimeout, httpx.ReadTimeout) as e:
        error_str = str(e)
        logger.error("[API Stream] Network error: %s", error_str)
        if retry_count < max_retries:
            yield _sse_event("retry", "")
            base_delay = 1.0
            delay = base_delay * (2 ** retry_count) + random.uniform(0, base_delay)
            await asyncio.sleep(delay)
            async for ev in _call_ai_api_stream(messages, tools, model_name, max_tokens,
                                                temperature, retry_count + 1, depth,
                                                max_retries, retry_delay,
                                                _parent_modified=_parent_modified,
                                                _parent_write_error=_parent_write_error,
                                                _pending_proposal=_pending_proposal):
                yield ev
            return
        if _parent_modified:
            logger.info("[AI Stream] Network error but _parent_modified=True, sending shouldRefresh")
            result_ev = {"shouldRefresh": True}
            if _pending_proposal:
                result_ev["proposal"] = _pending_proposal
            yield _sse_event("result", result_ev)
        yield _sse_event("content", "网络连接失败，请检查网络后重试。")
        yield _sse_done()


def _sse_event(event_type, content=None):
    if event_type == "status":
        phase = content if isinstance(content, str) else content.get("phase", "thinking")
        count = content.get("count") if isinstance(content, dict) else None
        data = {"type": "status", "phase": phase}
        if count is not None:
            data["count"] = count
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    elif event_type == "content":
        return f"data: {json.dumps({'type': 'content', 'content': content}, ensure_ascii=False)}\n\n"
    elif event_type == "reasoning":
        return f"data: {json.dumps({'type': 'reasoning', 'content': content}, ensure_ascii=False)}\n\n"
    elif event_type == "retry":
        return f"data: {json.dumps({'type': 'retry'}, ensure_ascii=False)}\n\n"
    elif event_type == "result":
        data = {"type": "result"}
        if isinstance(content, dict):
            data.update(content)
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    return ""


def _sse_status(phase, count=None):
    data = {"type": "status", "phase": phase}
    if count is not None:
        data["count"] = count
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _sse_done():
    return "data: [DONE]\n\n"


async def _handle_agent_chat(data):
    message = data.get("message", "")
    images = data.get("images") or []
    history = data.get("history") or []
    profile = data.get("profile") or {}
    user_profile_text = data.get("userProfileText", "")

    profile_section = ""
    if user_profile_text and user_profile_text.strip():
        profile_section = f"\n\n【用户画像】\n{user_profile_text.strip()}"

    system_prompt = _build_system_prompt(profile_section)

    messages = [{"role": "system", "content": system_prompt}]

    recent_history = (history or [])[-10:]
    for msg in recent_history:
        if not msg.get("proposal"):
            entry = {
                "role": msg.get("role", "user"),
                "content": msg.get("content", ""),
            }
            if msg.get("reasoning_content"):
                entry["reasoning_content"] = msg["reasoning_content"]
            if msg.get("tool_calls"):
                entry["tool_calls"] = msg["tool_calls"]
            if msg.get("tool_call_id"):
                entry["tool_call_id"] = msg["tool_call_id"]
            if msg.get("name"):
                entry["name"] = msg["name"]
            messages.append(entry)

    if images and len(images) > 0:
        user_message = message or ""
        user_message = (user_message + "\n\n" if user_message else "") + f"[用户上传了 {len(images)} 张图片，但当前AI不支持图片分析]"
        if user_message:
            messages.append({"role": "user", "content": user_message})
    elif message:
        messages.append({"role": "user", "content": message})

    use_reasoner = _needs_reasoning(message)
    selected_model = app_config.deepseek_reasoner_model if use_reasoner else _get_current_model_name()
    logger.info("[AI] Intent detection: reasoning=%s, model=%s", use_reasoner, selected_model)

    try:
        response = await _call_ai_api(
            messages=messages,
            tools=AI_TOOLS,
            model_name=selected_model,
            max_tokens=16000 if "reasoner" in selected_model.lower() else 2000,
            temperature=None if "reasoner" in selected_model.lower() else 0.8,
        )
        error_info = response.pop("_error", None)
        if error_info and response.get("content") is None:
            return {
                "response": {"content": error_info["content"], "proposal": error_info["proposal"]},
                "updatedProfile": _extract_profile_info(error_info.get("content", ""), profile),
                "shouldRefresh": False,
            }

        return {
            "response": {"content": response["content"], "proposal": response.get("proposal")},
            "updatedProfile": _extract_profile_info(response.get("content", ""), profile),
            "shouldRefresh": response.get("shouldRefresh", False),
        }
    except Exception as e:
        logger.error("[AI] Agent chat error: %s", e)
        return {
            "response": {"content": "哎呀，我的脑子卡住了。换个话题？", "proposal": None},
            "shouldRefresh": False,
        }


async def _handle_agent_chat_stream(data):
    message = data.get("message", "")
    images = data.get("images") or []
    history = data.get("history") or []
    user_profile_text = data.get("userProfileText", "")

    profile_section = ""
    if user_profile_text and user_profile_text.strip():
        profile_section = f"\n\n【用户画像】\n{user_profile_text.strip()}"

    system_prompt = _build_system_prompt(profile_section)

    messages = [{"role": "system", "content": system_prompt}]

    recent_history = (history or [])[-10:]
    for msg in recent_history:
        if not msg.get("proposal"):
            entry = {
                "role": msg.get("role", "user"),
                "content": msg.get("content", ""),
            }
            if msg.get("reasoning_content"):
                entry["reasoning_content"] = msg["reasoning_content"]
            if msg.get("tool_calls"):
                entry["tool_calls"] = msg["tool_calls"]
            if msg.get("tool_call_id"):
                entry["tool_call_id"] = msg["tool_call_id"]
            if msg.get("name"):
                entry["name"] = msg["name"]
            messages.append(entry)

    if images and len(images) > 0:
        user_message = message or ""
        user_message = (user_message + "\n\n" if user_message else "") + f"[用户上传了 {len(images)} 张图片，但当前AI不支持图片分析]"
        if user_message:
            messages.append({"role": "user", "content": user_message})
    elif message:
        messages.append({"role": "user", "content": message})

    use_reasoner = _needs_reasoning(message)
    selected_model = app_config.deepseek_reasoner_model if use_reasoner else _get_current_model_name()
    logger.info("[AI Stream] Intent detection: reasoning=%s, model=%s", use_reasoner, selected_model)

    async def _generate():
        try:
            async for sse in _call_ai_api_stream(
                messages=messages,
                tools=AI_TOOLS,
                model_name=selected_model,
                max_tokens=16000 if "reasoner" in selected_model.lower() else 4000,
                temperature=None if "reasoner" in selected_model.lower() else 0.7,
            ):
                yield sse
        except Exception as e:
            logger.error("[AI Stream] Error: %s", e)
            yield _sse_event("content", "哎呀，我的脑子卡住了。换个话题？")
            yield _sse_done()

    return _generate()


async def _handle_deep_planning_chat(data):
    message = data.get("message", "")
    history = data.get("history") or []
    profile = data.get("profile") or {}
    user_profile_text = data.get("userProfileText", "")

    profile_section = ""
    if user_profile_text and user_profile_text.strip():
        profile_section = user_profile_text.strip()

    system_prompt = _build_deep_planning_system_prompt(profile_section)

    messages = [
        {"role": "system", "content": DEEP_PLANNING_SYSTEM_PROMPT},
        {"role": "system", "content": system_prompt}
    ]

    recent_history = (history or [])[-15:]
    for msg in recent_history:
        if not msg.get("proposal"):
            messages.append({
                "role": msg["role"] if msg.get("role") == "user" else "assistant",
                "content": msg.get("content", ""),
            })

    if message:
        messages.append({"role": "user", "content": message})

    filtered_tools = [t for t in AI_TOOLS if t["function"]["name"] in DEEP_PLANNING_TOOL_WHITELIST]
    logger.info("[Deep Planning] Filtered tools: %d/%d, using model: %s",
                len(filtered_tools), len(AI_TOOLS), app_config.deepseek_reasoner_model)

    try:
        response = await _call_ai_api(
            messages=messages,
            tools=filtered_tools,
            model_name=app_config.deepseek_reasoner_model,
            max_tokens=16000,
            temperature=None,
        )
        error_info = response.pop("_error", None)
        if error_info and response.get("content") is None:
            return {
                "response": {"content": error_info["content"], "proposal": error_info["proposal"]},
                "updatedProfile": _extract_profile_info(error_info.get("content", ""), profile),
                "shouldRefresh": False,
            }

        return {
            "response": {"content": response["content"], "proposal": response.get("proposal")},
            "updatedProfile": _extract_profile_info(response.get("content", ""), profile),
            "shouldRefresh": response.get("shouldRefresh", False),
        }
    except Exception as e:
        logger.error("[Deep Planning] Error: %s", e)
        return {
            "response": {"content": "抱歉，深度规划模块遇到了问题。请稍后重试。", "proposal": None},
            "shouldRefresh": False,
        }


def _extract_profile_info(content, current_profile):
    updated = dict(current_profile or {})
    if "哈哈" in content or "\ud83d\ude02" in content or "笑死" in content:
        updated["communicationStyle"] = "humorous"
    return updated


def _extract_deep_planning_profile(conversation):
    profile_extract = {
        "longTermGoals": [],
        "values": [],
        "strengths": [],
        "constraints": [],
    }

    goal_patterns = [
        re.compile(r"(?:想|希望|计划|立志|目标|愿景)[\s\S]{0,50}?成为?([\u4e00-\u9fa5，。、！？；：""''（）【】\\w]{2,30})"),
        re.compile(r"(?:未来[\d\-到至年]+|[\d]+年内?|长期|长远)(?:[\s\S]{0,20}?(?:想|希望|要|打算|计划))([\u4e00-\u9fa5，。、！？；：""''（）【】\\w]{2,30})"),
    ]
    value_patterns = [
        re.compile(r"(?:重视|看重|在乎|坚持|认为.*重要|珍视|注重|相信)([\u4e00-\u9fa5，。、！？；：""''（）【】\\w]{2,25})"),
    ]
    strength_patterns = [
        re.compile(r"(?:擅长|强项|优势|能力|经验丰富|熟练|精通|拿手)([\u4e00-\u9fa5，。、！？；：""''（）【】\\w]{2,25})"),
    ]
    constraint_patterns = [
        re.compile(r"(?:限制|困难|缺乏|没有|不足|担心|顾虑|问题|挑战|障碍|缺|不够|无法)([\u4e00-\u9fa5，。、！？；：""''（）【】\\w]{2,25})"),
    ]

    seen_goals = set()
    seen_values = set()
    seen_strengths = set()
    seen_constraints = set()

    for pat in goal_patterns:
        for m in pat.finditer(conversation):
            g = (m.group(1) or "").strip()
            if g and len(g) > 3 and g not in seen_goals:
                seen_goals.add(g)
                profile_extract["longTermGoals"].append({"content": g, "confidence": 0.85, "source": "deep_planning"})

    for pat in value_patterns:
        for m in pat.finditer(conversation):
            v = (m.group(1) or "").strip()
            if v and len(v) > 1 and v not in seen_values:
                seen_values.add(v)
                profile_extract["values"].append({"content": v, "confidence": 0.75, "source": "deep_planning"})

    for pat in strength_patterns:
        for m in pat.finditer(conversation):
            s = (m.group(1) or "").strip()
            if s and len(s) > 1 and s not in seen_strengths:
                seen_strengths.add(s)
                profile_extract["strengths"].append({"content": s, "confidence": 0.8, "source": "deep_planning"})

    for pat in constraint_patterns:
        for m in pat.finditer(conversation):
            c = (m.group(1) or "").strip()
            if c and len(c) > 1 and c not in seen_constraints:
                seen_constraints.add(c)
                profile_extract["constraints"].append({"content": c, "confidence": 0.78, "source": "deep_planning"})

    return profile_extract


def _approve_schedule_proposal(proposal):
    schedule_file = paths.get_data_file_path()
    try:
        if not os.path.exists(schedule_file):
            with open(schedule_file, "w", encoding="utf-8") as f:
                json.dump({"startDate": "", "endDate": "", "schedules": {}}, f, ensure_ascii=False)

        with open(schedule_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        proposal_type = proposal.get("type")

        if proposal_type == "batch_delete_schedule":
            dates = proposal.get("dates") or []
            deleted_count = 0
            deleted_slots_count = 0
            deleted_tasks_count = 0
            for date in dates:
                sch = (data.get("schedules") or {}).get(date)
                if sch:
                    deleted_slots_count += len(sch.get("timeSlots") or [])
                    deleted_tasks_count += len(sch.get("tasks") or [])
                    del data["schedules"][date]
                    deleted_count += 1
            _write_schedule_data(data)
            return {
                "success": True,
                "message": f"已批量删除 {deleted_count} 个日期的安排",
                "deletedCount": deleted_count,
                "deletedSlotsCount": deleted_slots_count,
                "deletedTasksCount": deleted_tasks_count,
            }

        if proposal_type == "update_task":
            date = proposal.get("date")
            old_name = proposal.get("oldTaskName")
            new_name = proposal.get("newTaskName")
            new_est = proposal.get("newEstimatedMinutes")
            sch = (data.get("schedules") or {}).get(date)
            if not sch or not sch.get("tasks"):
                return {"success": False, "message": "任务不存在"}
            task = next((t for t in sch["tasks"] if t["name"] == old_name), None)
            if not task:
                return {"success": False, "message": "任务不存在"}
            task["name"] = new_name
            task["estimated"] = str(new_est)
            _write_schedule_data(data)
            return {"success": True, "message": f"任务已更新: {old_name} -> {new_name}"}

        if proposal_type == "delete_task":
            date = proposal.get("date")
            task_name = proposal.get("taskName")
            sch = (data.get("schedules") or {}).get(date)
            if not sch or not sch.get("tasks"):
                return {"success": False, "message": "任务不存在"}
            initial_len = len(sch["tasks"])
            sch["tasks"] = [t for t in sch["tasks"] if t["name"] != task_name]
            if len(sch["tasks"]) == initial_len:
                return {"success": False, "message": "任务不存在"}
            _write_schedule_data(data)
            return {"success": True, "message": f"任务已删除: {task_name}"}

        if proposal_type == "batch_delete_tasks":
            tasks = proposal.get("tasks") or []
            deleted = 0
            for ti in tasks:
                sch = (data.get("schedules") or {}).get(ti.get("date"))
                if sch and sch.get("tasks"):
                    before = len(sch["tasks"])
                    sch["tasks"] = [t for t in sch["tasks"] if t["name"] != ti.get("task_name")]
                    deleted += before - len(sch["tasks"])
            _write_schedule_data(data)
            return {"success": True, "message": f"已批量删除 {deleted} 个任务", "deletedCount": deleted}

        if proposal_type == "update_big_task":
            old_name = proposal.get("oldTaskName")
            new_name = proposal.get("newTaskName")
            new_est = proposal.get("newEstimatedMinutes")
            new_ddl = proposal.get("newDdl")
            if not data.get("bigTasks"):
                return {"success": False, "message": "大任务不存在"}
            task = next((t for t in data["bigTasks"] if t["name"] == old_name), None)
            if not task:
                return {"success": False, "message": "大任务不存在"}
            task["name"] = new_name
            task["estimated"] = new_est
            task["ddl"] = new_ddl
            _write_schedule_data(data)
            return {"success": True, "message": f"大任务已更新: {old_name} -> {new_name}"}

        if proposal_type == "delete_big_task":
            task_name = proposal.get("taskName")
            if not data.get("bigTasks"):
                return {"success": False, "message": "大任务不存在"}
            initial_len = len(data["bigTasks"])
            data["bigTasks"] = [t for t in data["bigTasks"] if t["name"] != task_name]
            if len(data["bigTasks"]) == initial_len:
                return {"success": False, "message": "大任务不存在"}
            _write_schedule_data(data)
            return {"success": True, "message": f"大任务已删除: {task_name}"}

        if proposal_type == "batch_delete_big_tasks":
            names = proposal.get("taskNames") or []
            if not data.get("bigTasks"):
                return {"success": False, "message": "没有大任务"}
            before = len(data["bigTasks"])
            data["bigTasks"] = [t for t in data["bigTasks"] if t["name"] not in names]
            _write_schedule_data(data)
            return {"success": True, "message": f"已批量删除 {before - len(data['bigTasks'])} 个大任务"}

        # Generic schedule modification
        date = proposal.get("date")
        existing = (data.get("schedules") or {}).get(date, {
            "title": "", "highlights": "", "milestone": "", "timeSlots": [],
        })
        operation = proposal.get("operation", "modify")

        if operation == "delete_slots" and proposal.get("timeSlots"):
            slots_to_delete = proposal["timeSlots"]
            existing["timeSlots"] = [
                s for s in (existing.get("timeSlots") or [])
                if not any(
                    s.get("activity") == d or s.get("time") == d or d in (s.get("activity") or "")
                    for d in slots_to_delete
                )
            ]
            existing["highlights"] = f"已删除: {', '.join(slots_to_delete)}"
        elif operation == "modify_title":
            existing["title"] = proposal.get("title", "")
        elif operation == "add_slot" and proposal.get("newSlotDetails"):
            new_slot = proposal["newSlotDetails"]
            existing.setdefault("timeSlots", []).append({
                "time": new_slot.get("time", ""),
                "activity": new_slot.get("activity", ""),
                "detail": new_slot.get("detail", ""),
                "icon": new_slot.get("icon", "—"),
            })
            existing["timeSlots"].sort(key=lambda x: x["time"])
            existing["highlights"] = f"已添加: {new_slot.get('activity', '')}"
        elif operation in ("modify_slot", "update") and proposal.get("timeSlots") and proposal.get("newSlotDetails"):
            target = proposal["timeSlots"][0]
            new_slot = proposal["newSlotDetails"]

            has_new_activity = bool(new_slot.get("activity"))
            has_new_time = bool(new_slot.get("time"))
            has_new_detail = "detail" in new_slot and bool(new_slot.get("detail"))
            has_new_icon = "icon" in new_slot and bool(new_slot.get("icon"))

            if not (has_new_activity or has_new_time or has_new_detail or has_new_icon):
                logger.warning("[Approve] modify_slot/update with empty newSlotDetails: target=%s, date=%s", target, date)

            def _apply_changes(s):
                result = dict(s)
                if has_new_time:
                    result["time"] = new_slot["time"]
                if has_new_activity:
                    result["activity"] = new_slot["activity"]
                if has_new_detail:
                    result["detail"] = new_slot["detail"]
                if has_new_icon:
                    result["icon"] = new_slot["icon"]
                return result

            matched_any = False
            updated_slots = []
            for s in (existing.get("timeSlots") or []):
                if s.get("activity") == target or s.get("time") == target or target in (s.get("activity") or ""):
                    matched_any = True
                    updated_slots.append(_apply_changes(s))
                else:
                    updated_slots.append(s)

            if not matched_any:
                logger.warning("[Approve] modify_slot/update target not found: target=%s, date=%s, activities=%s",
                               target, date, [s.get("activity") for s in (existing.get("timeSlots") or [])])

            existing["timeSlots"] = updated_slots
            existing["highlights"] = f"已修改: {target} -> {new_slot.get('activity', target)}"

        elif operation == "replace_slot" and proposal.get("timeSlots") and proposal.get("newSlotDetails"):
            target = proposal["timeSlots"][0]
            new_slot_data = proposal["newSlotDetails"]

            new_time = new_slot_data.get("time", "")
            new_activity = new_slot_data.get("activity", "")
            if not new_time or not new_activity:
                logger.warning("[Approve] replace_slot missing time/activity: date=%s, target=%s", date, target)

            new_slot = {
                "time": new_time,
                "activity": new_activity,
                "detail": new_slot_data.get("detail", ""),
                "icon": new_slot_data.get("icon", ""),
            }

            matched_any = False
            updated_slots = []
            for s in (existing.get("timeSlots") or []):
                if s.get("activity") == target or s.get("time") == target or target in (s.get("activity") or ""):
                    matched_any = True
                    updated_slots.append(new_slot)
                else:
                    updated_slots.append(s)

            if not matched_any:
                logger.warning("[Approve] replace_slot target not found: target=%s, date=%s", target, date)

            existing["timeSlots"] = updated_slots
            existing["timeSlots"].sort(key=lambda x: x["time"])
            existing["highlights"] = f"已替换: {target} -> {new_activity}"
        else:
            if proposal.get("title"):
                existing["title"] = proposal["title"]
            if proposal.get("changes"):
                existing["highlights"] = "; ".join(proposal["changes"])

        data.setdefault("schedules", {})[date] = existing
        _write_schedule_data(data)
        return {"success": True, "message": "日程修改已应用"}

    except Exception as e:
        logger.error("[Approve] Error: %s", e)
        return {"success": False, "message": _safe_error_message(e)}


def _generate_react_log(messages, full=False):
    react_log = ""
    has_tool_calls = False
    question = ""
    step_count = 0

    thoughts_map = {
        "web_search_evaluate": "用户需要搜索相关信息，我将搜索相关资料来获取信息。",
        "view_schedule": "我需要先查看相关日期的日程安排，了解当前的时间占用情况。",
        "add_schedule": "根据分析结果，我将为用户安排新的日程时段。",
        "estimate_task_time": "在规划之前，我需要估算这个任务大概需要多长时间。",
        "manage_tasks": "我需要管理任务。",
        "manage_big_tasks": "我需要处理大任务。",
        "check_conflicts": "我需要检查是否存在日程冲突。",
        "modify_schedule": "我需要对日程进行调整。",
        "analyze": "我需要分析日程数据。",
        "manage_courses": "我需要管理课程信息。",
        "manage_templates": "我需要处理日程模板。",
        "value_monetization": "我正在评估用户目标的价值潜力。",
        "roi_calculator": "我正在计算投入回报率。",
        "milestone_planner": "我正在将长期目标拆解为里程碑。",
        "swot_analysis": "我正在对目标进行结构化SWOT分析。",
        "decision_matrix": "我正在构建多维度决策矩阵。",
    }

    for i, msg in enumerate(messages):
        if msg.get("role") == "user":
            if not question:
                question = msg.get("content", "")
                react_log += f"Question: {question}\n\n"

        if msg.get("role") == "assistant" and msg.get("tool_calls"):
            has_tool_calls = True
            for tc in msg["tool_calls"]:
                step_count += 1
                tool_name = (tc.get("function", {}) or {}).get("name", tc.get("name", "unknown"))
                args_str = (tc.get("function", {}) or {}).get("arguments", tc.get("arguments", "{}"))
                try:
                    args = json.loads(args_str) if isinstance(args_str, str) else args_str
                except (json.JSONDecodeError, TypeError):
                    args = {}

                thought = thoughts_map.get(tool_name, f"我需要使用 {tool_name} 工具来完成这个步骤。")

                react_log += f"Thought: {thought}\n"
                args_parts = []
                for k, v in args.items():
                    if isinstance(v, str):
                        args_parts.append(f'{k}="{v}"')
                    else:
                        args_parts.append(f"{k}={json.dumps(v, ensure_ascii=False)}")
                react_log += f"Action: {tool_name}({', '.join(args_parts)})\n"

                tc_id = tc.get("id", "")
                for j in range(i + 1, len(messages)):
                    if messages[j].get("role") == "tool" and messages[j].get("tool_call_id") == tc_id:
                        result = messages[j].get("content", "")
                        truncated = result if full else (result[:300] + "...(截断)" if len(result) > 300 else result)
                        react_log += f"Observation: {truncated}\n\n"
                        break

        if msg.get("role") == "assistant" and msg.get("content") and not msg.get("tool_calls"):
            if has_tool_calls:
                react_log += "Thought: 我已经获得了所需的信息，可以给出最终答案了。\n"
                react_log += f"Final Answer: {msg['content']}\n"
            elif not question:
                question = msg.get("content", "")
                react_log += f"Question: {question}\n"
                react_log += f"Final Answer: {msg['content']}\n"

    if not has_tool_calls and question:
        for i in range(len(messages) - 1, -1, -1):
            if messages[i].get("role") == "assistant" and messages[i].get("content"):
                react_log = f"Question: {question}\n\nFinal Answer: {messages[i]['content']}\n"
                break

    if full and react_log:
        now = datetime.now()
        pad = lambda n: str(n).zfill(2)
        dt = f"{now.year}-{pad(now.month)}-{pad(now.day)} {pad(now.hour)}:{pad(now.minute)}:{pad(now.second)}"
        sep = "=" * 40
        header = (
            f"{sep}\n"
            f"生成时间: {dt}\n"
            f"对话消息总数: {len(messages)}\n"
            f"格式: ReAct (Reasoning + Acting)\n"
            f"说明: 由 PlanMosaic AI Agent 自动生成，基于原生 OpenAI Function Calling 转录\n"
            f"{sep}\n\n"
        )
        react_log = header + react_log

    return react_log or "Question: (empty conversation)\n\nFinal Answer: (no response)"


# ===================== API Endpoints =====================


@app.post("/api/agent-chat")
async def agent_chat(request: Request):
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "无效的JSON"}, status_code=400)

    try:
        result = await _handle_agent_chat(data)
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"error": _safe_error_message(e)}, status_code=500)


@app.post("/api/agent-chat-stream")
async def agent_chat_stream(request: Request):
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "无效的JSON"}, status_code=400)

    async def _stream():
        async for event in await _handle_agent_chat_stream(data):
            yield event
            # Check if client disconnected
            if await request.is_disconnected():
                break

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.post("/api/deep-planning-chat")
async def deep_planning_chat(request: Request):
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "无效的JSON"}, status_code=400)

    result = await _handle_deep_planning_chat(data)
    return JSONResponse(result)


@app.post("/api/deep-planning-profile")
async def deep_planning_profile(request: Request):
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"success": True, "profileExtract": {
            "longTermGoals": [], "values": [], "strengths": [], "constraints": []
        }})

    conversation = data.get("conversation", "")
    profile_extract = _extract_deep_planning_profile(conversation)
    logger.info("[Deep Planning Profile] Extracted - Goals:%d, Values:%d, Strengths:%d, Constraints:%d",
                len(profile_extract["longTermGoals"]), len(profile_extract["values"]),
                len(profile_extract["strengths"]), len(profile_extract["constraints"]))
    return JSONResponse({"success": True, "profileExtract": profile_extract})


@app.get("/api/schedule-data")
async def get_schedule_data():
    data = _read_schedule_data()
    return JSONResponse(data)


@app.post("/api/save-schedule")
async def save_schedule(request: Request):
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "无效的JSON"}, status_code=400)

    try:
        _write_schedule_data(data)
        return JSONResponse({"success": True})
    except Exception as e:
        logger.error("[Save Schedule] Error: %s", e)
        return JSONResponse({"error": _safe_error_message(e)}, status_code=500)


@app.get("/api/agent-history")
async def get_agent_history():
    data = _read_agent_history()
    return JSONResponse(data)


@app.post("/api/agent-save")
async def save_agent_history(request: Request):
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "无效的JSON"}, status_code=400)

    try:
        history_data = {
            "userProfile": body.get("profile") or body.get("userProfile") or {},
            "conversations": body.get("conversations") or [],
            "archivedConversations": body.get("archivedConversations") or [],
            "lastUpdate": body.get("lastUpdate", ""),
        }
        compressed = _archive_and_compress(history_data)
        compressed["lastUpdate"] = datetime.now().isoformat()
        _write_agent_history(compressed)
        return JSONResponse({"success": True})
    except Exception as e:
        logger.error("[Agent Save] Error: %s", e)
        return JSONResponse({"error": _safe_error_message(e)}, status_code=500)


@app.post("/api/agent-approve")
async def agent_approve(request: Request):
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "无效的JSON"}, status_code=400)

    proposal = data.get("proposal") or data
    if not isinstance(proposal, dict) or not proposal.get("type"):
        return JSONResponse({"success": False, "message": "Invalid proposal: expected object with type"})

    try:
        result = _approve_schedule_proposal(proposal)
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"success": False, "message": _safe_error_message(e)})


@app.post("/api/generate-react-log")
async def generate_react_log(request: Request):
    query_params = dict(request.query_params)
    is_full = query_params.get("full") == "true"

    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "无效请求"}, status_code=400)

    messages = data.get("messages") or []
    react_log = _generate_react_log(messages, full=is_full)

    MAX_LOG_SIZE = 100 * 1024
    react_log_bytes = react_log.encode('utf-8')
    if len(react_log_bytes) > MAX_LOG_SIZE:
        truncated_bytes = react_log_bytes[:MAX_LOG_SIZE - 15]
        react_log = truncated_bytes.decode('utf-8', errors='ignore') + '...(truncated)'

    return JSONResponse({"success": True, "react_log": react_log})


@app.post("/api/test-connection")
async def test_connection():
    api_key = _get_current_api_key()
    api_url = _get_current_api_url()
    model_name = _get_current_model_name()

    if not api_key or api_key.startswith("YOUR_"):
        provider_name = "Qwen" if app_config.agent_provider == "qwen" else "DeepSeek"
        return JSONResponse({
            "success": False,
            "message": f"{provider_name} API Key 未配置，请在config.json中设置有效的API密钥。",
        })

    test_body = {
        "model": model_name,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 10,
        "stream": False,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    verify_ssl = REJECT_UNAUTHORIZED if REJECT_UNAUTHORIZED is not None else True

    try:
        async with httpx.AsyncClient(timeout=HTTP_CLIENT_TIMEOUT, verify=verify_ssl) as client:
            response = await client.post(api_url, json=test_body, headers=headers)

        if response.status_code == 200:
            return JSONResponse({
                "success": True,
                "message": f"连接成功！{app_config.agent_provider} API 密钥有效。模型：{model_name}",
            })
        elif response.status_code == 401:
            provider_name = "Qwen" if app_config.agent_provider == "qwen" else "DeepSeek"
            return JSONResponse({
                "success": False,
                "message": f"认证失败 (401)。请检查 {provider_name} API Key 是否正确配置。",
            })
        elif response.status_code == 429:
            return JSONResponse({
                "success": True,
                "message": "速率限制 (429)，但连接正常。",
            })
        else:
            return JSONResponse({
                "success": False,
                "message": f"API 返回异常状态码：{response.status_code}",
            })
    except Exception as e:
        return JSONResponse({
            "success": False,
            "message": f"连接失败：{str(e)}",
        })


@app.get("/api/config")
async def get_config():
    api_key = _get_current_api_key()
    return JSONResponse({
        "provider": app_config.agent_provider,
        "model": _get_current_model_name(),
        "reasonerModel": app_config.deepseek_reasoner_model,
        "port": PORT,
        "host": HOST,
        "hasApiKey": bool(api_key and not api_key.startswith("YOUR_")),
    })


@app.post("/api/config")
async def update_config(request: Request):
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "无效的JSON"}, status_code=400)

    config_path = paths.get_config_path()
    current_config = {}
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                current_config = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    if "api" in data:
        current_config.setdefault("api", {}).update(data["api"])
    if "agent" in data:
        current_config.setdefault("agent", {}).update(data["agent"])
    if "server" in data:
        current_config.setdefault("server", {}).update(data["server"])
    if "security" in data:
        current_config.setdefault("security", {}).update(data["security"])
    if "timeouts" in data:
        current_config.setdefault("timeouts", {}).update(data["timeouts"])

    try:
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(current_config, f, ensure_ascii=False, indent=2)
        app_config.load()
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/health")
async def health_check():
    return JSONResponse({"status": "ok"})


@app.get("/api/startup-scan")
async def startup_scan():
    schedule_data = _read_schedule_data()
    local_now = datetime.now().astimezone()
    if local_now.tzinfo is None:
        local_now = local_now.replace(tzinfo=timezone(timedelta(hours=8)))
    now = local_now
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    today_schedule = None
    if schedule_data.get("schedules") and schedule_data["schedules"].get(today):
        today_schedule = dict(schedule_data["schedules"][today])

    yesterday_incomplete_tasks = []
    if schedule_data.get("tasks") and schedule_data["tasks"].get(yesterday):
        for t in schedule_data["tasks"][yesterday]:
            if t.get("completed") is not True:
                yesterday_incomplete_tasks.append({
                    "name": t.get("name", ""),
                    "estimated": t.get("estimated_minutes", 0),
                    "type": "task",
                })
    if schedule_data.get("bigTasks"):
        for bt in schedule_data["bigTasks"]:
            if bt.get("completed"):
                continue
            task_type = bt.get("task_type", "")
            if task_type == "short":
                if bt.get("ddl") == yesterday:
                    yesterday_incomplete_tasks.append({
                        "name": bt.get("task_name", ""),
                        "estimated": bt.get("estimated_minutes", 0),
                        "type": "big_task",
                    })
            elif task_type == "long":
                start_date = bt.get("start_date", "")
                ddl = bt.get("ddl", "")
                if start_date and ddl and start_date <= yesterday <= ddl:
                    yesterday_incomplete_tasks.append({
                        "name": bt.get("task_name", ""),
                        "estimated": bt.get("estimated_minutes", 0),
                        "type": "big_task",
                    })

    return JSONResponse({
        "todaySchedule": today_schedule,
        "yesterdayIncompleteTasks": yesterday_incomplete_tasks,
        "today": today,
    })


@app.post("/api/agent-archive")
async def agent_archive():
    history = _read_agent_history()
    archived = _archive_and_compress(history)
    archived["lastUpdate"] = datetime.now().isoformat()
    _write_agent_history(archived)
    return JSONResponse({"success": True, "archived": archived})


@app.post("/api/agent-clear")
async def agent_clear():
    history = _read_agent_history()
    _write_agent_history({
        "userProfile": history.get("userProfile") or {},
        "conversations": [],
        "archivedConversations": history.get("archivedConversations") or [],
        "lastUpdate": datetime.now().isoformat(),
    })
    return JSONResponse({"success": True})


@app.get("/{file_path:path}")
async def serve_static(file_path: str, request: Request):
    if not file_path:
        file_path = "index.html"

    file_abs = os.path.join(SCRIPT_DIR, file_path)

    # Security: prevent path traversal
    real_path = os.path.realpath(file_abs)
    real_root = os.path.realpath(SCRIPT_DIR)
    if not real_path.startswith(real_root + os.sep) and real_path != real_root:
        return JSONResponse({"error": "禁止访问"}, status_code=403)

    if not os.path.exists(file_abs) or os.path.isdir(file_abs):
        file_abs = os.path.join(SCRIPT_DIR, "index.html")

    ext = os.path.splitext(file_abs)[1].lower()
    mime_type = _get_mime_type(ext)

    if not os.path.exists(file_abs):
        return JSONResponse({"error": f"文件未找到: /{file_path}"}, status_code=404)

    try:
        with open(file_abs, "rb") as f:
            content = f.read()
        headers = {"Cache-Control": "no-cache"}
        return Response(content=content, media_type=mime_type, headers=headers)
    except OSError:
        return JSONResponse({"error": "服务器错误"}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.server:app",
        host=HOST,
        port=PORT,
        log_level="info",
    )