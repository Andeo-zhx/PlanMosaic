import asyncio
import copy
import hmac
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
    PORT,
    HOST,
    REJECT_UNAUTHORIZED,
    API_TIMEOUT_MS,
    DEEP_PLANNING_SYSTEM_PROMPT,
)
from .config import config as app_config
from .data_guard import (
    build_config_patch,
    issue_proposal_token,
    merge_config_documents,
    normalize_config_document,
    normalize_history_data,
    normalize_proposal,
    normalize_schedule_data,
    now_iso,
    validate_config_document,
    validate_history_data,
    validate_schedule_data,
    verify_proposal_token,
    WRITE_LOCKS,
)
from .tools import AI_TOOLS
from .tool_executor import execute_tool_call, _create_backup, safe_json_stringify

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("planmosaic.server")

app = FastAPI(title="PlanMosaic Server")

LOCAL_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$"
CONTROL_TOKEN_PATTERN = re.compile(r"^[a-f0-9]{64}$", re.IGNORECASE)
MAX_REQUEST_BODY_BYTES = int(os.environ.get("PLANMOSAIC_MAX_REQUEST_BODY_BYTES", 20 * 1024 * 1024))
PROTECTED_WRITE_PATHS = {
    "/api/save-schedule",
    "/api/agent-save",
    "/api/agent-approve",
    "/api/config",
    "/api/agent-archive",
    "/api/agent-clear",
}

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
        allow_headers=["Authorization", "Content-Type", "X-Control-Token", "X-PlanMosaic-Internal-Config"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[],
        allow_origin_regex=LOCAL_ORIGIN_REGEX,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Control-Token", "X-PlanMosaic-Internal-Config"],
    )

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


def _load_control_token():
    env_token = (os.environ.get("PLANMOSAIC_CONTROL_TOKEN") or "").strip()
    if CONTROL_TOKEN_PATTERN.fullmatch(env_token):
        return env_token

    try:
        token_path = os.path.join(paths.get_app_data_root_dir(), "control-token.json")
        if not os.path.exists(token_path):
            return ""
        with open(token_path, "r", encoding="utf-8") as f:
            parsed = json.load(f)
        file_token = (parsed.get("token") or "").strip() if isinstance(parsed, dict) else ""
        if CONTROL_TOKEN_PATTERN.fullmatch(file_token):
            return file_token
    except Exception as e:
        logger.warning("Failed to load control token: %s", e)
    return ""


CONTROL_AUTH_TOKEN = _load_control_token()


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


def _read_json_file(path, default):
    if not os.path.exists(path):
        return copy.deepcopy(default)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _restore_json_from_backup(filename):
    backup_dir = paths.get_backup_dir()
    if not backup_dir or not os.path.exists(backup_dir):
        return None
    prefix = filename.split(".")[0] + "_"
    candidates = []
    for entry in os.listdir(backup_dir):
        if entry.startswith(prefix) and entry.endswith(".json"):
            full_path = os.path.join(backup_dir, entry)
            try:
                candidates.append((os.path.getmtime(full_path), full_path))
            except OSError:
                continue
    for _mtime, candidate_path in sorted(candidates, reverse=True):
        try:
            with open(candidate_path, "r", encoding="utf-8") as f:
                restored = json.load(f)
            logger.warning("Restored %s from backup: %s", filename, candidate_path)
            return restored
        except (OSError, json.JSONDecodeError):
            continue
    return None


def _write_json_file_atomic(path, document):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    content = _safe_json_stringify(document, indent=2)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)


def _proposal_for_client(proposal, schedule_version=None):
    if not proposal:
        return None
    try:
        normalized = normalize_proposal(proposal)
    except ValueError:
        return proposal
    if schedule_version is None:
        schedule_version = (_read_schedule_data().get("_meta") or {}).get("version", 0)
    client_proposal = dict(normalized)
    client_proposal["approvalToken"] = issue_proposal_token(normalized, base_version=schedule_version)
    client_proposal["baseVersion"] = schedule_version
    return client_proposal


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
    return app_config.deepseek_key


def _sanitize_history_for_api(messages):
    """清理历史消息，确保符合 OpenAI/DeepSeek tool_calls 结构约束。

    DeepSeek/OpenAI API 要求：
      - 消息序列不能以 `role: "tool"` 开头（没有前置 tool_calls）
      - 每个 `role: "tool"` 消息必须紧跟一个含匹配 tool_call_id 的 `assistant(tool_calls)` 消息
      - 序列末尾的 `assistant(tool_calls)` 若没有对应的 tool 响应也会被拒绝

    本函数做三件事：
      1. 收集所有 assistant 消息中的 tool_call_id，丢弃指向不存在 tool_call 的孤儿 tool 消息
      2. 丢弃开头的 tool 消息
      3. 丢弃末尾没有 tool 响应的 assistant(tool_calls) 消息
    """
    if not messages:
        return []

    # 收集已知的 tool_call_id
    valid_tool_call_ids = set()
    for msg in messages:
        if msg.get("role") == "assistant":
            for tc in (msg.get("tool_calls") or []):
                if isinstance(tc, dict) and tc.get("id"):
                    valid_tool_call_ids.add(tc["id"])

    # 第一遍：丢弃孤儿 tool 消息
    filtered = []
    for msg in messages:
        if msg.get("role") == "tool":
            tcid = msg.get("tool_call_id")
            if tcid and tcid in valid_tool_call_ids:
                filtered.append(msg)
            elif not tcid:
                # 没有 tool_call_id 的历史 tool 消息也保留（兼容旧数据）
                filtered.append(msg)
            # else: 孤儿 tool 消息，跳过
        else:
            filtered.append(msg)

    # 丢弃开头的 tool 消息
    while filtered and filtered[0].get("role") == "tool":
        filtered.pop(0)

    # 丢弃末尾没有 tool 响应的 assistant(tool_calls) 消息
    while filtered and filtered[-1].get("role") == "assistant" and filtered[-1].get("tool_calls"):
        filtered.pop()

    return filtered


def _get_current_api_url():
    return app_config.deepseek_base_url


def _get_current_model_name():
    return app_config.deepseek_model


def _extract_bearer_token(authorization_header):
    if not isinstance(authorization_header, str):
        return ""
    prefix = "Bearer "
    if authorization_header.startswith(prefix):
        return authorization_header[len(prefix):].strip()
    return ""


def _get_request_control_token(request: Request):
    header_token = (request.headers.get("x-control-token") or "").strip()
    if header_token:
        return header_token
    return _extract_bearer_token(request.headers.get("authorization"))


def _is_protected_write_request(request: Request):
    return (
        request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
        and request.url.path in PROTECTED_WRITE_PATHS
    )


def _is_authorized_control_request(request: Request):
    if not CONTROL_AUTH_TOKEN:
        logger.error("Control token missing; rejecting protected write request: %s", request.url.path)
        return False

    provided_token = _get_request_control_token(request)
    if not CONTROL_TOKEN_PATTERN.fullmatch(provided_token):
        return False

    return hmac.compare_digest(provided_token.lower(), CONTROL_AUTH_TOKEN.lower())


@app.middleware("http")
async def enforce_request_security(request: Request, call_next):
    if _is_protected_write_request(request) and not _is_authorized_control_request(request):
        return JSONResponse({"error": "未授权：缺少或无效的控制令牌"}, status_code=403)

    if request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_REQUEST_BODY_BYTES:
                    return JSONResponse({"error": "请求体过大"}, status_code=413)
            except ValueError:
                return JSONResponse({"error": "无效的 Content-Length"}, status_code=400)

        body = await request.body()
        if len(body) > MAX_REQUEST_BODY_BYTES:
            return JSONResponse({"error": "请求体过大"}, status_code=413)

    return await call_next(request)


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
        return normalize_schedule_data(_read_json_file(path, {}))
    except json.JSONDecodeError:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = path + '.corrupted.' + timestamp
        shutil.copy2(path, backup_path)
        logger.warning("Schedule data file corrupted, backed up to: %s", backup_path)
        restored = _restore_json_from_backup("data.json")
        if restored is not None:
            try:
                normalized = normalize_schedule_data(restored)
                _write_json_file_atomic(path, normalized)
                normalized["_recoveredFromBackup"] = True
                return normalized
            except ValueError as restore_error:
                logger.warning("Backup restoration failed schema validation: %s", restore_error)
        data = normalize_schedule_data({})
        data["_corrupted"] = True
        return data
    except ValueError as e:
        logger.warning("Schedule data schema invalid: %s", e)
        data = normalize_schedule_data({})
        data["_corrupted"] = True
        return data
    except OSError:
        return normalize_schedule_data({})


def _write_schedule_data(data, expected_version=None):
    with WRITE_LOCKS["schedule"]:
        path = paths.get_data_file_path()
        current = normalize_schedule_data(_read_json_file(path, {}))
        current_version = (current.get("_meta") or {}).get("version", 0)
        if expected_version is not None and current_version != expected_version:
            raise ValueError("日程数据版本冲突，请刷新后重试")

        normalized = normalize_schedule_data(data)
        validate_schedule_data(normalized)
        normalized["_meta"]["version"] = current_version + 1
        normalized["_meta"]["updatedAt"] = now_iso()

        _create_backup("data.json")
        _write_json_file_atomic(path, normalized)
        return normalized


def _read_agent_history():
    try:
        path = paths.get_agent_log_path()
        return normalize_history_data(_read_json_file(path, {}))
    except json.JSONDecodeError:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = path + '.corrupted.' + timestamp
        shutil.copy2(path, backup_path)
        logger.warning("Agent history file corrupted, backed up to: %s", backup_path)
        data = normalize_history_data({})
        data["_corrupted"] = True
        return data
    except ValueError as e:
        logger.warning("Agent history schema invalid: %s", e)
        data = normalize_history_data({})
        data["_corrupted"] = True
        return data
    except OSError:
        return normalize_history_data({})


def _write_agent_history(data, expected_version=None):
    with WRITE_LOCKS["history"]:
        path = paths.get_agent_log_path()
        current = normalize_history_data(_read_json_file(path, {}))
        current_version = (current.get("_meta") or {}).get("version", 0)
        if expected_version is not None and current_version != expected_version:
            raise ValueError("对话历史版本冲突，请刷新后重试")

        normalized = normalize_history_data(data)
        validate_history_data(normalized)
        normalized["_meta"]["version"] = current_version + 1
        normalized["_meta"]["updatedAt"] = now_iso()
        _write_json_file_atomic(path, normalized)
        return normalized


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
    archived = history.get("archivedConversations") or []
    active_limit = 50
    compress_active = history.get("_compressActive", True)
    to_keep = conversations
    if len(conversations) > active_limit:
        to_archive = conversations[: len(conversations) - active_limit]
        to_keep = conversations[len(conversations) - active_limit :]
        archived = archived + [_compress_conversation(c) for c in to_archive]
    if compress_active:
        to_keep = [_compress_conversation(c) for c in to_keep]
    return {
        **history,
        "conversations": to_keep,
        "archivedConversations": archived,
    }


def _trace_message(message):
    if not isinstance(message, dict):
        return {}
    trace = {
        "role": message.get("role", "assistant"),
        "content": message.get("content") or "",
    }
    if message.get("reasoning_content"):
        trace["reasoning_content"] = message["reasoning_content"]
    if message.get("tool_calls"):
        trace["tool_calls"] = copy.deepcopy(message["tool_calls"])
    if message.get("tool_call_id"):
        trace["tool_call_id"] = message["tool_call_id"]
    if message.get("name"):
        trace["name"] = message["name"]
    return trace


def _extract_self_check_from_trace(trace):
    """
    从 trace 中提取最近一次 verify_changes 工具调用的结果。

    返回 dict 或 None：
    {
        'state': 'pass' | 'fail' | 'skip',
        'passed_count': int,
        'total_count': int,
        'assertions': [...]
    }
    """
    if not isinstance(trace, list) or len(trace) == 0:
        return None
    # 从尾部向前查找最近一次 tool 角色的 verify_changes 结果
    for msg in reversed(trace):
        if not isinstance(msg, dict):
            continue
        if msg.get("role") != "tool":
            continue
        try:
            payload = json.loads(msg.get("content") or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(payload, dict):
            continue
        # 仅匹配 verify_changes 工具的输出
        if "passed_count" in payload or "passed" in payload:
            passed = bool(payload.get("passed"))
            return {
                "state": "pass" if passed else "fail",
                "passed_count": int(payload.get("passed_count", 0)),
                "total_count": int(payload.get("total_count", 0)),
                "assertions": payload.get("assertions", []),
                "source": payload.get("source", "memory"),
            }
    return None


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
    date_info = f"今天是 {today}（周{weekday_names[(local_now.weekday() + 1) % 7]}），昨天是 {yesterday}，明天是 {tomorrow}。"

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

9. **自检纪律（必读）**：完成任何写操作类工具（add_schedule / modify_schedule / manage_tasks / manage_big_tasks / manage_courses / manage_templates）后，你**必须**在同一次 tool loop 中追加一次 `verify_changes` 调用，从数据源回读并断言关键字段（该时间段是否存在、activity 是否如预期等）。这是你的肌肉记忆——**完成任何工作后都要重新设法检查效果**。
   - **写后必检**：每次 add/modify/manage_* 工具返回 success 后，立即追加 verify_changes。
   - **批量场景**：周期性添加/批量操作时，传入 `assertions` 数组一次性校验所有日期。
   - **跳过场景**：纯只读工具（view_schedule / analyze / web_search_evaluate / estimate_task_time）跳过自检；工具返回 error 时跳过自检。
   - **失败不得宣称成功**：verify_changes 返回 passed=false 时，你对用户的最终回复**不得**写"已添加/已删除/已修改"等确定性措辞。诚实说明"我尝试了 X，自检发现 Y 仍为 Z，可能是未真正落盘"，建议用户：手动确认 / 重新发起 / 调用 view_schedule 再次核对。
   - **失败可重试**：add_schedule 等可重试工具在自检失败时可自动重试 1 次（修正参数后再次调用），重试成功仍标注"已重试 1 次后通过"。重试仍失败则自动调用 `analyze(action="health_check")` 报告整体数据状态。

10. **工具调用失败处理（关键）**：
   - 工具返回错误时（参数缺失、格式错误、找不到资源等），**先根据 error 信息自行修正参数再重试**，不要直接放弃。
   - 常见可自纠错误：date 不是 YYYY-MM-DD、time 不是 HH:MM-HH:MM、缺少必填字段、传入了不存在的课程名/任务名/日期。修正对应字段后再次调用同一工具即可。
   - 同一错误**最多重试 2 次**；仍失败则停止重试，用一句话告诉用户卡在哪里，并主动询问缺失信息（例如"你说的'高数'是哪一天的？我需要具体日期"），不要让用户自己去排查。
   - 工具失败不阻塞其他正常工具的调用，可以并行/串联调用其他可用工具完成任务。

【时间估算规则】
- 用户问"要多久/多长时间/多久能做完/估算用时"时，优先提取 task_name、category，以及 difficulty、familiarity、steps_count、deadline_pressure、output_type 这 5 个高影响特征。
- 如果现有信息已经足够，直接调用 estimate_task_time，不要为了估时继续追问。
- 如果确实缺少关键信息，最多只补问 1 到 2 个高影响问题，只补少量真正影响用时的信息，优先问：是否第一次做、步骤是否很多、是否有明确交付物、是否今天/明天截止。
- 不要追问低价值细节，不要一次性列出很多问题。
- category 优先在 学习 / 工作 / 生活 / 运动 中选择最接近的一类，只有明显无法判断时才保留为"其他"。

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
    date_info = f"今天是 {today}（周{weekday_names[(local_now.weekday() + 1) % 7]}）。用户本地时间，时区: {tz_str}。"

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


def _get_fallback_response(error_msg, last_user_message, error_code=None):
    # 鉴权失败（401/403）专用文案：跳过 Mosa 风格俏皮话，给出可操作的提示
    if error_code == "AUTH_INVALID":
        return {"content": "AI 服务鉴权失败，请前往设置检查 DeepSeek API Key 是否有效。", "proposal": None}
    if isinstance(error_msg, str) and (
        "Authentication Fails" in error_msg
        or "401" in error_msg
        or "403" in error_msg
    ):
        return {"content": "AI 服务鉴权失败，请前往设置检查 DeepSeek API Key 是否有效。", "proposal": None}
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
                       _pending_proposal=None, _trace=None):
    api_key = _get_current_api_key()
    api_url = _get_current_api_url()
    turn_trace = list(_trace or [])

    if not api_key or api_key.startswith("YOUR_"):
        logger.error("[API] ERROR: API key not configured!")
        return {"content": "AI服务未配置，请在config.json中设置有效的API密钥。", "proposal": _pending_proposal, "shouldRefresh": False}

    await _api_rate_limiter.acquire()

    MAX_DEPTH = 10
    if depth > MAX_DEPTH:
        logger.error("[API] Maximum tool call depth exceeded")
        return {"content": "工具调用轮次过多，请简化您的请求。", "proposal": _pending_proposal, "shouldRefresh": False}

    req_body = {
        "model": model_name,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
    }
    if max_tokens is not None:
        req_body["max_tokens"] = max_tokens
    if temperature is not None:
        req_body["temperature"] = temperature

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
                                      _pending_proposal=_pending_proposal,
                                      _trace=turn_trace)
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
                                      _pending_proposal=_pending_proposal,
                                      _trace=turn_trace)
        return {"content": None, "proposal": _pending_proposal, "shouldRefresh": _parent_modified,
                "_error": _get_fallback_response(f"HTTP {response.status_code}",
                                                 messages[-1].get("content", "") if messages else "")}

    if response.status_code != 200:
        # 鉴权失败（401/403）直接失败，不再重试，密钥无效时反复重试毫无意义
        if response.status_code in (401, 403):
            logger.error("[API] HTTP %d (auth invalid), no retry: %s",
                         response.status_code, response.text[:500])
            return {
                "content": None,
                "proposal": _pending_proposal,
                "shouldRefresh": _parent_modified,
                "_error": _get_fallback_response(
                    f"HTTP {response.status_code}: {response.text[:200]}",
                    messages[-1].get("content", "") if messages else "",
                    error_code="AUTH_INVALID",
                ),
            }
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
                                      _pending_proposal=_pending_proposal,
                                      _trace=turn_trace)
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
            except Exception as e:
                logger.error("[AI] Schedule data write failed: %s", e)
                has_data_modification = False
                write_error = True

        assistant_msg = {
            "role": "assistant",
            "content": message.get("content") or "",
            "tool_calls": tool_calls,
        }
        if message.get("reasoning_content"):
            assistant_msg["reasoning_content"] = message["reasoning_content"]

        new_messages = list(messages) + [assistant_msg]
        new_trace = turn_trace + [_trace_message(assistant_msg)]
        for tr in tool_results_list:
            tool_msg = {
                "role": "tool",
                "tool_call_id": tr["toolCallId"],
                "content": tr["result"],
            }
            new_messages.append(tool_msg)
            new_trace.append(_trace_message(tool_msg))

        logger.info("[AI] Making follow-up call with tool results, depth: %d", depth + 1)
        follow_up = await _call_ai_api(new_messages, tools, model_name, max_tokens, temperature,
                                       retry_count, depth + 1, max_retries, retry_delay,
                                       _parent_modified=has_data_modification or _parent_modified,
                                       _parent_write_error=write_error or _parent_write_error,
                                       _pending_proposal=pending_proposal,
                                       _trace=new_trace)
        follow_up["shouldRefresh"] = has_data_modification or follow_up.get("shouldRefresh", False)
        return follow_up

    content = message.get("content") or "我没听懂，再说一遍？"
    final_message = {"role": "assistant", "content": content}
    if message.get("reasoning_content"):
        final_message["reasoning_content"] = message["reasoning_content"]
    final_trace = turn_trace + [_trace_message(final_message)]
    result = {
        "content": content,
        "proposal": _pending_proposal,
        "reasoning_content": message.get("reasoning_content") or "",
        "shouldRefresh": _parent_modified or has_data_modification,
        "trace": final_trace,
    }
    # 自检结果注入到同步响应中，前端可从 result.self_check 读取
    self_check = _extract_self_check_from_trace(final_trace)
    if self_check:
        result["selfCheck"] = self_check
        logger.info("[AI] self_check: %s (%d/%d)",
                    self_check["state"], self_check["passed_count"], self_check["total_count"])
    return result


async def _call_ai_api_stream(messages, tools, model_name, max_tokens, temperature=None,
                               retry_count=0, depth=0, max_retries=3, retry_delay=1.0,
                               _parent_modified=False, _parent_write_error=False,
                               _pending_proposal=None, _trace=None):
    api_key = _get_current_api_key()
    api_url = _get_current_api_url()
    turn_trace = list(_trace or [])

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

    req_body = {
        "model": model_name,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "stream": True,
    }
    if max_tokens is not None:
        req_body["max_tokens"] = max_tokens
    if temperature is not None:
        req_body["temperature"] = temperature

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
                    # 鉴权失败（401/403）直接结束流，不再触发重试循环
                    if response.status_code in (401, 403):
                        logger.error("[API Stream] HTTP %d (auth invalid), no retry: %s",
                                     response.status_code, error_text)
                        yield _sse_event("content", "AI 服务鉴权失败，请前往设置检查 DeepSeek API Key 是否有效。")
                        yield _sse_event("result", {"errorCode": "AUTH_INVALID", "shouldRefresh": False})
                        yield _sse_done()
                        return
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
                                                            _pending_proposal=_pending_proposal,
                                                            _trace=turn_trace):
                            yield ev
                        return
                    if _parent_modified:
                        logger.info("[AI Stream] HTTP error but _parent_modified=True, sending shouldRefresh")
                        result_ev = {"shouldRefresh": True}
                        if _pending_proposal:
                            result_ev["proposal"] = _proposal_for_client(_pending_proposal)
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
                except Exception as e:
                    logger.error("[AI Stream] Schedule data write failed: %s", e)
                    has_data_modification = False
                    write_error = True

            assistant_msg = {
                "role": "assistant",
                "content": accumulated["content"],
                "tool_calls": tool_calls,
            }
            if accumulated["reasoning_content"]:
                assistant_msg["reasoning_content"] = accumulated["reasoning_content"]

            new_messages = list(messages) + [assistant_msg]
            new_trace = turn_trace + [_trace_message(assistant_msg)]
            for tr in tool_results_list:
                tool_msg = {
                    "role": "tool",
                    "tool_call_id": tr["toolCallId"],
                    "content": tr["result"],
                }
                new_messages.append(tool_msg)
                new_trace.append(_trace_message(tool_msg))

            logger.info("[AI Stream] Making follow-up call with tool results, depth: %d", depth + 1)
            async for ev in _call_ai_api_stream(new_messages, tools, model_name, max_tokens,
                                                temperature, retry_count, depth + 1,
                                                max_retries, retry_delay,
                                                _parent_modified=has_data_modification or _parent_modified,
                                                _parent_write_error=write_error or _parent_write_error,
                                                _pending_proposal=pending_proposal,
                                                _trace=new_trace):
                yield ev
            return

        total_modified = has_data_modification or _parent_modified
        final_message = {
            "role": "assistant",
            "content": accumulated["content"] or "我没听懂，再说一遍？",
        }
        if accumulated["reasoning_content"]:
            final_message["reasoning_content"] = accumulated["reasoning_content"]
        final_trace = turn_trace + [_trace_message(final_message)]
        result_data = {
            "shouldRefresh": total_modified,
            "trace": final_trace,
        }
        if _pending_proposal:
            result_data["proposal"] = _proposal_for_client(_pending_proposal)
        if write_error or _parent_write_error:
            result_data["writeError"] = True
        # 自检事件：从 trace 中提取最近一次 verify_changes 结果并 yield 给前端
        self_check = _extract_self_check_from_trace(final_trace)
        if self_check:
            logger.info("[AI Stream] self_check: %s (%d/%d)",
                        self_check["state"], self_check["passed_count"], self_check["total_count"])
            yield _sse_event("self_check", self_check)
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
                                                _pending_proposal=_pending_proposal,
                                                _trace=turn_trace):
                yield ev
            return
        if _parent_modified:
            logger.info("[AI Stream] Network error but _parent_modified=True, sending shouldRefresh")
            result_ev = {"shouldRefresh": True}
            if _pending_proposal:
                result_ev["proposal"] = _proposal_for_client(_pending_proposal)
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
    elif event_type == "self_check":
        data = {"type": "self_check"}
        if isinstance(content, dict):
            data.update(content)
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
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

    # 过滤孤儿 tool 消息，避免触发 DeepSeek "tool must be a response to a preceding tool_calls" 错误
    messages = _sanitize_history_for_api(messages)

    if images and len(images) > 0:
        user_message = message or ""
        user_message = (user_message + "\n\n" if user_message else "") + f"[用户上传了 {len(images)} 张图片，但当前AI不支持图片分析]"
        if user_message:
            messages.append({"role": "user", "content": user_message})
    elif message:
        messages.append({"role": "user", "content": message})

    selected_model = _get_current_model_name()
    logger.info("[AI] Using model: %s (forced flash, no auto-reasoner)", selected_model)

    try:
        response = await _call_ai_api(
            messages=messages,
            tools=AI_TOOLS,
            model_name=selected_model,
            max_tokens=None,  # 取消 agent 单次思考的 token 上限，允许超长思考
            temperature=0.8,
        )
        error_info = response.pop("_error", None)
        if error_info and response.get("content") is None:
            return {
                "response": {"content": error_info["content"], "proposal": _proposal_for_client(error_info["proposal"])},
                "updatedProfile": _extract_profile_info(error_info.get("content", ""), profile),
                "shouldRefresh": False,
            }

        return {
            "response": {
                "content": response["content"],
                "proposal": _proposal_for_client(response.get("proposal")),
                "reasoning_content": response.get("reasoning_content", ""),
                "trace": response.get("trace") or [],
            },
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

    # 过滤孤儿 tool 消息，避免触发 DeepSeek "tool must be a response to a preceding tool_calls" 错误
    messages = _sanitize_history_for_api(messages)

    if images and len(images) > 0:
        user_message = message or ""
        user_message = (user_message + "\n\n" if user_message else "") + f"[用户上传了 {len(images)} 张图片，但当前AI不支持图片分析]"
        if user_message:
            messages.append({"role": "user", "content": user_message})
    elif message:
        messages.append({"role": "user", "content": message})

    selected_model = _get_current_model_name()
    logger.info("[AI Stream] Using model: %s (forced flash, no auto-reasoner)", selected_model)

    async def _generate():
        try:
            async for sse in _call_ai_api_stream(
                messages=messages,
                tools=AI_TOOLS,
                model_name=selected_model,
                max_tokens=None,  # 取消 agent 单次思考的 token 上限，允许超长思考
                temperature=0.7,
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
                len(filtered_tools), len(AI_TOOLS), MODEL_NAME)

    try:
        response = await _call_ai_api(
            messages=messages,
            tools=filtered_tools,
            model_name=_get_current_model_name(),
            max_tokens=16000,
            temperature=None,
        )
        error_info = response.pop("_error", None)
        if error_info and response.get("content") is None:
            return {
                "response": {"content": error_info["content"], "proposal": _proposal_for_client(error_info["proposal"])},
                "updatedProfile": _extract_profile_info(error_info.get("content", ""), profile),
                "shouldRefresh": False,
            }

        return {
            "response": {"content": response["content"], "proposal": _proposal_for_client(response.get("proposal"))},
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
    def _fail(message, code=None):
        payload = {"success": False, "message": message, "error": message}
        if code:
            payload["code"] = code
        return payload

    def _slot_matches(slot, target):
        return (
            slot.get("activity") == target
            or slot.get("time") == target
            or target in (slot.get("activity") or "")
        )

    def _parse_weekday_candidates(raw_value):
        if raw_value is None or raw_value == "":
            return set()
        value = str(raw_value).strip()
        weekday_names = {
            "周一": {0, 1},
            "星期一": {0, 1},
            "周二": {1, 2},
            "星期二": {1, 2},
            "周三": {2, 3},
            "星期三": {2, 3},
            "周四": {3, 4},
            "星期四": {3, 4},
            "周五": {4, 5},
            "星期五": {4, 5},
            "周六": {5, 6},
            "星期六": {5, 6},
            "周日": {6, 0, 7},
            "星期日": {6, 0, 7},
            "周天": {6, 0, 7},
            "星期天": {6, 0, 7},
        }
        if value in weekday_names:
            return weekday_names[value]
        if value.lstrip("-").isdigit():
            return {int(value)}
        return set()

    def _date_weekday_candidates(date_str):
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        monday_zero = dt.weekday()
        sunday_zero = (monday_zero + 1) % 7
        monday_one = monday_zero + 1
        sunday_seven = 7 if monday_zero == 6 else monday_zero + 1
        return {monday_zero, sunday_zero, monday_one, sunday_seven}

    def _matches_schedule_criteria(date_str, schedule, slot, criteria):
        criteria = criteria or {}
        if criteria.get("date") and criteria["date"] != date_str:
            return False
        if criteria.get("activity") and criteria["activity"] not in (slot.get("activity") or ""):
            return False
        if criteria.get("keyword"):
            haystack = " ".join(
                [
                    schedule.get("title", ""),
                    schedule.get("highlights", ""),
                    slot.get("activity", ""),
                    slot.get("detail", ""),
                ]
            )
            if criteria["keyword"] not in haystack:
                return False
        weekday_expected = _parse_weekday_candidates(criteria.get("day_of_week"))
        if weekday_expected and _date_weekday_candidates(date_str).isdisjoint(weekday_expected):
            return False
        return True

    def _build_course_detail(existing_detail, updates):
        parts = [part.strip() for part in (existing_detail or "").split(" * ")] if existing_detail else []
        while len(parts) < 3:
            parts.append("")
        if "location" in updates:
            parts[0] = updates.get("location", "")
        if "teacher" in updates:
            parts[1] = updates.get("teacher", "")
        if "weeks" in updates:
            parts[2] = updates.get("weeks", "")
        return " * ".join(part for part in parts if part)

    def _build_template_cell_detail(cell_data):
        if not isinstance(cell_data, dict):
            return ""
        parts = []
        if cell_data.get("location"):
            parts.append(f"地点：{cell_data.get('location')}")
        if cell_data.get("teacher"):
            parts.append(f"教师：{cell_data.get('teacher')}")
        if cell_data.get("note"):
            parts.append(f"备注：{cell_data.get('note')}")
        return " * ".join(parts)

    def _normalize_week_type(raw_value, default=""):
        mapping = {
            "odd": "odd",
            "single": "odd",
            "单周": "odd",
            "奇数周": "odd",
            "even": "even",
            "double": "even",
            "双周": "even",
            "偶数周": "even",
            "all": "all",
            "both": "all",
            "单双周": "all",
            "全部": "all",
        }
        return mapping.get(str(raw_value or "").strip().lower(), default)

    def _parse_template_weekday(raw_value):
        if raw_value is None or raw_value == "":
            return None
        if isinstance(raw_value, (int, float)) and not isinstance(raw_value, bool):
            value = int(raw_value)
            if 1 <= value <= 7:
                return value - 1
            if 0 <= value <= 6:
                return value
            return None
        weekday_map = {
            "周一": 0, "星期一": 0,
            "周二": 1, "星期二": 1,
            "周三": 2, "星期三": 2,
            "周四": 3, "星期四": 3,
            "周五": 4, "星期五": 4,
            "周六": 5, "星期六": 5,
            "周日": 6, "星期日": 6, "周天": 6, "星期天": 6,
        }
        value = str(raw_value).strip()
        if value in weekday_map:
            return weekday_map[value]
        if value.lstrip("-").isdigit():
            numeric = int(value)
            if 1 <= numeric <= 7:
                return numeric - 1
            if 0 <= numeric <= 6:
                return numeric
        return None

    def _parse_template_section_range(cell_ref):
        if not isinstance(cell_ref, dict):
            return None, None, None
        section_start = int(cell_ref.get("sectionStart") or 0)
        section_end = int(cell_ref.get("sectionEnd") or 0)
        merge_span = int(cell_ref.get("mergeSpan") or 0)
        if section_start <= 0:
            return None, None, None
        if section_end <= 0:
            section_end = section_start + merge_span - 1 if merge_span > 0 else section_start
        section_end = max(section_start, section_end)
        merge_span = section_end - section_start + 1
        return section_start, section_end, merge_span

    def _iter_template_cells(course_map):
        if not isinstance(course_map, dict):
            return
        for cell_key, cell_data in course_map.items():
            if not isinstance(cell_data, dict):
                continue
            try:
                row_index, day_index = [int(part) for part in str(cell_key).split("-", 1)]
            except (TypeError, ValueError):
                continue
            merge_span = max(1, int(cell_data.get("mergeSpan") or 1))
            yield cell_key, row_index + 1, row_index + merge_span, day_index, cell_data

    def _find_template_cell(course_map, cell_ref):
        target_day = _parse_template_weekday(cell_ref.get("weekday"))
        target_name = cell_ref.get("courseName") or cell_ref.get("course_name")
        target_start, target_end, _merge_span = _parse_template_section_range(cell_ref)
        for cell_key, start_section, end_section, day_index, cell_data in _iter_template_cells(course_map):
            if target_day is not None and day_index != target_day:
                continue
            if target_start and target_end and (start_section != target_start or end_section != target_end):
                continue
            if target_name and cell_data.get("course") != target_name:
                continue
            return cell_key, cell_data
        return None, None

    def _clear_template_overlaps(course_map, weekday, section_start, section_end):
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

    def _template_course_maps(template, week_type):
        maps = []
        if week_type in ("odd", "all"):
            template.setdefault("oddWeekCourses", {})
            maps.append(template["oddWeekCourses"])
        if week_type in ("even", "all"):
            template.setdefault("evenWeekCourses", {})
            maps.append(template["evenWeekCourses"])
        return maps

    def _apply_template_cell(template, cell_ref):
        week_type = _normalize_week_type(cell_ref.get("weekType") or cell_ref.get("week_type"), "all")
        weekday = _parse_template_weekday(cell_ref.get("weekday"))
        section_start, section_end, merge_span = _parse_template_section_range(cell_ref)
        course_name = cell_ref.get("courseName") or cell_ref.get("course_name")
        if weekday is None or section_start is None or section_end is None or not course_name:
            return False, "模板格子缺少 weekday/section/courseName 等必要字段"
        for course_map in _template_course_maps(template, week_type):
            _clear_template_overlaps(course_map, weekday, section_start, section_end)
            course_map[f"{section_start - 1}-{weekday}"] = {
                "course": course_name,
                "mergeSpan": merge_span,
                "location": cell_ref.get("location", ""),
                "teacher": cell_ref.get("teacher", ""),
                "note": cell_ref.get("note", ""),
            }
        return True, None

    def _remove_template_cell(template, cell_ref):
        week_type = _normalize_week_type(cell_ref.get("weekType") or cell_ref.get("week_type"), "all")
        removed = 0
        for course_map in _template_course_maps(template, week_type):
            cell_key, _cell_data = _find_template_cell(course_map, cell_ref)
            if cell_key:
                del course_map[cell_key]
                removed += 1
        return removed

    def _course_ref_matches(date_str, slot, course_ref):
        course_name = course_ref.get("name") or course_ref.get("courseName")
        course_time = course_ref.get("time")
        if course_name and slot.get("activity") != course_name:
            return False
        if course_time and slot.get("time") != course_time:
            return False
        if course_ref.get("date") and course_ref["date"] != date_str:
            return False
        weekday_candidates = _parse_weekday_candidates(course_ref.get("weekday"))
        if weekday_candidates and _date_weekday_candidates(date_str).isdisjoint(weekday_candidates):
            return False
        return True

    def _find_course_slot(schedule, date_str, course_ref):
        for index, slot in enumerate(schedule.get("timeSlots") or []):
            if _course_ref_matches(date_str, slot, course_ref):
                return index, slot
        return None, None

    def _time_overlaps(start1, end1, start2, end2):
        def _to_minutes(text):
            hour, minute = text.split(":")
            return int(hour) * 60 + int(minute)
        return _to_minutes(start1) < _to_minutes(end2) and _to_minutes(start2) < _to_minutes(end1)

    def _apply_template_to_date(existing_schedule, template, target_date):
        schedule = copy.deepcopy(existing_schedule)
        schedule.setdefault("title", "")
        schedule.setdefault("highlights", "")
        schedule.setdefault("milestone", "")
        schedule.setdefault("tasks", [])
        schedule.setdefault("timeSlots", [])

        direct_slots = [
            slot for slot in (template.get("timeSlots") or [])
            if isinstance(slot, dict) and slot.get("time") and slot.get("activity")
        ]
        if direct_slots:
            added_count = 0
            for slot in direct_slots:
                start_time, end_time = slot["time"].split("-")
                schedule["timeSlots"] = [
                    existing for existing in schedule["timeSlots"]
                    if not _time_overlaps(start_time, end_time, existing["time"].split("-")[0], existing["time"].split("-")[1])
                ]
                schedule["timeSlots"].append({
                    "time": slot["time"],
                    "activity": slot.get("activity", ""),
                    "detail": slot.get("detail", ""),
                    "icon": slot.get("icon", "📚"),
                })
                added_count += 1
            schedule["timeSlots"].sort(key=lambda item: item["time"])
            return schedule, added_count, None

        start_date = template.get("startDate")
        end_date = template.get("endDate")
        time_slots = template.get("timeSlots") or []
        odd_courses = template.get("oddWeekCourses") or {}
        even_courses = template.get("evenWeekCourses") or {}
        if not start_date or not time_slots:
            return None, 0, "模板缺少可应用的课表数据"

        target_dt = datetime.strptime(target_date, "%Y-%m-%d")
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        delta_days = (target_dt.date() - start_dt.date()).days
        if delta_days < 0:
            return None, 0, "目标日期早于模板起始日期，无法应用模板"

        if end_date:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            if target_dt.date() > end_dt.date():
                return None, 0, "目标日期超出模板结束日期，无法应用模板"

        total_weeks = template.get("totalWeeks")
        week_index = delta_days // 7 + 1
        if isinstance(total_weeks, int) and total_weeks > 0 and week_index > total_weeks:
            return None, 0, "目标日期超出模板覆盖周数，无法应用模板"

        day_index = delta_days % 7
        course_map = odd_courses if week_index % 2 == 1 else even_courses
        if not isinstance(course_map, dict):
            return None, 0, "模板课程数据格式无效"

        generated_slots = []
        for cell_key, cell_data in course_map.items():
            if not isinstance(cell_data, dict) or not cell_data.get("course"):
                continue
            try:
                row_index, course_day_index = [int(part) for part in str(cell_key).split("-", 1)]
            except (TypeError, ValueError):
                continue
            if course_day_index != day_index or row_index < 0 or row_index >= len(time_slots):
                continue
            slot_meta = time_slots[row_index]
            if not isinstance(slot_meta, dict):
                continue
            start_time = slot_meta.get("startTime")
            end_time = slot_meta.get("endTime")
            if not start_time or not end_time:
                continue
            merge_span = int(cell_data.get("mergeSpan") or 1)
            if merge_span > 1:
                last_index = row_index + merge_span - 1
                if 0 <= last_index < len(time_slots) and isinstance(time_slots[last_index], dict):
                    end_time = time_slots[last_index].get("endTime") or end_time
            generated_slots.append({
                "time": f"{start_time}-{end_time}",
                "activity": cell_data.get("course", ""),
                "detail": cell_data.get("detail") or _build_template_cell_detail(cell_data),
                "icon": cell_data.get("icon", "📚"),
                "location": cell_data.get("location", ""),
                "teacher": cell_data.get("teacher", ""),
                "note": cell_data.get("note", ""),
                "type": "course",
            })

        if not generated_slots:
            return None, 0, "目标日期在该模板下没有可应用的课程安排"

        for slot in generated_slots:
            start_time, end_time = slot["time"].split("-")
            schedule["timeSlots"] = [
                existing for existing in schedule["timeSlots"]
                if not _time_overlaps(start_time, end_time, existing["time"].split("-")[0], existing["time"].split("-")[1])
            ]
            schedule["timeSlots"].append(slot)
        schedule["timeSlots"].sort(key=lambda item: item["time"])
        return schedule, len(generated_slots), None

    try:
        approved = verify_proposal_token(proposal)
        proposal = approved["proposal"]
        expected_version = approved["scheduleVersion"]
        data = _read_schedule_data()
        current_version = (data.get("_meta") or {}).get("version", 0)
        if current_version != expected_version:
            return _fail("提案已过期，当前数据已变化，请重新生成提案", code="PROPOSAL_VERSION_CONFLICT")

        proposal_type = proposal["type"]

        if proposal_type == "manage_schedule_delete":
            date = proposal.get("date")
            schedules = data.get("schedules") or {}
            if date not in schedules:
                return _fail("日期安排不存在")
            del schedules[date]
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {
                "success": True,
                "message": f"已删除 {date} 的安排",
                "deletedCount": 1,
                "version": (saved.get("_meta") or {}).get("version"),
            }

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
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {
                "success": True,
                "message": f"已批量删除 {deleted_count} 个日期的安排",
                "deletedCount": deleted_count,
                "deletedSlotsCount": deleted_slots_count,
                "deletedTasksCount": deleted_tasks_count,
                "version": (saved.get("_meta") or {}).get("version"),
            }

        if proposal_type == "update_task":
            date = proposal.get("date")
            old_name = proposal.get("oldTaskName")
            new_name = proposal.get("newTaskName")
            new_est = proposal.get("newEstimatedMinutes")
            sch = (data.get("schedules") or {}).get(date)
            if not sch or not sch.get("tasks"):
                return _fail("任务不存在")
            task = next((t for t in sch["tasks"] if t["name"] == old_name), None)
            if not task:
                return _fail("任务不存在")
            task["name"] = new_name
            task["estimated"] = str(new_est)
            time_estimation = task.get("timeEstimation")
            if isinstance(time_estimation, dict):
                time_estimation["estimatedMinutes"] = int(new_est) if isinstance(new_est, (int, float)) else 0
                if not time_estimation.get("context"):
                    time_estimation["context"] = task.get("note", "")
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {"success": True, "message": f"任务已更新: {old_name} -> {new_name}", "version": (saved.get("_meta") or {}).get("version")}

        if proposal_type == "delete_task":
            date = proposal.get("date")
            task_name = proposal.get("taskName")
            sch = (data.get("schedules") or {}).get(date)
            if not sch or not sch.get("tasks"):
                return _fail("任务不存在")
            initial_len = len(sch["tasks"])
            sch["tasks"] = [t for t in sch["tasks"] if t["name"] != task_name]
            if len(sch["tasks"]) == initial_len:
                return _fail("任务不存在")
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {"success": True, "message": f"任务已删除: {task_name}", "version": (saved.get("_meta") or {}).get("version")}

        if proposal_type == "batch_delete_tasks":
            tasks = proposal.get("tasks") or []
            deleted = 0
            for ti in tasks:
                sch = (data.get("schedules") or {}).get(ti.get("date"))
                if sch and sch.get("tasks"):
                    before = len(sch["tasks"])
                    sch["tasks"] = [t for t in sch["tasks"] if t["name"] != ti.get("task_name")]
                    deleted += before - len(sch["tasks"])
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {"success": True, "message": f"已批量删除 {deleted} 个任务", "deletedCount": deleted, "version": (saved.get("_meta") or {}).get("version")}

        if proposal_type == "update_big_task":
            old_name = proposal.get("oldTaskName")
            new_name = proposal.get("newTaskName")
            new_est = proposal.get("newEstimatedMinutes")
            new_ddl = proposal.get("newDdl")
            new_task_type = proposal.get("newTaskType")
            new_start_date = proposal.get("newStartDate")
            new_note = proposal.get("newNote")
            if not data.get("bigTasks"):
                return _fail("大任务不存在")
            task = next((t for t in data["bigTasks"] if t["name"] == old_name), None)
            if not task:
                return _fail("大任务不存在")
            task["name"] = new_name
            task["estimated"] = new_est
            task["ddl"] = new_ddl
            if new_task_type in ("short", "long"):
                task["type"] = new_task_type
            if new_start_date is not None:
                task["startDate"] = new_start_date
            if new_note is not None:
                task["note"] = new_note
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {"success": True, "message": f"大任务已更新: {old_name} -> {new_name}", "version": (saved.get("_meta") or {}).get("version")}

        if proposal_type == "delete_big_task":
            task_name = proposal.get("taskName")
            if not data.get("bigTasks"):
                return _fail("大任务不存在")
            initial_len = len(data["bigTasks"])
            data["bigTasks"] = [t for t in data["bigTasks"] if t["name"] != task_name]
            if len(data["bigTasks"]) == initial_len:
                return _fail("大任务不存在")
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {"success": True, "message": f"大任务已删除: {task_name}", "version": (saved.get("_meta") or {}).get("version")}

        if proposal_type == "batch_delete_big_tasks":
            names = proposal.get("taskNames") or []
            if not data.get("bigTasks"):
                return _fail("没有大任务")
            before = len(data["bigTasks"])
            data["bigTasks"] = [t for t in data["bigTasks"] if t["name"] not in names]
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {"success": True, "message": f"已批量删除 {before - len(data['bigTasks'])} 个大任务", "version": (saved.get("_meta") or {}).get("version")}

        if proposal_type == "batch_modify_schedules":
            operation = proposal.get("operation")
            criteria = proposal.get("criteria") or {}
            new_details = proposal.get("newDetails") or {}
            schedules = data.get("schedules") or {}
            affected_dates = set()
            modified_count = 0

            if operation == "delete_all_matching":
                for date_key, schedule in schedules.items():
                    slots = schedule.get("timeSlots") or []
                    kept = []
                    removed = 0
                    for slot in slots:
                        if _matches_schedule_criteria(date_key, schedule, slot, criteria):
                            removed += 1
                        else:
                            kept.append(slot)
                    if removed:
                        schedule["timeSlots"] = kept
                        affected_dates.add(date_key)
                        modified_count += removed
                if modified_count == 0:
                    return _fail("未找到匹配的日程")
                saved = _write_schedule_data(data, expected_version=expected_version)
                return {
                    "success": True,
                    "message": f"已批量删除 {modified_count} 条匹配日程",
                    "modifiedCount": modified_count,
                    "affectedDates": sorted(affected_dates),
                    "version": (saved.get("_meta") or {}).get("version"),
                }

            if operation == "update_all_matching":
                if not new_details:
                    return _fail("批量更新缺少 newDetails")
                for date_key, schedule in schedules.items():
                    updated_slots = []
                    updated_here = 0
                    for slot in (schedule.get("timeSlots") or []):
                        if _matches_schedule_criteria(date_key, schedule, slot, criteria):
                            updated_slot = dict(slot)
                            for field in ("time", "activity", "detail", "icon"):
                                if field in new_details and new_details.get(field):
                                    updated_slot[field] = new_details[field]
                            updated_slots.append(updated_slot)
                            updated_here += 1
                        else:
                            updated_slots.append(slot)
                    if updated_here:
                        schedule["timeSlots"] = sorted(updated_slots, key=lambda item: item["time"])
                        affected_dates.add(date_key)
                        modified_count += updated_here
                if modified_count == 0:
                    return _fail("未找到匹配的日程")
                saved = _write_schedule_data(data, expected_version=expected_version)
                return {
                    "success": True,
                    "message": f"已批量更新 {modified_count} 条匹配日程",
                    "modifiedCount": modified_count,
                    "affectedDates": sorted(affected_dates),
                    "version": (saved.get("_meta") or {}).get("version"),
                }

            logger.warning("[Approve] Unsupported batch_modify_schedules operation: %s", operation)
            return _fail(f"暂不支持的批量日程操作: {operation}", code="PROPOSAL_UNSUPPORTED")

        if proposal_type == "modify_course":
            old_course = proposal.get("oldCourseInfo") or {}
            new_course = proposal.get("newCourseInfo") or {}
            schedules = data.get("schedules") or {}
            affected_dates = set()
            modified_count = 0
            for date_key, schedule in schedules.items():
                updated_slots = []
                updated_here = 0
                for slot in (schedule.get("timeSlots") or []):
                    if _course_ref_matches(date_key, slot, old_course):
                        updated_slot = dict(slot)
                        if new_course.get("name"):
                            updated_slot["activity"] = new_course["name"]
                        if new_course.get("time"):
                            updated_slot["time"] = new_course["time"]
                        updated_detail = _build_course_detail(slot.get("detail", ""), new_course)
                        if updated_detail or any(key in new_course for key in ("location", "teacher", "weeks")):
                            updated_slot["detail"] = updated_detail
                        updated_slots.append(updated_slot)
                        updated_here += 1
                    else:
                        updated_slots.append(slot)
                if updated_here:
                    schedule["timeSlots"] = sorted(updated_slots, key=lambda item: item["time"])
                    affected_dates.add(date_key)
                    modified_count += updated_here
            if modified_count == 0:
                return _fail("未找到需要修改的课程")
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {
                "success": True,
                "message": f"已修改 {modified_count} 条课程安排",
                "modifiedCount": modified_count,
                "affectedDates": sorted(affected_dates),
                "version": (saved.get("_meta") or {}).get("version"),
            }

        if proposal_type == "modify_template_course":
            old_cell = proposal.get("oldCourseCell") or {}
            new_cell = proposal.get("newCourseCell") or {}
            template_name = (
                old_cell.get("templateName")
                or old_cell.get("template_name")
                or new_cell.get("templateName")
                or new_cell.get("template_name")
            )
            template = next(
                (
                    item for item in (data.get("scheduleTemplates") or [])
                    if isinstance(item, dict) and item.get("name") == template_name
                ),
                None,
            )
            if not isinstance(template, dict):
                return _fail(f"模板“{template_name}”不存在")
            removed = _remove_template_cell(template, old_cell)
            if removed <= 0:
                return _fail("未找到需要修改的课表格子")
            patched_new_cell = dict(new_cell)
            if not (patched_new_cell.get("templateName") or patched_new_cell.get("template_name")):
                patched_new_cell["templateName"] = template_name
            success, error = _apply_template_cell(template, patched_new_cell)
            if not success:
                return _fail(error)
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {
                "success": True,
                "message": "课表格子已修改",
                "modifiedCount": removed,
                "version": (saved.get("_meta") or {}).get("version"),
            }

        if proposal_type == "remove_course":
            course_name = proposal.get("courseName")
            schedules = data.get("schedules") or {}
            removed_count = 0
            affected_dates = set()
            for date_key, schedule in schedules.items():
                before = len(schedule.get("timeSlots") or [])
                schedule["timeSlots"] = [
                    slot for slot in (schedule.get("timeSlots") or [])
                    if not _course_ref_matches(
                        date_key,
                        slot,
                        {
                            "name": course_name,
                            "weekday": proposal.get("weekday"),
                            "time": proposal.get("time"),
                        },
                    )
                ]
                removed_here = before - len(schedule["timeSlots"])
                if removed_here:
                    removed_count += removed_here
                    affected_dates.add(date_key)
            if removed_count == 0:
                return _fail("未找到需要移除的课程")
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {
                "success": True,
                "message": f"已移除 {removed_count} 条课程安排",
                "deletedCount": removed_count,
                "affectedDates": sorted(affected_dates),
                "version": (saved.get("_meta") or {}).get("version"),
            }

        if proposal_type == "remove_template_course":
            cell_ref = proposal.get("courseCell") or {}
            template_name = cell_ref.get("templateName") or cell_ref.get("template_name")
            template = next(
                (
                    item for item in (data.get("scheduleTemplates") or [])
                    if isinstance(item, dict) and item.get("name") == template_name
                ),
                None,
            )
            if not isinstance(template, dict):
                return _fail(f"模板“{template_name}”不存在")
            removed_count = _remove_template_cell(template, cell_ref)
            if removed_count <= 0:
                return _fail("未找到需要删除的课表格子")
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {
                "success": True,
                "message": "课表格子已删除",
                "deletedCount": removed_count,
                "version": (saved.get("_meta") or {}).get("version"),
            }

        if proposal_type == "swap_courses":
            course1 = proposal.get("course1") or {}
            course2 = proposal.get("course2") or {}
            date1 = course1.get("date")
            date2 = course2.get("date")
            if not date1 or not date2:
                return _fail("交换课程缺少日期信息")
            schedule1 = (data.get("schedules") or {}).get(date1)
            schedule2 = (data.get("schedules") or {}).get(date2)
            if not schedule1 or not schedule2:
                return _fail("交换课程所需的日期安排不存在")
            index1, slot1 = _find_course_slot(schedule1, date1, course1)
            index2, slot2 = _find_course_slot(schedule2, date2, course2)
            if slot1 is None or slot2 is None:
                return _fail("未找到需要交换的课程")
            schedule1["timeSlots"][index1] = dict(slot2)
            schedule2["timeSlots"][index2] = dict(slot1)
            schedule1["timeSlots"].sort(key=lambda item: item["time"])
            schedule2["timeSlots"].sort(key=lambda item: item["time"])
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {
                "success": True,
                "message": "课程交换已完成",
                "modifiedCount": 2,
                "version": (saved.get("_meta") or {}).get("version"),
            }

        if proposal_type == "adjust_schedule_by_week":
            logger.warning(
                "[Approve] Unsupported proposal type adjust_schedule_by_week: source=%s target=%s",
                proposal.get("sourceDate"),
                proposal.get("targetDate"),
            )
            return _fail("暂不支持按周调整课表，请改用修改课程或模板应用。", code="PROPOSAL_UNSUPPORTED")

        if proposal_type == "import_course_schedule":
            logger.warning("[Approve] Unsupported proposal type import_course_schedule")
            return _fail("暂不支持通过审批直接导入课表文本，请改用创建课表或手动录入。", code="PROPOSAL_UNSUPPORTED")

        if proposal_type == "batch_manage_courses":
            operation = proposal.get("operation")
            if operation == "delete_multiple":
                course_refs = proposal.get("courses") or []
                if not course_refs:
                    return _fail("批量删除课程缺少 courses 参数")
                schedules = data.get("schedules") or {}
                removed_count = 0
                affected_dates = set()
                removed_names = []
                for date_key, schedule in schedules.items():
                    before = len(schedule.get("timeSlots") or [])
                    schedule["timeSlots"] = [
                        slot for slot in (schedule.get("timeSlots") or [])
                        if not any(
                            _course_ref_matches(date_key, slot, ref)
                            for ref in course_refs
                        )
                    ]
                    removed_here = before - len(schedule["timeSlots"])
                    if removed_here:
                        removed_count += removed_here
                        affected_dates.add(date_key)
                        for ref in course_refs:
                            ref_name = ref.get("name") or ref.get("courseName")
                            if ref_name and ref_name not in removed_names:
                                removed_names.append(ref_name)
                if removed_count == 0:
                    return _fail("未找到需要移除的课程")
                saved = _write_schedule_data(data, expected_version=expected_version)
                return {
                    "success": True,
                    "message": f"已批量移除 {removed_count} 条课程安排",
                    "deletedCount": removed_count,
                    "affectedDates": sorted(affected_dates),
                    "removedCourses": removed_names,
                    "version": (saved.get("_meta") or {}).get("version"),
                }
            logger.warning("[Approve] Unsupported batch_manage_courses operation: %s", operation)
            return _fail(f"暂不支持批量课程操作：{operation or 'unknown'}", code="PROPOSAL_UNSUPPORTED")

        if proposal_type == "apply_template":
            template_name = proposal.get("templateName")
            target_date = proposal.get("targetDate")
            template = proposal.get("templateData")
            if not isinstance(template, dict):
                template = next(
                    (
                        item for item in (data.get("scheduleTemplates") or [])
                        if isinstance(item, dict) and item.get("name") == template_name
                    ),
                    None,
                )
            if not isinstance(template, dict):
                return _fail(f"模板“{template_name}”不存在")
            existing_schedule = (data.get("schedules") or {}).get(
                target_date,
                {"title": "", "highlights": "", "milestone": "", "timeSlots": [], "tasks": []},
            )
            updated_schedule, added_count, error = _apply_template_to_date(existing_schedule, template, target_date)
            if error:
                return _fail(error)
            data.setdefault("schedules", {})[target_date] = updated_schedule
            saved = _write_schedule_data(data, expected_version=expected_version)
            return {
                "success": True,
                "message": f"已将模板“{template_name}”应用到 {target_date}",
                "addedCount": added_count,
                "version": (saved.get("_meta") or {}).get("version"),
            }

        # Generic schedule modification
        date = proposal.get("date")
        existing = (data.get("schedules") or {}).get(date, {
            "title": "", "highlights": "", "milestone": "", "timeSlots": [], "tasks": [],
        })
        operation = proposal.get("operation", "modify")

        if operation == "delete_slots" and proposal.get("timeSlots"):
            slots_to_delete = proposal["timeSlots"]
            before_count = len(existing.get("timeSlots") or [])
            existing["timeSlots"] = [
                s for s in (existing.get("timeSlots") or [])
                if not any(
                    _slot_matches(s, d)
                    for d in slots_to_delete
                )
            ]
            deleted_count = before_count - len(existing.get("timeSlots") or [])
            if deleted_count <= 0:
                return _fail("未找到需要删除的日程项")
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
                if _slot_matches(s, target):
                    matched_any = True
                    updated_slots.append(_apply_changes(s))
                else:
                    updated_slots.append(s)

            if not matched_any:
                logger.warning("[Approve] modify_slot/update target not found: target=%s, date=%s, activities=%s",
                               target, date, [s.get("activity") for s in (existing.get("timeSlots") or [])])
                return _fail("未找到需要修改的日程项")

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
                if _slot_matches(s, target):
                    matched_any = True
                    updated_slots.append(new_slot)
                else:
                    updated_slots.append(s)

            if not matched_any:
                logger.warning("[Approve] replace_slot target not found: target=%s, date=%s", target, date)
                return _fail("未找到需要替换的日程项")

            existing["timeSlots"] = updated_slots
            existing["timeSlots"].sort(key=lambda x: x["time"])
            existing["highlights"] = f"已替换: {target} -> {new_activity}"
        elif operation == "general_adjustment":
            if proposal.get("title"):
                existing["title"] = proposal["title"]
            if proposal.get("changes"):
                existing["highlights"] = "; ".join(proposal["changes"])
        else:
            logger.warning("[Approve] Unsupported modify_schedule operation: %s", operation)
            return _fail(f"未实现的日程提案操作: {operation}", code="PROPOSAL_UNSUPPORTED")

        data.setdefault("schedules", {})[date] = existing
        saved = _write_schedule_data(data, expected_version=expected_version)
        return {"success": True, "message": "日程修改已应用", "version": (saved.get("_meta") or {}).get("version")}

    except Exception as e:
        logger.error("[Approve] Error: %s", e)
        return _fail(_safe_error_message(e))


def _generate_react_log(messages, full=False):
    react_log = ""
    has_tool_calls = False
    question = ""
    step_count = 0

    def _single_line(text):
        return re.sub(r"\s+", " ", text or "").strip()

    thoughts_map = {
        "web_search_evaluate": "用户需要搜索相关信息，我将搜索相关资料来获取信息。",
        "view_schedule": "我需要先查看相关日期的日程安排，了解当前的时间占用情况。",
        "add_schedule": "根据分析结果，我将为用户安排新的日程时段。",
        "estimate_task_time": "在规划之前，我需要估算这个任务大概需要多长时间；如果信息不够，只补问少量高影响问题。",
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

                thought = _single_line(msg.get("reasoning_content")) or thoughts_map.get(
                    tool_name,
                    f"我需要使用 {tool_name} 工具来完成这个步骤。"
                )

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
                        react_log += f"Observation: {truncated}\n"

                        # verify_changes 工具的 Observation 后追加 Self-Check 段
                        if tool_name == "verify_changes":
                            try:
                                sc_payload = json.loads(result) if isinstance(result, str) else result
                            except (json.JSONDecodeError, TypeError):
                                sc_payload = {}
                            if isinstance(sc_payload, dict):
                                passed = bool(sc_payload.get("passed"))
                                pc = int(sc_payload.get("passed_count", 0))
                                tc_total = int(sc_payload.get("total_count", 0))
                                state_icon = "✅" if passed else "⚠️"
                                state_label = f"{pc}/{tc_total} 项通过" if passed else f"{pc}/{tc_total} 项未通过"
                                react_log += f"Self-Check: {state_icon} {state_label}\n"
                                for asm in (sc_payload.get("assertions") or []):
                                    icon = "✓" if asm.get("pass") else "✗"
                                    key = asm.get("key", "")
                                    expected = asm.get("expected")
                                    actual = asm.get("actual")
                                    slot = asm.get("slotKey") or ""
                                    date_str = asm.get("date") or ""
                                    prefix = f"  - [{icon}]"
                                    if date_str:
                                        prefix += f" {date_str}"
                                    if slot:
                                        prefix += f" {slot}"
                                    prefix += f" {key}:"
                                    react_log += f"{prefix} expected={json.dumps(expected, ensure_ascii=False)} actual={json.dumps(actual, ensure_ascii=False)}\n"
                                    reason = asm.get("reason")
                                    if reason and not asm.get("pass"):
                                        react_log += f"      reason: {reason}\n"
                        react_log += "\n"
                        break

        if msg.get("role") == "assistant" and msg.get("content") and not msg.get("tool_calls"):
            if has_tool_calls:
                final_thought = _single_line(msg.get("reasoning_content")) or "我已经获得了所需的信息，可以给出最终答案了。"
                react_log += f"Thought: {final_thought}\n"
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
        expected_version = ((data.get("_meta") or {}).get("version")) if isinstance(data, dict) else None
        saved = _write_schedule_data(data, expected_version=expected_version if isinstance(expected_version, int) else None)
        return JSONResponse({"success": True, "version": (saved.get("_meta") or {}).get("version")})
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=409)
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
        expected_version = ((body.get("_meta") or {}).get("version")) if isinstance(body, dict) else None
        history_data = {
            "userProfile": body.get("profile") or body.get("userProfile") or {},
            "conversations": body.get("conversations") or [],
            "archivedConversations": body.get("archivedConversations") or [],
            "lastUpdate": body.get("lastUpdate", ""),
            "_compressActive": False,
        }
        compressed = _archive_and_compress(history_data)
        compressed["lastUpdate"] = datetime.now().isoformat()
        saved = _write_agent_history(compressed, expected_version=expected_version if isinstance(expected_version, int) else None)
        return JSONResponse({"success": True, "version": (saved.get("_meta") or {}).get("version")})
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=409)
    except Exception as e:
        logger.error("[Agent Save] Error: %s", e)
        return JSONResponse({"error": _safe_error_message(e)}, status_code=500)


@app.post("/api/agent-approve")
async def agent_approve(request: Request):
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "无效的JSON"}, status_code=400)

    proposal_token = data.get("proposalToken") or data.get("approvalToken")
    if not proposal_token and isinstance(data.get("proposal"), dict):
        proposal_token = data["proposal"].get("approvalToken")
    if not proposal_token and isinstance(data, dict) and "approvalToken" in data:
        proposal_token = data.get("approvalToken")
    if not isinstance(proposal_token, str) or not proposal_token:
        return JSONResponse({"success": False, "message": "缺少服务端可信 proposal 标识"}, status_code=400)

    try:
        result = _approve_schedule_proposal(proposal_token)
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
        return JSONResponse({
            "success": False,
            "message": "DeepSeek API Key 未配置，请在config.json中设置有效的API密钥。",
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
                "message": f"连接成功！DeepSeek API 密钥有效。模型：{model_name}",
            })
        elif response.status_code == 401:
            return JSONResponse({
                "success": False,
                "message": "认证失败 (401)。请检查 DeepSeek API Key 是否正确配置。",
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
    config_doc = normalize_config_document(_read_json_file(paths.get_config_path(), {}))
    return JSONResponse({
        "model": _get_current_model_name(),
        "port": PORT,
        "host": HOST,
        "hasApiKey": bool(api_key and not api_key.startswith("YOUR_")),
        "_meta": config_doc.get("_meta", {}),
    })


@app.post("/api/config")
async def update_config(request: Request):
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": "无效的JSON"}, status_code=400)

    try:
        allow_sensitive = (
            request.headers.get("x-planmosaic-internal-config") == "1"
            and bool(data.get("allowSensitive"))
        )
        expected_version = ((data.get("_meta") or {}).get("version")) if isinstance(data, dict) else None
        patch = build_config_patch(data, allow_sensitive=allow_sensitive, is_production=is_production)
        with WRITE_LOCKS["config"]:
            config_path = paths.get_config_path()
            current_config = normalize_config_document(_read_json_file(config_path, {}))
            current_version = (current_config.get("_meta") or {}).get("version", 0)
            if isinstance(expected_version, int) and current_version != expected_version:
                return JSONResponse({"error": "配置版本冲突，请重新加载设置"}, status_code=409)
            next_config = merge_config_documents(current_config, patch)
            next_config = normalize_config_document(next_config)
            validate_config_document(next_config)
            next_config["_meta"]["version"] = current_version + 1
            next_config["_meta"]["updatedAt"] = now_iso()
            _write_json_file_atomic(config_path, next_config)
        app_config.load()
        return JSONResponse({"success": True, "version": next_config["_meta"]["version"]})
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/active-username")
async def set_active_username_endpoint(request: Request):
    """动态更新当前活跃用户名（Electron 登录/切换账号时调用），并立即重新加载 config。
    接受 JSON body: {"username": "<name>" | null}
    - 传合法字符串：设置活跃用户，重新加载对应子目录的 config.json
    - 传 null：清空活跃用户，回退到根目录 config.json
    - 非法用户名（空字符串、超长、含非法字符）：返回 400，不改变 _active_username
    """
    try:
        data = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"success": False, "error": "无效的JSON"}, status_code=400)

    if not isinstance(data, dict):
        return JSONResponse({"success": False, "error": "Body 必须是对象"}, status_code=400)

    username = data.get("username")  # 可能为 None（登出）或字符串
    if username is not None and not isinstance(username, str):
        return JSONResponse({"success": False, "error": "username 必须是字符串或 null"}, status_code=400)

    # 验证：空字符串视为 null（登出场景）；非法格式直接拒绝
    if isinstance(username, str) and username.strip() == "":
        username = None

    if username is None:
        # 登出场景：直接清空活跃用户
        paths._active_username = None
        result = None
    else:
        result = paths.set_active_username(username)
        if result is None:
            return JSONResponse({"success": False, "error": "Invalid username format"}, status_code=400)

    # 立即重新加载 config，使新用户名对应的子目录 config 生效
    try:
        app_config.load()
    except Exception as e:
        logger.error("[ActiveUsername] Failed to reload config: %s", e)
        return JSONResponse({"success": False, "error": f"重新加载 config 失败: {e}"}, status_code=500)

    config_path = paths.get_config_path() or ""
    logger.info("[ActiveUsername] Switched to user=%s, configPath=%s", result, config_path)
    return JSONResponse({
        "success": True,
        "username": result,
        "configPath": config_path,
    })


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
    seen_incomplete_tasks = set()

    def _append_incomplete_task(task, task_type="task"):
        if not isinstance(task, dict) or task.get("completed") is True:
            return
        key = (task_type, task.get("name", ""), str(task.get("estimated", 0)))
        if key in seen_incomplete_tasks:
            return
        seen_incomplete_tasks.add(key)
        yesterday_incomplete_tasks.append({
            "name": task.get("name", ""),
            "estimated": task.get("estimated", 0),
            "type": task_type,
        })

    if schedule_data.get("tasks") and schedule_data["tasks"].get(yesterday):
        for task in schedule_data["tasks"][yesterday]:
            _append_incomplete_task(task, "task")
    yesterday_schedule = (schedule_data.get("schedules") or {}).get(yesterday) or {}
    for task in (yesterday_schedule.get("tasks") or []):
        _append_incomplete_task(task, "task")
    if schedule_data.get("bigTasks"):
        for bt in schedule_data["bigTasks"]:
            if bt.get("completed"):
                continue
            task_type = bt.get("type", "")
            if task_type == "short":
                if bt.get("ddl") == yesterday:
                    _append_incomplete_task(bt, "big_task")
            elif task_type == "long":
                start_date = bt.get("startDate", "")
                ddl = bt.get("ddl", "")
                if start_date and ddl and start_date <= yesterday <= ddl:
                    _append_incomplete_task(bt, "big_task")

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


@app.get("/api/schedule")
@app.post("/api/schedule")
async def api_schedule(request: Request):
    """
    通用日程端点。
    - GET 无参：返回完整 schedule-data
    - GET/POST 带 date：返回指定日期的日程
    """
    try:
        date = None
        if request.method == "POST":
            try:
                body = await request.json()
                date = body.get("date")
            except json.JSONDecodeError:
                pass
        else:
            date = request.query_params.get("date")

        schedule_data = _read_schedule_data()
        if date:
            schedules = schedule_data.get("schedules") or {}
            day_schedule = schedules.get(date, {"timeSlots": [], "todos": [], "courses": []})
            return JSONResponse({
                "success": True,
                "date": date,
                "schedule": day_schedule,
            })
        return JSONResponse({
            "success": True,
            "schedule": schedule_data,
        })
    except Exception as e:
        logger.error("[API Schedule] Error: %s", e)
        return JSONResponse({"success": False, "error": _safe_error_message(e)}, status_code=500)


@app.get("/api/courses")
async def api_courses():
    """
    返回所有课表（schedules 字典 + bigTasks）。
    前端 scheduleEditorModal 用此端点加载课表管理数据。
    """
    try:
        schedule_data = _read_schedule_data()
        schedules = schedule_data.get("schedules") or {}
        def _extract_slot_time(slot):
            start_time = slot.get("startTime") or slot.get("start")
            end_time = slot.get("endTime") or slot.get("end")
            raw_time = slot.get("time") or ""
            if (not start_time or not end_time) and isinstance(raw_time, str) and "-" in raw_time:
                start_time, end_time = [part.strip() for part in raw_time.split("-", 1)]
            return start_time or "", end_time or "", raw_time

        def _extract_course_detail(slot):
            detail = slot.get("detail") or ""
            if not isinstance(detail, str):
                detail = ""
            parts = [part.strip() for part in detail.split(" * ")] if detail else []
            while len(parts) < 3:
                parts.append("")
            return detail, parts[0], parts[1], parts[2]

        courses = []
        for date, sch in schedules.items():
            for slot in (sch.get("timeSlots") or []):
                start_time, end_time, raw_time = _extract_slot_time(slot)
                name = slot.get("name") or slot.get("title") or slot.get("courseName") or slot.get("activity") or ""
                detail, location, teacher, weeks = _extract_course_detail(slot)
                is_course_like = (
                    slot.get("type") == "course"
                    or slot.get("isCourse")
                    or bool(slot.get("courseName"))
                    or bool(slot.get("activity") and (slot.get("time") or start_time or end_time))
                )
                if not is_course_like:
                    continue
                courses.append({
                    "date": date,
                    "startTime": start_time,
                    "endTime": end_time,
                    "time": raw_time or (f"{start_time}-{end_time}" if start_time and end_time else ""),
                    "name": name,
                    "activity": slot.get("activity") or name,
                    "location": slot.get("location") or location,
                    "teacher": slot.get("teacher") or teacher,
                    "weeks": slot.get("weeks") or weeks,
                    "detail": detail,
                })
        return JSONResponse({
            "success": True,
            "courses": courses,
            "schedules": schedules,
            "count": len(courses),
        })
    except Exception as e:
        logger.error("[API Courses] Error: %s", e)
        return JSONResponse({"success": False, "error": _safe_error_message(e)}, status_code=500)


@app.get("/api/tasks")
async def api_tasks():
    """
    返回所有大任务（bigTasks）。
    前端任务栏组件用此端点获取任务列表。
    """
    try:
        schedule_data = _read_schedule_data()
        big_tasks = schedule_data.get("bigTasks") or []
        return JSONResponse({
            "success": True,
            "tasks": big_tasks,
            "count": len(big_tasks),
        })
    except Exception as e:
        logger.error("[API Tasks] Error: %s", e)
        return JSONResponse({"success": False, "error": _safe_error_message(e)}, status_code=500)


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


def _write_port_file(actual_host, actual_port):
    """Write the actual bound (host, port) to a file so the Electron main process
    can discover the chosen port when auto-fallback was needed."""
    try:
        port_path = paths.get_port_info_path()
        if port_path is None:
            return
        os.makedirs(os.path.dirname(port_path), exist_ok=True)
        with open(port_path, "w", encoding="utf-8") as f:
            json.dump({"host": actual_host, "port": actual_port, "ts": datetime.now().isoformat()}, f)
    except OSError as e:
        logger.warning("[Server] Failed to write port info file: %s", e)


def _find_free_port(preferred_host, preferred_port, max_tries=20):
    """Try to bind to (preferred_host, preferred_port). If busy, scan forward
    for the next available port. Returns (host, port) that is free, or None."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind((preferred_host, preferred_port))
        s.close()
        return preferred_host, preferred_port
    except OSError:
        s.close()
    for offset in range(1, max_tries + 1):
        candidate = preferred_port + offset
        if candidate > 65535:
            break
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((preferred_host, candidate))
            s.close()
            return preferred_host, candidate
        except OSError:
            s.close()
            continue
    return None


if __name__ == "__main__":
    import socket
    import uvicorn

    chosen = _find_free_port(HOST, PORT)
    if chosen is None:
        logger.error("[Server] No free port found near %d on %s", PORT, HOST)
        raise SystemExit(1)
    actual_host, actual_port = chosen
    if actual_port != PORT:
        logger.warning("[Server] Port %d busy, falling back to %d on %s", PORT, actual_port, actual_host)
    else:
        logger.info("[Server] Binding to %s:%d", actual_host, actual_port)

    _write_port_file(actual_host, actual_port)

    uvicorn.run(
        "backend.server:app",
        host=actual_host,
        port=actual_port,
        log_level="info",
    )
