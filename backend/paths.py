import hashlib
import os
import re
import sys
from pathlib import Path

APP_NAME = 'PlanMosaic'

DATA_FILES = [
    'data.json',
    'config.json',
    'settings.json',
    'agent-log.json',
]

_active_username = None


def _sanitize_username(username):
    if not isinstance(username, str) or len(username) == 0 or len(username) > 64:
        return None
    if not re.match(r'^[\w\u4e00-\u9fff\-_]+$', username):
        return None
    return username


def _hash_username(username):
    return hashlib.sha256(username.encode()).hexdigest()[:8]


def get_app_data_root_dir():
    if sys.platform == 'win32':
        base_dir = os.environ.get('APPDATA', os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming'))
    elif sys.platform == 'darwin':
        base_dir = os.path.join(os.path.expanduser('~'), 'Library', 'Application Support')
    else:
        base_dir = os.environ.get('XDG_CONFIG_HOME', os.path.join(os.path.expanduser('~'), '.config'))

    return os.path.join(base_dir, APP_NAME)


def set_active_username(username):
    global _active_username
    sanitized = _sanitize_username(username)
    if sanitized is None:
        return None
    _active_username = sanitized
    return _active_username


def get_app_data_dir(username=None):
    root_dir = get_app_data_root_dir()
    user = username if username is not None else _active_username
    if user:
        hashed = _hash_username(user)
        data_dir = os.path.join(root_dir, hashed)
        resolved = os.path.realpath(data_dir)
        resolved_root = os.path.realpath(root_dir)
        if not resolved.startswith(resolved_root + os.sep) and resolved != resolved_root:
            import warnings
            warnings.warn(f'[Security] Path traversal detected: {resolved}')
            return None
        return resolved
    return root_dir


def ensure_app_data_dir():
    try:
        dir_path = get_app_data_dir()
        if dir_path is None:
            return False
        os.makedirs(dir_path, exist_ok=True)
        return True
    except OSError:
        return False


def get_data_path(filename, username=None):
    data_dir = get_app_data_dir(username)
    if data_dir is None:
        return None
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, filename)


def get_data_file_path(username=None):
    return get_data_path('data.json', username)


def get_config_path(username=None):
    return get_data_path('config.json', username)


def get_settings_path(username=None):
    return get_data_path('settings.json', username)


def get_agent_log_path(username=None):
    return get_data_path('agent-log.json', username)


def get_backup_dir(username=None):
    try:
        backup_dir = get_data_path('backups', username)
        if backup_dir is None:
            return None
        os.makedirs(backup_dir, exist_ok=True)
        return backup_dir
    except OSError:
        import warnings
        warnings.warn('[Paths] Failed to create backup dir')
        return None