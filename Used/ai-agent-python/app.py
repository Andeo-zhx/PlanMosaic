import os
import json
import datetime
from flask import Flask, request, jsonify

from model import (
    initialize_model, predict, retrain_model,
    load_model, USER_DATA_FILE
)

app = Flask(__name__)

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
model_version = 1
model = None
vectorizer = None
model_metrics = {}


@app.before_request
def ensure_model():
    global model, vectorizer, model_metrics, model_version
    if model is None:
        try:
            model, vectorizer, init_info = initialize_model()
            model_metrics = init_info.get('metrics', {})
        except Exception as e:
            print(f'[Model Init] Error: {e}')
            model = None


@app.route('/api/estimate-task-time', methods=['POST'])
def estimate_task_time():
    global model, vectorizer, model_metrics
    if model is None or vectorizer is None:
        return jsonify({
            'error': 'Model not available',
            'fallback': True,
            'message': '时间估算模型未就绪，请稍后重试'
        }), 503

    data = request.get_json() or {}
    task_name = data.get('task_name', '')
    category = data.get('category', '其他')
    context = data.get('context', '')

    try:
        estimated_minutes, confidence_interval = predict(model, vectorizer, task_name, category, context)
        return jsonify({
            'estimated_minutes': estimated_minutes,
            'confidence_interval': confidence_interval,
            'model_version': f'v{model_version}'
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'fallback': True
        }), 500


@app.route('/api/train-model', methods=['POST'])
def train_model_handler():
    global model, vectorizer, model_metrics, model_version
    try:
        result = retrain_model()
        model, vectorizer = load_model()
        model_metrics = result.get('metrics', {})
        model_version += 1
        return jsonify({
            'r2_score': result['metrics'].get('r2_score'),
            'mae': result['metrics'].get('mae'),
            'training_samples': result['total_samples'],
            'preset_samples': result['preset_samples'],
            'user_samples': result['user_samples'],
            'model_version': f'v{model_version}',
            'message': f'模型已重新训练，共 {result["total_samples"]} 条训练样本'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/collect-training-data', methods=['POST'])
def collect_training_data():
    data = request.get_json() or {}
    task_name = data.get('task_name', '')
    category = data.get('category', '其他')
    context = data.get('context', '')
    estimated_minutes = data.get('estimated_minutes', 0)
    actual_minutes = data.get('actual_minutes', 0)

    if not task_name or actual_minutes <= 0:
        return jsonify({'error': '缺少 task_name 或 actual_minutes'}), 400

    existing = []
    if os.path.exists(USER_DATA_FILE):
        with open(USER_DATA_FILE, 'r', encoding='utf-8') as f:
            try:
                existing = json.load(f)
            except json.JSONDecodeError:
                existing = []

    existing.append({
        'task_name': task_name,
        'category': category,
        'context': context,
        'estimated_minutes': estimated_minutes,
        'actual_minutes': actual_minutes,
        'collected_at': datetime.datetime.now().isoformat()
    })

    with open(USER_DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    return jsonify({
        'success': True,
        'user_data_count': len(existing),
        'message': f'训练数据已收集，当前用户数据 {len(existing)} 条'
    })


@app.route('/api/training-status', methods=['GET'])
def training_status():
    global model_metrics, model_version
    preset_count = 0
    user_count = 0
    try:
        import json as _json
        if os.path.exists(os.path.join(MODEL_DIR, 'training_data.json')):
            with open(os.path.join(MODEL_DIR, 'training_data.json'), 'r', encoding='utf-8') as f:
                preset_count = len(_json.load(f))
        if os.path.exists(USER_DATA_FILE):
            with open(USER_DATA_FILE, 'r', encoding='utf-8') as f:
                user_count = len(_json.load(f))
    except Exception:
        pass

    return jsonify({
        'model_loaded': model is not None,
        'model_version': f'v{model_version}',
        'preset_samples': preset_count,
        'user_samples': user_count,
        'last_metrics': model_metrics
    })


if __name__ == '__main__':
    print('[PlanMosaic Python ML] Starting on port 5100...')
    try:
        model, vectorizer, init_info = initialize_model()
        model_metrics = init_info.get('metrics', {})
        print(f'[PlanMosaic Python ML] Model initialized: {init_info}')
    except Exception as e:
        print(f'[PlanMosaic Python ML] Model init warning: {e}')
    app.run(host='127.0.0.1', port=5100, debug=False)