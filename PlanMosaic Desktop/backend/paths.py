import hashlib
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

APP_NAME = 'PlanMosaic'

DATA_FILES = [
    'data.json',
    'config.json',
    'settings.json',
    'agent-log.json',
]

PORT_INFO_FILE = 'python-backend-port.json'

_active_username = None


def _sanitize_username(username):
    if not isinstance(username, str) or len(username) == 0 or len(username) > 64:
        return None
    if not re.match(r'^[\w\u4e00-\u9fff\-_]+$', username):
        return None
    return username


_active_username = _sanitize_username(os.environ.get('PLANMOSAIC_ACTIVE_USERNAME'))


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


def get_port_info_path(username=None):
    """Path to a JSON file containing the actual (host, port) the Python backend
    is bound to, written by the backend at startup. The Electron main process
    reads this to discover the port when auto-fallback kicked in."""
    return get_data_path(PORT_INFO_FILE, username)


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


def clean_legacy_data_for_packaged_app():
    root_dir = get_app_data_root_dir()
    mark_file = os.path.join(root_dir, '.packaged-v2')

    if os.path.exists(mark_file):
        return

    if not os.path.exists(root_dir):
        try:
            os.makedirs(root_dir, exist_ok=True)
            with open(mark_file, 'w') as f:
                f.write(datetime.now(timezone.utc).isoformat())
        except OSError as e:
            import warnings
            warnings.warn(f'[Paths] Failed to initialize root dir: {e}')
        print('[Paths] Fresh install, no legacy data to clean.')
        return

    has_legacy_data = any(os.path.exists(os.path.join(root_dir, f)) for f in DATA_FILES)
    has_legacy_backup = os.path.exists(os.path.join(root_dir, 'backups'))

    if has_legacy_data or has_legacy_backup:
        print('[Paths] Packaged app first run: cleaning legacy global data...')

        for item in DATA_FILES + ['backups']:
            legacy_path = os.path.join(root_dir, item)
            if os.path.exists(legacy_path):
                try:
                    if os.path.isdir(legacy_path):
                        shutil.rmtree(legacy_path)
                    else:
                        os.remove(legacy_path)
                    print(f'[Paths] Removed legacy: {item}')
                except OSError as e:
                    import warnings
                    warnings.warn(f'[Paths] Failed to remove {item}: {e}')

    try:
        with open(mark_file, 'w') as f:
            f.write(datetime.now(timezone.utc).isoformat())
    except OSError as e:
        import warnings
        warnings.warn(f'[Paths] Failed to write mark file: {e}')
    print('[Paths] Packaged app data reset complete.')


def migrate_from_legacy_dir(legacy_dir):
    new_data_file = get_data_file_path()
    if new_data_file is None:
        return

    if os.path.exists(new_data_file):
        return

    has_legacy_data = any(os.path.exists(os.path.join(legacy_dir, f)) for f in DATA_FILES)
    if not has_legacy_data:
        return

    ensure_app_data_dir()

    print(f'[Paths] Migrating data from {legacy_dir} -> {get_app_data_dir()}')

    for filename in DATA_FILES:
        src = os.path.join(legacy_dir, filename)
        dest = get_data_path(filename)
        if dest is None:
            continue
        if os.path.exists(src) and not os.path.exists(dest):
            try:
                shutil.copy2(src, dest)
                print(f'[Paths] Migrated: {filename}')
                os.remove(src)
                print(f'[Paths] Removed legacy file: {filename}')
            except OSError as e:
                import warnings
                warnings.warn(f'[Paths] Migration failed for {filename}: {e}')

    legacy_backup_dir = os.path.join(legacy_dir, 'backups')
    new_backup_dir = get_backup_dir()
    if os.path.exists(legacy_backup_dir) and new_backup_dir is not None and not os.path.exists(new_backup_dir):
        try:
            shutil.copytree(legacy_backup_dir, new_backup_dir)
            print('[Paths] Migrated: backups/')
            shutil.rmtree(legacy_backup_dir)
            print('[Paths] Removed legacy directory: backups/')
        except OSError as e:
            import warnings
            warnings.warn(f'[Paths] Backup migration failed: {e}')

    print('[Paths] Migration complete.')


def clean_old_backups(file_prefix, username=None):
    MAX_COUNT = 10
    MAX_SIZE = 50 * 1024 * 1024

    try:
        backup_dir = get_backup_dir(username)
        if backup_dir is None:
            return

        files = []
        for f in os.listdir(backup_dir):
            if f.startswith(file_prefix) and f.endswith('.json'):
                full_path = os.path.join(backup_dir, f)
                try:
                    stat = os.stat(full_path)
                    files.append({
                        'name': f,
                        'path': full_path,
                        'time': stat.st_mtime,
                        'size': stat.st_size,
                    })
                except OSError:
                    continue

        files.sort(key=lambda x: x['time'], reverse=True)

        to_keep = files[:MAX_COUNT]
        total_size = sum(f['size'] for f in to_keep)

        to_delete = files[MAX_COUNT:]
        for f in to_delete:
            try:
                os.remove(f['path'])
                print(f"[Backup] Deleted old backup: {f['name']}")
            except OSError as e:
                import warnings
                warnings.warn(f"[Backup] Failed to delete {f['name']}: {e}")

        if total_size > MAX_SIZE:
            for f in reversed(to_keep):
                if total_size <= MAX_SIZE:
                    break
                total_size -= f['size']
                try:
                    os.remove(f['path'])
                    print(f"[Backup] Deleted oversized backup: {f['name']}")
                except OSError as e:
                    import warnings
                    warnings.warn(f"[Backup] Failed to delete {f['name']}: {e}")

    except OSError as e:
        import warnings
        warnings.warn(f'[Backup] Clean error: {e}')
