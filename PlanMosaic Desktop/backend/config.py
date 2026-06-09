import json
import os
import warnings

from . import paths
from .data_guard import normalize_config_document, validate_config_document


class _Config:
    def __init__(self):
        self._reset()

    def _reset(self):
        self.deepseek_key = ''
        self.deepseek_base_url = 'https://api.deepseek.com/v1/chat/completions'
        self.deepseek_model = 'deepseek-v4-flash'
        self.server_port = 8080
        self.server_host = '127.0.0.1'
        self.reject_unauthorized = True
        self.api_timeout_ms = 30000

    def _load_from_config_json(self, config):
        api = config.get('api', {})

        deepseek = api.get('deepseek', {})
        if deepseek.get('key'):
            self.deepseek_key = deepseek['key']
        if deepseek.get('baseUrl'):
            self.deepseek_base_url = deepseek['baseUrl']
        raw_ds_model = deepseek.get('model')
        if isinstance(raw_ds_model, str) and raw_ds_model.strip():
            self.deepseek_model = raw_ds_model

        server = config.get('server', {})
        if server.get('port') is not None:
            self.server_port = server['port']
        if server.get('host'):
            self.server_host = server['host']

        security = config.get('security', {})
        if 'rejectUnauthorized' in security:
            self.reject_unauthorized = security['rejectUnauthorized']

        timeouts = config.get('timeouts', {})
        raw_timeout = timeouts.get('apiTimeoutMs')
        if isinstance(raw_timeout, (int, float)) and raw_timeout > 0:
            self.api_timeout_ms = raw_timeout

    def _load_from_settings_json(self, settings):
        if 'rejectUnauthorized' in settings:
            self.reject_unauthorized = settings['rejectUnauthorized']
        if 'timeoutMs' in settings:
            self.api_timeout_ms = settings['timeoutMs']

    def _load_from_env(self):
        # 注意：环境变量仅作为 config.json 不存在或缺字段时的回退来源，不能覆盖配置文件。
        # 否则 Electron 启动 Python 时通过 env 传入的旧 key，会在每次 load() 时覆盖用户已更新的新 key，
        # 导致 /api/config 热更新失败。
        if not self.deepseek_key and os.environ.get('DEEPSEEK_API_KEY'):
            self.deepseek_key = os.environ['DEEPSEEK_API_KEY']

        if not self.deepseek_model and os.environ.get('MODEL_NAME'):
            self.deepseek_model = os.environ['MODEL_NAME']

    def load(self):
        self._reset()
        config_path = paths.get_config_path()
        if not os.path.exists(config_path):
            try:
                os.makedirs(os.path.dirname(config_path), exist_ok=True)
                default_config = normalize_config_document({})
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(default_config, f, ensure_ascii=False, indent=2)
                warnings.warn('[Config] WARNING: config.json not found, created with default values')
            except OSError as e:
                warnings.warn(f'[Config] Failed to create default config.json: {e}')
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = normalize_config_document(json.load(f))
                validate_config_document(config)
                self._load_from_config_json(config)
                print('[Config] Loaded from config.json')
            except (json.JSONDecodeError, OSError) as e:
                warnings.warn(f'[Config] Failed to load config.json: {e}')
            except ValueError as e:
                warnings.warn(f'[Config] Invalid config.json schema: {e}')

        settings_path = paths.get_settings_path()
        if os.path.exists(settings_path):
            try:
                with open(settings_path, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                self._load_from_settings_json(settings)
                print('[Config] Loaded from settings.json (legacy)')
            except (json.JSONDecodeError, OSError) as e:
                warnings.warn(f'[Config] Failed to load settings.json: {e}')

        self._load_from_env()

        if not self.deepseek_key:
            warnings.warn('[Config] WARNING: DeepSeek API key not configured!')
            warnings.warn('[Config] Please set it in config.json or DEEPSEEK_API_KEY environment variable')


config = _Config()
config.load()


DEEPSEEK_API_KEY = config.deepseek_key
DEEPSEEK_API_URL = config.deepseek_base_url
MODEL_NAME = config.deepseek_model

PORT = config.server_port
HOST = config.server_host

REJECT_UNAUTHORIZED = config.reject_unauthorized
API_TIMEOUT_MS = config.api_timeout_ms

DEEP_PLANNING_SYSTEM_PROMPT = "你是一个专业的日程规划助手。请根据用户的描述，帮助分析并规划日程安排。你需要:\n1. 理解用户的需求和时间约束\n2. 建议合理的日程安排\n3. 考虑优先级和截止日期\n4. 以结构化的方式呈现建议"


from backend.helpers import bold, dim, cyan, green, red, yellow, blue, error as _h_error, success as _h_success, info as _h_info, separator as _h_separator, load_config as _load_config, load_data as _load_data


def save_config(config_dict, username=None):
    import json
    import os
    config_path = paths.get_config_path(username)
    try:
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        current_version = 0
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    current_config = normalize_config_document(json.load(f))
                current_version = current_config.get('_meta', {}).get('version', 0)
            except (OSError, json.JSONDecodeError, ValueError):
                current_version = 0
        normalized = normalize_config_document(config_dict)
        normalized['_meta']['version'] = current_version + 1
        normalized['_meta']['updatedAt'] = __import__('datetime').datetime.utcnow().isoformat() + 'Z'
        validate_config_document(normalized)
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(normalized, f, ensure_ascii=False, indent=2)
        return True
    except (OSError, ValueError) as e:
        _h_error(f'无法保存 config.json 文件: {e}')
        return False


def show_config(username=None):
    config = _load_config(username)
    data = _load_data(username)
    settings = (data or {}).get('settings', {})

    print()
    print(bold('PlanMosaic 配置信息'))
    print(dim(_h_separator('─', 55)))

    print()
    print(bold('API 密钥:'))
    deepseek_cfg = (config.get('api') or {}).get('deepseek') or {}
    if deepseek_cfg.get('key'):
        key = deepseek_cfg['key']
        masked = key[:4] + '****' + key[-4:]
        print(green(f'  DeepSeek: {masked} ✓'))
    else:
        print(dim('  DeepSeek: 未配置'))

    print()
    print(bold('模型:'))
    api = config.get('api') or {}
    if api.get('deepseek') and api['deepseek'].get('model'):
        print(cyan(f'  DeepSeek: {api["deepseek"]["model"]}'))

    print()
    print(bold('其他设置:'))
    if settings.get('theme'):
        print(cyan(f'  主题: {settings["theme"]}'))
    if (config.get('timeouts') or {}).get('apiTimeoutMs'):
        print(cyan(f'  API超时: {config["timeouts"]["apiTimeoutMs"]}ms'))

    print()
    print(bold('数据存储:'))
    print(dim(f'  数据目录: {paths.get_app_data_dir(username)}'))
    print(dim(f'  数据文件: {paths.get_data_file_path(username)}'))
    print(dim(f'  配置文件: {paths.get_config_path(username)}'))
    print(dim(f'  日志文件: {paths.get_agent_log_path(username)}'))


def set_api_key(key, username=None):
    if not key or len(key) < 20:
        _h_error('API Key 格式无效，请提供完整的密钥')
        return

    config = _load_config(username)
    if 'api' not in config:
        config['api'] = {}
    if 'deepseek' not in config['api']:
        config['api']['deepseek'] = {}
    config['api']['deepseek']['key'] = key

    if save_config(config, username):
        masked = key[:4] + '****' + key[-4:]
        _h_success(f'DeepSeek API Key 已设置: {masked}')


def set_base_url(url, username=None):
    if not url or not url.startswith('http'):
        _h_error('无效的 URL 格式')
        return

    config = _load_config(username)
    if 'api' not in config:
        config['api'] = {}
    if 'deepseek' not in config['api']:
        config['api']['deepseek'] = {}
    config['api']['deepseek']['baseUrl'] = url

    if save_config(config, username):
        _h_success(f'DeepSeek API URL 已设置: {url}')
