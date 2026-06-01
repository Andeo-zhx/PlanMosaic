import json
import os
import warnings

from . import paths


class _Config:
    def __init__(self):
        self.deepseek_key = ''
        self.deepseek_base_url = 'https://api.deepseek.com/v1/chat/completions'
        self.deepseek_model = 'deepseek-v4-flash'
        self.deepseek_reasoner_model = 'deepseek-v4-pro'

        self.qwen_key = ''
        self.qwen_base_url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
        self.qwen_model = 'qwen3.5-plus'

        self.agent_provider = 'deepseek'

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
        if deepseek.get('reasonerModel'):
            self.deepseek_reasoner_model = deepseek['reasonerModel']

        qwen = api.get('qwen', {})
        if qwen.get('key'):
            self.qwen_key = qwen['key']
        if qwen.get('baseUrl'):
            self.qwen_base_url = qwen['baseUrl']
        raw_qw_model = qwen.get('model')
        if isinstance(raw_qw_model, str) and raw_qw_model.strip():
            self.qwen_model = raw_qw_model

        agent = config.get('agent', {})
        raw_provider = agent.get('provider')
        if raw_provider in ('deepseek', 'qwen'):
            self.agent_provider = raw_provider

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
        if not self.deepseek_key and os.environ.get('DEEPSEEK_API_KEY'):
            self.deepseek_key = os.environ['DEEPSEEK_API_KEY']

        if not self.qwen_key and os.environ.get('DASHSCOPE_API_KEY'):
            self.qwen_key = os.environ['DASHSCOPE_API_KEY']

        if os.environ.get('MODEL_NAME'):
            self.deepseek_model = os.environ['MODEL_NAME']

    def load(self):
        config_path = paths.get_config_path()
        if not os.path.exists(config_path):
            try:
                os.makedirs(os.path.dirname(config_path), exist_ok=True)
                default_config = {
                    "agent": {"provider": "deepseek"},
                    "api": {
                        "deepseek": {
                            "key": "",
                            "baseUrl": "https://api.deepseek.com/v1/chat/completions",
                            "model": "deepseek-v4-flash",
                            "reasonerModel": "deepseek-v4-pro"
                        },
                        "qwen": {
                            "key": "",
                            "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                            "model": "qwen3.5-plus"
                        }
                    },
                    "security": {"rejectUnauthorized": True},
                    "timeouts": {"apiTimeoutMs": 30000}
                }
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(default_config, f, ensure_ascii=False, indent=2)
                warnings.warn('[Config] WARNING: config.json not found, created with default values')
            except OSError as e:
                warnings.warn(f'[Config] Failed to create default config.json: {e}')
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                self._load_from_config_json(config)
                print('[Config] Loaded from config.json')
            except (json.JSONDecodeError, OSError) as e:
                warnings.warn(f'[Config] Failed to load config.json: {e}')

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
REASONER_MODEL_NAME = config.deepseek_reasoner_model

QWEN_API_KEY = config.qwen_key
QWEN_API_URL = config.qwen_base_url
QWEN_MODEL_NAME = config.qwen_model

AGENT_PROVIDER = config.agent_provider

PORT = config.server_port
HOST = config.server_host

REJECT_UNAUTHORIZED = config.reject_unauthorized
API_TIMEOUT_MS = config.api_timeout_ms

DEEP_PLANNING_SYSTEM_PROMPT = "你是一个专业的日程规划助手。请根据用户的描述，帮助分析并规划日程安排。你需要:\n1. 理解用户的需求和时间约束\n2. 建议合理的日程安排\n3. 考虑优先级和截止日期\n4. 以结构化的方式呈现建议"