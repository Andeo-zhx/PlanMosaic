import base64
import copy
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlparse


SCHEDULE_SCHEMA_VERSION = 2
HISTORY_SCHEMA_VERSION = 2
CONFIG_SCHEMA_VERSION = 2
PROPOSAL_TOKEN_VERSION = 1
PROPOSAL_TTL_SECONDS = 15 * 60

WRITE_LOCKS = {
    "schedule": threading.Lock(),
    "history": threading.Lock(),
    "config": threading.Lock(),
}

APPROVABLE_PROPOSAL_TYPES = {
    "batch_delete_schedule",
    "batch_modify_schedules",
    "manage_schedule_delete",
    "update_task",
    "delete_task",
    "batch_delete_tasks",
    "update_big_task",
    "delete_big_task",
    "batch_delete_big_tasks",
    "modify_schedule",
    "modify_course",
    "modify_template_course",
    "remove_course",
    "remove_template_course",
    "swap_courses",
    "adjust_schedule_by_week",
    "import_course_schedule",
    "batch_manage_courses",
    "apply_template",
}

SENSITIVE_CONFIG_PATHS = {
    ("api", "deepseek", "baseUrl"),
    ("server", "host"),
    ("server", "port"),
    ("security", "rejectUnauthorized"),
}

SAFE_CONFIG_PATHS = {
    ("api", "deepseek", "key"),
    ("api", "deepseek", "model"),
    ("timeouts", "apiTimeoutMs"),
}

_PROPOSAL_SECRET = (
    os.environ.get("PLANMOSAIC_CONTROL_TOKEN")
    or os.environ.get("PLANMOSAIC_PROPOSAL_SECRET")
    or secrets.token_hex(32)
).encode("utf-8")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _clone(value):
    return copy.deepcopy(value)


def _ensure_meta(document, *, schema_version, base_version=None):
    current_meta = document.get("_meta") if isinstance(document.get("_meta"), dict) else {}
    current_version = current_meta.get("version")
    if not isinstance(current_version, int) or current_version < 0:
        current_version = 0
    if isinstance(base_version, int) and base_version >= 0:
        current_version = base_version
    document["_meta"] = {
        "schemaVersion": schema_version,
        "version": current_version,
        "updatedAt": current_meta.get("updatedAt") if isinstance(current_meta.get("updatedAt"), str) else "",
    }
    return document


def _as_string(value, default=""):
    if value is None:
        return default
    return str(value)


def _as_bool(value):
    return value is True


def _as_int(value, default=0):
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)
    return default


def _normalize_course_info(source):
    if not isinstance(source, dict):
        return {}
    normalized = {}
    name = _as_string(source.get("name") or source.get("courseName") or source.get("course_name"))
    if name:
        normalized["name"] = name
    weekday = source.get("weekday")
    if isinstance(weekday, (int, float)) and not isinstance(weekday, bool):
        normalized["weekday"] = int(weekday)
    elif isinstance(weekday, str):
        stripped = weekday.strip()
        if stripped.lstrip("-").isdigit():
            normalized["weekday"] = int(stripped)
    time_value = _as_string(source.get("time"))
    if time_value:
        normalized["time"] = time_value
    date_value = _as_string(source.get("date"))
    if date_value:
        normalized["date"] = date_value
    for key in ("location", "teacher", "weeks", "detail", "icon"):
        value = _as_string(source.get(key))
        if value:
            normalized[key] = value
    merge_span = source.get("mergeSpan") if "mergeSpan" in source else source.get("merge_span")
    merge_span = _as_int(merge_span, 0)
    if merge_span > 0:
        normalized["mergeSpan"] = merge_span
    return normalized


def _normalize_schedule_details(source):
    if not isinstance(source, dict):
        return {}
    normalized = {}
    for key in ("time", "activity", "detail", "icon"):
        value = _as_string(source.get(key))
        if value:
            normalized[key] = value
    return normalized


def _normalize_template_course_cell(source):
    if not isinstance(source, dict):
        return {}
    normalized = {}
    template_name = _as_string(source.get("templateName") or source.get("template_name"))
    if template_name:
        normalized["templateName"] = template_name
    week_type = _as_string(source.get("weekType") or source.get("week_type")).lower()
    if week_type in {"odd", "even", "all"}:
        normalized["weekType"] = week_type
    weekday = source.get("weekday")
    if isinstance(weekday, (int, float)) and not isinstance(weekday, bool):
        normalized["weekday"] = int(weekday)
    elif isinstance(weekday, str):
        stripped = weekday.strip()
        if stripped.lstrip("-").isdigit():
            normalized["weekday"] = int(stripped)
    section_start = _as_int(source.get("sectionStart") or source.get("section_start") or source.get("section"), 0)
    section_end = _as_int(source.get("sectionEnd") or source.get("section_end"), 0)
    merge_span = _as_int(source.get("mergeSpan") or source.get("merge_span"), 0)
    if section_start > 0:
        normalized["sectionStart"] = section_start
        if section_end <= 0:
            section_end = section_start
    if section_end > 0:
        normalized["sectionEnd"] = max(section_end, normalized.get("sectionStart", section_end))
    elif merge_span > 0 and normalized.get("sectionStart", 0) > 0:
        normalized["sectionEnd"] = normalized["sectionStart"] + merge_span - 1
    if merge_span > 0:
        normalized["mergeSpan"] = merge_span
    elif normalized.get("sectionStart") and normalized.get("sectionEnd"):
        normalized["mergeSpan"] = normalized["sectionEnd"] - normalized["sectionStart"] + 1
    course_name = _as_string(source.get("courseName") or source.get("course_name") or source.get("name"))
    if course_name:
        normalized["courseName"] = course_name
    for key, aliases in {
        "location": ("location",),
        "teacher": ("teacher",),
        "note": ("note", "remark", "remarks"),
    }.items():
        value = ""
        for alias in aliases:
            value = _as_string(source.get(alias))
            if value:
                break
        if value:
            normalized[key] = value
    return normalized


def _normalize_schedule_criteria(source):
    if not isinstance(source, dict):
        return {}
    normalized = {}
    for key in ("keyword", "day_of_week", "activity", "date"):
        value = _as_string(source.get(key))
        if value:
            normalized[key] = value
    return normalized


def _is_yyyy_mm_dd(value):
    if not isinstance(value, str):
        return False
    if len(value) != 10:
        return False
    return value[4] == "-" and value[7] == "-" and value[:4].isdigit() and value[5:7].isdigit() and value[8:10].isdigit()


def normalize_time_estimation_meta(source):
    meta = source if isinstance(source, dict) else {}
    structured = meta.get("structuredFeatures")
    if not isinstance(structured, dict):
        structured = meta.get("structured_features")
    structured = structured if isinstance(structured, dict) else {}

    normalized = {
        "category": _as_string(meta.get("category")),
        "context": _as_string(meta.get("context")),
        "structuredFeatures": {
            "difficulty": _as_int(structured.get("difficulty", meta.get("difficulty")), 0),
            "familiarity": _as_int(structured.get("familiarity", meta.get("familiarity")), 0),
            "steps_count": _as_int(structured.get("steps_count", meta.get("steps_count")), 0),
            "deadline_pressure": _as_int(structured.get("deadline_pressure", meta.get("deadline_pressure")), 0),
            "output_type": _as_string(structured.get("output_type", meta.get("output_type"))),
        },
        "estimatedMinutes": _as_int(meta.get("estimatedMinutes", meta.get("estimated_minutes")), 0),
        "estimatedAt": _as_string(meta.get("estimatedAt") or meta.get("estimated_at")),
        "source": _as_string(meta.get("source")),
    }

    if not any([
        normalized["category"],
        normalized["context"],
        normalized["estimatedMinutes"] > 0,
        any([
            normalized["structuredFeatures"]["difficulty"] > 0,
            normalized["structuredFeatures"]["familiarity"] > 0,
            normalized["structuredFeatures"]["steps_count"] > 0,
            normalized["structuredFeatures"]["deadline_pressure"] > 0,
            normalized["structuredFeatures"]["output_type"],
        ]),
    ]):
        return None
    return normalized


def normalize_task_item(item):
    source = item if isinstance(item, dict) else {}
    time_estimation = normalize_time_estimation_meta(
        source.get("timeEstimation") if isinstance(source.get("timeEstimation"), dict) else source.get("time_estimation")
    )
    return {
        "name": _as_string(source.get("name") or source.get("task_name")),
        "estimated": _as_string(source.get("estimated"), _as_string(source.get("estimated_minutes"), "0")),
        "actual": _as_string(source.get("actual"), _as_string(source.get("actual_minutes"), "")),
        "completed": _as_bool(source.get("completed")),
        "startTime": _as_string(source.get("startTime") or source.get("start_time")),
        "endTime": _as_string(source.get("endTime") or source.get("end_time")),
        "note": _as_string(source.get("note")),
        "timeEstimation": time_estimation,
    }


def normalize_big_task_item(item):
    source = item if isinstance(item, dict) else {}
    task_type = source.get("type")
    if not isinstance(task_type, str) or task_type not in {"short", "long"}:
        task_type = source.get("taskType")
    if not isinstance(task_type, str) or task_type not in {"short", "long"}:
        task_type = source.get("task_type")
    if not isinstance(task_type, str) or task_type not in {"short", "long"}:
        task_type = "short"

    estimated = source.get("estimated")
    if estimated in (None, ""):
        estimated = source.get("estimated_minutes")

    return {
        "name": _as_string(source.get("name") or source.get("task_name")),
        "estimated": _as_int(estimated, 0),
        "ddl": _as_string(source.get("ddl")),
        "startDate": _as_string(source.get("startDate") or source.get("start_date")),
        "note": _as_string(source.get("note")),
        "type": task_type,
        "completed": _as_bool(source.get("completed")),
        "createdAt": _as_string(source.get("createdAt") or source.get("created_at")),
        "completedAt": _as_string(source.get("completedAt") or source.get("completed_at")),
    }


def normalize_schedule_data(data):
    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise ValueError("日程数据必须是对象")

    normalized = dict(data)
    normalized["startDate"] = _as_string(data.get("startDate"))
    normalized["endDate"] = _as_string(data.get("endDate"))
    normalized["settings"] = data.get("settings") if isinstance(data.get("settings"), dict) else {}
    normalized["userProfile"] = data.get("userProfile") if isinstance(data.get("userProfile"), dict) else {}
    normalized["bigTaskHistory"] = data.get("bigTaskHistory") if isinstance(data.get("bigTaskHistory"), list) else []
    normalized["scheduleTemplates"] = data.get("scheduleTemplates") if isinstance(data.get("scheduleTemplates"), list) else []

    raw_schedules = data.get("schedules")
    schedules = {}
    if isinstance(raw_schedules, dict):
        for date_key, schedule in raw_schedules.items():
            if not isinstance(date_key, str):
                continue
            schedule = schedule if isinstance(schedule, dict) else {}
            schedules[date_key] = {
                "title": _as_string(schedule.get("title")),
                "highlights": _as_string(schedule.get("highlights")),
                "milestone": _as_string(schedule.get("milestone")),
                "timeSlots": schedule.get("timeSlots") if isinstance(schedule.get("timeSlots"), list) else [],
                "tasks": [normalize_task_item(task) for task in (schedule.get("tasks") or []) if isinstance(task, dict)],
            }
    normalized["schedules"] = schedules

    raw_tasks = data.get("tasks")
    tasks = {}
    if isinstance(raw_tasks, dict):
        for date_key, task_list in raw_tasks.items():
            if isinstance(date_key, str) and isinstance(task_list, list):
                tasks[date_key] = [normalize_task_item(task) for task in task_list if isinstance(task, dict)]
    normalized["tasks"] = tasks

    normalized["bigTasks"] = [normalize_big_task_item(task) for task in (data.get("bigTasks") or []) if isinstance(task, dict)]
    return _ensure_meta(normalized, schema_version=SCHEDULE_SCHEMA_VERSION)


def validate_schedule_data(data):
    if not isinstance(data, dict):
        raise ValueError("日程数据必须是对象")
    for key in ("schedules", "tasks"):
        if not isinstance(data.get(key), dict):
            raise ValueError(f"日程数据字段 {key} 必须是对象")
    for key in ("bigTasks", "bigTaskHistory", "scheduleTemplates"):
        if not isinstance(data.get(key), list):
            raise ValueError(f"日程数据字段 {key} 必须是数组")
    meta = data.get("_meta")
    if not isinstance(meta, dict) or not isinstance(meta.get("version"), int):
        raise ValueError("日程数据缺少有效版本信息")


def normalize_history_data(data):
    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise ValueError("历史数据必须是对象")
    normalized = {
        "userProfile": data.get("userProfile") if isinstance(data.get("userProfile"), dict) else {},
        "conversations": data.get("conversations") if isinstance(data.get("conversations"), list) else [],
        "archivedConversations": data.get("archivedConversations") if isinstance(data.get("archivedConversations"), list) else [],
        "lastUpdate": _as_string(data.get("lastUpdate")),
    }
    return _ensure_meta(normalized, schema_version=HISTORY_SCHEMA_VERSION)


def validate_history_data(data):
    if not isinstance(data, dict):
        raise ValueError("历史数据必须是对象")
    if not isinstance(data.get("userProfile"), dict):
        raise ValueError("历史数据字段 userProfile 必须是对象")
    if not isinstance(data.get("conversations"), list):
        raise ValueError("历史数据字段 conversations 必须是数组")
    if not isinstance(data.get("archivedConversations"), list):
        raise ValueError("历史数据字段 archivedConversations 必须是数组")
    meta = data.get("_meta")
    if not isinstance(meta, dict) or not isinstance(meta.get("version"), int):
        raise ValueError("历史数据缺少有效版本信息")


def normalize_config_document(data):
    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise ValueError("配置必须是对象")

    api = data.get("api") if isinstance(data.get("api"), dict) else {}
    deepseek = api.get("deepseek") if isinstance(api.get("deepseek"), dict) else {}
    security = data.get("security") if isinstance(data.get("security"), dict) else {}
    timeouts = data.get("timeouts") if isinstance(data.get("timeouts"), dict) else {}
    server = data.get("server") if isinstance(data.get("server"), dict) else {}

    normalized = {
        "api": {
            "deepseek": {
                "key": _as_string(deepseek.get("key")),
                "baseUrl": _as_string(deepseek.get("baseUrl"), "https://api.deepseek.com/v1/chat/completions"),
                "model": _as_string(deepseek.get("model"), "deepseek-v4-flash"),
            }
        },
        "security": {
            "rejectUnauthorized": True if security.get("rejectUnauthorized") is not False else False,
        },
        "timeouts": {
            "apiTimeoutMs": _as_int(timeouts.get("apiTimeoutMs"), 30000),
        },
        "server": {
            "host": _as_string(server.get("host"), "127.0.0.1"),
            "port": _as_int(server.get("port"), 8080),
        },
    }
    return _ensure_meta(normalized, schema_version=CONFIG_SCHEMA_VERSION)


def _validate_base_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("baseUrl 必须使用 http 或 https")
    if not parsed.netloc:
        raise ValueError("baseUrl 缺少主机名")


def validate_config_document(data):
    if not isinstance(data, dict):
        raise ValueError("配置必须是对象")
    deepseek = (((data.get("api") or {}).get("deepseek")) or {})
    if not isinstance(deepseek.get("key"), str):
        raise ValueError("api.deepseek.key 必须是字符串")
    if not isinstance(deepseek.get("model"), str) or not deepseek.get("model").strip():
        raise ValueError("api.deepseek.model 必须是非空字符串")
    if not isinstance(deepseek.get("baseUrl"), str) or not deepseek.get("baseUrl").strip():
        raise ValueError("api.deepseek.baseUrl 必须是非空字符串")
    _validate_base_url(deepseek.get("baseUrl"))

    timeout_ms = ((data.get("timeouts") or {}).get("apiTimeoutMs"))
    if not isinstance(timeout_ms, int) or timeout_ms <= 0:
        raise ValueError("timeouts.apiTimeoutMs 必须是正整数")

    reject_unauthorized = ((data.get("security") or {}).get("rejectUnauthorized"))
    if not isinstance(reject_unauthorized, bool):
        raise ValueError("security.rejectUnauthorized 必须是布尔值")

    server = data.get("server") or {}
    if not isinstance(server.get("host"), str) or not server.get("host").strip():
        raise ValueError("server.host 必须是非空字符串")
    if not isinstance(server.get("port"), int) or not (1 <= server.get("port") <= 65535):
        raise ValueError("server.port 必须是 1-65535 之间的整数")

    meta = data.get("_meta")
    if not isinstance(meta, dict) or not isinstance(meta.get("version"), int):
        raise ValueError("配置缺少有效版本信息")


def _flatten_allowed_config_paths(allow_sensitive=False, is_production=False):
    allowed = set(SAFE_CONFIG_PATHS)
    if allow_sensitive and not is_production:
        allowed.update(SENSITIVE_CONFIG_PATHS)
    return allowed


def build_config_patch(patch, *, allow_sensitive=False, is_production=False):
    if not isinstance(patch, dict):
        raise ValueError("配置更新必须是对象")

    allowed_paths = _flatten_allowed_config_paths(allow_sensitive=allow_sensitive, is_production=is_production)
    sanitized = {}

    def set_path(target, path_parts, value):
        cursor = target
        for part in path_parts[:-1]:
            cursor = cursor.setdefault(part, {})
        cursor[path_parts[-1]] = value

    proposed_paths = []
    for root_key in ("api", "timeouts", "server", "security"):
        value = patch.get(root_key)
        if not isinstance(value, dict):
            continue
        if root_key == "api":
            deepseek = value.get("deepseek")
            if not isinstance(deepseek, dict):
                continue
            for leaf in ("key", "model", "baseUrl"):
                if leaf in deepseek:
                    proposed_paths.append((("api", "deepseek", leaf), deepseek[leaf]))
        else:
            for leaf, leaf_value in value.items():
                proposed_paths.append(((root_key, leaf), leaf_value))

    if not proposed_paths:
        raise ValueError("没有可更新的配置字段")

    for path_parts, value in proposed_paths:
        full_path = path_parts if len(path_parts) == 3 else (path_parts[0], path_parts[1])
        if len(path_parts) == 2:
            mapped_path = (path_parts[0], path_parts[1])
        else:
            mapped_path = path_parts
        if mapped_path not in allowed_paths:
            dotted = ".".join(path_parts)
            raise ValueError(f"禁止更新敏感配置: {dotted}")
        set_path(sanitized, path_parts, value)

    return sanitized


def merge_config_documents(current, patch):
    result = _clone(current)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = merge_config_documents(result[key], value)
        else:
            result[key] = value
    return result


def _base64url_encode(raw_bytes):
    return base64.urlsafe_b64encode(raw_bytes).rstrip(b"=").decode("ascii")


def _base64url_decode(encoded):
    padding = "=" * (-len(encoded) % 4)
    return base64.urlsafe_b64decode((encoded + padding).encode("ascii"))


def normalize_proposal(proposal):
    if not isinstance(proposal, dict):
        raise ValueError("proposal 必须是对象")

    proposal_type = proposal.get("type")
    if proposal_type not in APPROVABLE_PROPOSAL_TYPES:
        raise ValueError(f"未知或不支持的 proposal 类型: {proposal_type}")

    normalized = {"type": proposal_type}

    if proposal_type == "batch_delete_schedule":
        dates = [d for d in (proposal.get("dates") or []) if isinstance(d, str) and d]
        if not dates:
            raise ValueError("batch_delete_schedule 缺少 dates")
        normalized["dates"] = dates
        normalized["reason"] = _as_string(proposal.get("reason"))
        return normalized

    if proposal_type == "manage_schedule_delete":
        normalized.update({
            "date": _as_string(proposal.get("date")),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["date"]:
            raise ValueError("manage_schedule_delete 缺少 date")
        return normalized

    if proposal_type == "update_task":
        normalized.update({
            "date": _as_string(proposal.get("date")),
            "oldTaskName": _as_string(proposal.get("oldTaskName") or proposal.get("old_task_name")),
            "newTaskName": _as_string(proposal.get("newTaskName") or proposal.get("new_task_name")),
            "newEstimatedMinutes": _as_int(proposal.get("newEstimatedMinutes", proposal.get("new_estimated_minutes")), 0),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["date"] or not normalized["oldTaskName"] or not normalized["newTaskName"]:
            raise ValueError("update_task 缺少必要字段")
        return normalized

    if proposal_type == "delete_task":
        normalized.update({
            "date": _as_string(proposal.get("date")),
            "taskName": _as_string(proposal.get("taskName") or proposal.get("task_name")),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["date"] or not normalized["taskName"]:
            raise ValueError("delete_task 缺少必要字段")
        return normalized

    if proposal_type == "batch_delete_tasks":
        tasks = []
        for item in (proposal.get("tasks") or []):
            if not isinstance(item, dict):
                continue
            date = _as_string(item.get("date"))
            task_name = _as_string(item.get("task_name") or item.get("taskName") or item.get("name"))
            if date and task_name:
                tasks.append({"date": date, "task_name": task_name})
        if not tasks:
            raise ValueError("batch_delete_tasks 缺少 tasks")
        normalized["tasks"] = tasks
        normalized["reason"] = _as_string(proposal.get("reason"))
        return normalized

    if proposal_type == "update_big_task":
        normalized.update({
            "oldTaskName": _as_string(proposal.get("oldTaskName") or proposal.get("old_task_name")),
            "newTaskName": _as_string(proposal.get("newTaskName") or proposal.get("new_task_name")),
            "newEstimatedMinutes": _as_int(proposal.get("newEstimatedMinutes", proposal.get("new_estimated_minutes")), 0),
            "newDdl": _as_string(proposal.get("newDdl") or proposal.get("new_ddl")),
            "newTaskType": _as_string(proposal.get("newTaskType") or proposal.get("new_task_type")),
            "newStartDate": _as_string(proposal.get("newStartDate") or proposal.get("new_start_date")),
            "newNote": _as_string(proposal.get("newNote") or proposal.get("new_note")),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["oldTaskName"] or not normalized["newTaskName"]:
            raise ValueError("update_big_task 缺少必要字段")
        return normalized

    if proposal_type == "delete_big_task":
        normalized.update({
            "taskName": _as_string(proposal.get("taskName") or proposal.get("task_name")),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["taskName"]:
            raise ValueError("delete_big_task 缺少 taskName")
        return normalized

    if proposal_type == "batch_delete_big_tasks":
        names = proposal.get("taskNames")
        if not isinstance(names, list):
            names = proposal.get("task_names") or []
        normalized["taskNames"] = [name for name in names if isinstance(name, str) and name]
        normalized["reason"] = _as_string(proposal.get("reason"))
        if not normalized["taskNames"]:
            raise ValueError("batch_delete_big_tasks 缺少 taskNames")
        return normalized

    if proposal_type == "batch_modify_schedules":
        normalized.update({
            "operation": _as_string(proposal.get("operation")),
            "reason": _as_string(proposal.get("reason")),
            "criteria": _normalize_schedule_criteria(proposal.get("criteria")),
            "newDetails": _normalize_schedule_details(proposal.get("new_details") or proposal.get("newDetails")),
        })
        if not normalized["operation"]:
            raise ValueError("batch_modify_schedules 缺少 operation")
        return normalized

    if proposal_type == "modify_course":
        normalized.update({
            "oldCourseInfo": _normalize_course_info(proposal.get("oldCourseInfo") or proposal.get("old_course_info")),
            "newCourseInfo": _normalize_course_info(proposal.get("newCourseInfo") or proposal.get("new_course_info")),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["oldCourseInfo"].get("name") or not normalized["oldCourseInfo"].get("time"):
            raise ValueError("modify_course 缺少 oldCourseInfo 关键信息")
        if not normalized["newCourseInfo"]:
            raise ValueError("modify_course 缺少 newCourseInfo")
        return normalized

    if proposal_type == "modify_template_course":
        normalized.update({
            "oldCourseCell": _normalize_template_course_cell(proposal.get("oldCourseCell") or proposal.get("old_course_cell")),
            "newCourseCell": _normalize_template_course_cell(proposal.get("newCourseCell") or proposal.get("new_course_cell")),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["oldCourseCell"]:
            raise ValueError("modify_template_course 缺少 oldCourseCell")
        if not normalized["newCourseCell"]:
            raise ValueError("modify_template_course 缺少 newCourseCell")
        return normalized

    if proposal_type == "remove_course":
        normalized.update(_normalize_course_info(proposal))
        normalized["courseName"] = _as_string(
            proposal.get("courseName") or proposal.get("course_name") or normalized.get("name")
        )
        normalized["reason"] = _as_string(proposal.get("reason"))
        normalized.pop("name", None)
        if not normalized["courseName"]:
            raise ValueError("remove_course 缺少 courseName")
        return normalized

    if proposal_type == "remove_template_course":
        normalized.update({
            "courseCell": _normalize_template_course_cell(
                proposal.get("courseCell") or proposal.get("course_cell") or proposal
            ),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["courseCell"]:
            raise ValueError("remove_template_course 缺少 courseCell")
        return normalized

    if proposal_type == "swap_courses":
        normalized.update({
            "course1": _normalize_course_info(proposal.get("course1")),
            "course2": _normalize_course_info(proposal.get("course2")),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["course1"] or not normalized["course2"]:
            raise ValueError("swap_courses 缺少课程信息")
        return normalized

    if proposal_type == "adjust_schedule_by_week":
        normalized.update({
            "sourceDate": _as_string(proposal.get("sourceDate") or proposal.get("source_date")),
            "targetDate": _as_string(proposal.get("targetDate") or proposal.get("target_date")),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["sourceDate"] or not normalized["targetDate"]:
            raise ValueError("adjust_schedule_by_week 缺少 sourceDate 或 targetDate")
        return normalized

    if proposal_type == "import_course_schedule":
        normalized.update({
            "scheduleText": _as_string(proposal.get("scheduleText") or proposal.get("schedule_text")),
            "semesterStart": _as_string(proposal.get("semesterStart") or proposal.get("semester_start")),
            "semesterEnd": _as_string(proposal.get("semesterEnd") or proposal.get("semester_end")),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["scheduleText"]:
            raise ValueError("import_course_schedule 缺少 scheduleText")
        return normalized

    if proposal_type == "batch_manage_courses":
        courses = []
        for item in (proposal.get("courses") or []):
            normalized_course = _normalize_course_info(item)
            if normalized_course:
                courses.append(normalized_course)
        normalized.update({
            "operation": _as_string(proposal.get("operation")),
            "courses": courses,
            "newTimeSlot": _as_string(proposal.get("newTimeSlot") or proposal.get("new_time_slot")),
            "reason": _as_string(proposal.get("reason")),
        })
        if not normalized["operation"]:
            raise ValueError("batch_manage_courses 缺少 operation")
        return normalized

    if proposal_type == "apply_template":
        normalized.update({
            "templateName": _as_string(proposal.get("templateName") or proposal.get("template_name")),
            "targetDate": _as_string(proposal.get("targetDate") or proposal.get("target_date")),
            "reason": _as_string(proposal.get("reason")),
        })
        template_data = proposal.get("templateData") or proposal.get("template_data")
        if isinstance(template_data, dict):
            normalized["templateData"] = _clone(template_data)
        if not normalized["templateName"] or not normalized["targetDate"]:
            raise ValueError("apply_template 缺少 templateName 或 targetDate")
        return normalized

    normalized.update({
        "date": _as_string(proposal.get("date")),
        "operation": _as_string(proposal.get("operation"), "modify"),
        "reason": _as_string(proposal.get("reason")),
        "timeSlots": [slot for slot in (proposal.get("timeSlots") or []) if isinstance(slot, str)],
        "changes": [change for change in (proposal.get("changes") or []) if isinstance(change, str)],
        "title": _as_string(proposal.get("title")),
    })
    new_slot_details = proposal.get("newSlotDetails")
    if isinstance(new_slot_details, dict):
        normalized["newSlotDetails"] = {
            key: _as_string(new_slot_details.get(key))
            for key in ("time", "activity", "detail", "icon")
            if key in new_slot_details
        }
    if not normalized["date"]:
        raise ValueError("modify_schedule 缺少 date")
    return normalized


def issue_proposal_token(proposal, *, base_version, ttl_seconds=PROPOSAL_TTL_SECONDS):
    normalized = normalize_proposal(proposal)
    payload = {
        "v": PROPOSAL_TOKEN_VERSION,
        "exp": int(time.time()) + int(ttl_seconds),
        "scheduleVersion": int(base_version),
        "proposal": normalized,
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(_PROPOSAL_SECRET, body, hashlib.sha256).digest()
    return f"{_base64url_encode(body)}.{_base64url_encode(signature)}"


def verify_proposal_token(token):
    if not isinstance(token, str) or "." not in token:
        raise ValueError("缺少有效的 proposal token")
    body_part, signature_part = token.split(".", 1)
    body = _base64url_decode(body_part)
    signature = _base64url_decode(signature_part)
    expected = hmac.new(_PROPOSAL_SECRET, body, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise ValueError("proposal token 校验失败")
    payload = json.loads(body.decode("utf-8"))
    if payload.get("v") != PROPOSAL_TOKEN_VERSION:
        raise ValueError("proposal token 版本不支持")
    if payload.get("exp", 0) < int(time.time()):
        raise ValueError("proposal 已过期，请重新生成")
    normalized = normalize_proposal(payload.get("proposal"))
    schedule_version = payload.get("scheduleVersion")
    if not isinstance(schedule_version, int) or schedule_version < 0:
        raise ValueError("proposal token 缺少有效版本")
    return {"proposal": normalized, "scheduleVersion": schedule_version}
