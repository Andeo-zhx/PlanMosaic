import os
import json
import datetime
from flask import Flask, request, jsonify

from model import (
    initialize_model, predict, retrain_model,
    load_model, USER_DATA_FILE,
    normalize_structured_features, assess_sample_quality,
    load_training_report, build_training_explanation,
    MAX_TARGET_MINUTES
)

app = Flask(__name__)

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
ESTIMATE_SNAPSHOT_FILE = os.path.join(MODEL_DIR, 'estimate_snapshots.json')
model_version = 1
model = None
vectorizer = None
model_metrics = {}
model_metadata = {}


def _load_json_list(file_path):
    if not os.path.exists(file_path):
        return []
    with open(file_path, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []


def _write_json_list(file_path, records):
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def _extract_structured_features(data, task_name, category, context):
    return normalize_structured_features(
        task_name,
        category,
        context,
        data.get('structured_features') or data
    )


@app.before_request
def ensure_model():
    global model, vectorizer, model_metrics, model_metadata, model_version
    if model is None:
        try:
            model, vectorizer, init_info = initialize_model()
            model_metrics = init_info.get('metrics', {})
            model_metadata = init_info.get('metadata', {})
        except Exception as e:
            print(f'[Model Init] Error: {e}')
            model = None
            vectorizer = None
            model_metadata = {}


@app.route('/api/estimate-task-time', methods=['POST'])
def estimate_task_time():
    global model, vectorizer, model_metrics, model_metadata
    data = request.get_json() or {}
    task_name = data.get('task_name', '')
    category = data.get('category', '其他')
    context = data.get('context', '')
    structured_features = _extract_structured_features(data, task_name, category, context)

    try:
        prediction = predict(
            model,
            vectorizer,
            task_name,
            category,
            context,
            structured_features=structured_features,
            metadata=model_metadata
        )
        estimated_at = datetime.datetime.now().isoformat()
        estimate_snapshots = _load_json_list(ESTIMATE_SNAPSHOT_FILE)
        estimate_snapshots.append({
            'task_name': task_name,
            'category': category,
            'context': context,
            'estimated_minutes': prediction['estimated_minutes'],
            'baseline_minutes': prediction['baseline_minutes'],
            'calibration_ratio': prediction['calibration_ratio'],
            'calibration_delta_minutes': prediction['calibration_delta_minutes'],
            'baseline_comparison': prediction['baseline_comparison'],
            'structured_features': prediction['structured_features'],
            'major_factors': prediction['major_factors'],
            'estimated_at': estimated_at,
            'sample_version': 3,
            'sample': {
                'version': 3,
                'features': {
                    'task_name': task_name,
                    'category': category,
                    'context': context,
                    'estimated_minutes': prediction['estimated_minutes'],
                    'baseline_minutes': prediction['baseline_minutes'],
                    'structured_features': prediction['structured_features'],
                },
                'labels': {
                    'estimated_minutes': prediction['estimated_minutes'],
                },
                'quality': {
                    'low_confidence': prediction['low_confidence'],
                    'confidence_reasons': prediction['confidence_reasons'],
                },
                'meta': {
                    'source': 'estimate_task_time',
                    'estimated_at': estimated_at,
                }
            }
        })
        _write_json_list(ESTIMATE_SNAPSHOT_FILE, estimate_snapshots)
        return jsonify({
            'estimated_minutes': prediction['estimated_minutes'],
            'baseline_minutes': prediction['baseline_minutes'],
            'calibrated_minutes': prediction['calibrated_minutes'],
            'calibration_ratio': prediction['calibration_ratio'],
            'calibration_delta_minutes': prediction['calibration_delta_minutes'],
            'baseline_comparison': prediction['baseline_comparison'],
            'confidence_interval': prediction['confidence_interval'],
            'confidence_level': prediction['confidence_level'],
            'low_confidence': prediction['low_confidence'],
            'confidence_reasons': prediction['confidence_reasons'],
            'relative_interval_width': prediction['relative_interval_width'],
            'major_factors': prediction['major_factors'],
            'factor_details': prediction['factor_details'],
            'structured_features': prediction['structured_features'],
            'fallback': prediction['fallback'],
            'estimator_mode': prediction['estimator_mode'],
            'used_model': prediction['used_model'],
            'message': (
                '已结合规则基线与历史样本完成两阶段估算'
                if prediction['used_model'] else
                '模型暂不可用，当前返回规则基线估算，建议预留缓冲时间'
            ),
            'model_version': f'v{model_version}',
            'training_summary': {
                'total_samples': model_metadata.get('total_samples', 0),
                'preset_samples': model_metadata.get('preset_samples', 0),
                'user_samples': model_metadata.get('user_samples', 0),
                'filtered_samples': model_metadata.get('filtered_samples', 0),
                'low_confidence_samples': model_metadata.get('low_confidence_samples', {}),
            }
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'fallback': True
        }), 500


@app.route('/api/train-model', methods=['POST'])
def train_model_handler():
    global model, vectorizer, model_metrics, model_metadata, model_version
    try:
        result = retrain_model()
        if result.get('model_updated'):
            model, vectorizer, model_metadata = load_model()
            model_version += 1
        else:
            model_metadata = result.get('metadata', model_metadata)
        model_metrics = result.get('metrics', {})
        return jsonify({
            'r2_score': result['metrics'].get('r2_score'),
            'mae': result['metrics'].get('mae'),
            'ratio_mae': result['metrics'].get('ratio_mae'),
            'train_metrics': result.get('train_metrics', {}),
            'validation_metrics': result.get('validation_metrics', {}),
            'previous_validation_metrics': result.get('previous_validation_metrics', {}),
            'training_samples': result['total_samples'],
            'preset_samples': result['preset_samples'],
            'user_samples': result['user_samples'],
            'filtered_samples': result.get('filtered_samples', 0),
            'filter_reasons': result.get('filter_reasons', {}),
            'estimator_mode': result['metadata'].get('estimator_mode'),
            'model_updated': result.get('model_updated', False),
            'training_decision': result.get('decision', {}),
            'training_report': result.get('training_report', {}),
            'model_version': f'v{model_version}',
            'message': (
                f'新模型验证 MAE 更优，已替换线上模型，共 {result["total_samples"]} 条训练样本'
                if result.get('model_updated') else
                '新模型验证 MAE 未提升，已保留旧模型继续服务'
            )
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/collect-training-data', methods=['POST'])
def collect_training_data():
    data = request.get_json() or {}
    task_name = data.get('task_name', '')
    category = data.get('category', '其他')
    context = data.get('context', '')
    estimated_minutes = int(data.get('estimated_minutes', 0) or 0)
    actual_minutes = int(data.get('actual_minutes', 0) or 0)
    structured_features = _extract_structured_features(data, task_name, category, context)

    if not task_name or actual_minutes <= 0:
        return jsonify({'error': '缺少 task_name 或 actual_minutes'}), 400

    existing = _load_json_list(USER_DATA_FILE)

    collected_at = datetime.datetime.now().isoformat()
    estimate_ratio = None
    if estimated_minutes > 0:
        estimate_ratio = round(actual_minutes / max(estimated_minutes, 1), 3)
    sample_quality = assess_sample_quality(
        estimated_minutes,
        actual_minutes,
        structured_features
    )
    accepted_for_training = (
        estimated_minutes > 0 and
        actual_minutes <= MAX_TARGET_MINUTES and
        not sample_quality['exclude_from_training']
    )

    existing.append({
        'task_name': task_name,
        'category': category,
        'context': context,
        'estimated_minutes': estimated_minutes,
        'actual_minutes': actual_minutes,
        'difficulty': structured_features['difficulty'],
        'familiarity': structured_features['familiarity'],
        'steps_count': structured_features['steps_count'],
        'deadline_pressure': structured_features['deadline_pressure'],
        'output_type': structured_features['output_type'],
        'structured_features': structured_features,
        'collected_at': collected_at,
        'sample_version': 3,
        'sample': {
            'version': 3,
            'features': {
                'task_name': task_name,
                'category': category,
                'context': context,
                'estimated_minutes': estimated_minutes,
                'difficulty': structured_features['difficulty'],
                'familiarity': structured_features['familiarity'],
                'steps_count': structured_features['steps_count'],
                'deadline_pressure': structured_features['deadline_pressure'],
                'output_type': structured_features['output_type'],
                'structured_features': structured_features,
            },
            'labels': {
                'actual_minutes': actual_minutes,
            },
            'quality': {
                'estimate_ratio': estimate_ratio,
                'has_estimate_reference': estimated_minutes > 0,
                'low_confidence': sample_quality['low_confidence'],
                'exclude_from_training': sample_quality['exclude_from_training'],
                'confidence_score': sample_quality['confidence_score'],
                'flags': sample_quality['flags'],
            },
            'meta': {
                'source': 'desktop_task_completion',
                'collected_at': collected_at,
            }
        }
    })

    _write_json_list(USER_DATA_FILE, existing)

    return jsonify({
        'success': True,
        'user_data_count': len(existing),
        'structured_features': structured_features,
        'sample_quality': sample_quality,
        'accepted_for_training': accepted_for_training,
        'message': f'训练数据已收集，当前用户数据 {len(existing)} 条'
    })


@app.route('/api/training-status', methods=['GET'])
def training_status():
    global model_metrics, model_metadata, model_version
    preset_count = 0
    user_count = 0
    report = {}
    try:
        import json as _json
        if os.path.exists(os.path.join(MODEL_DIR, 'training_data.json')):
            with open(os.path.join(MODEL_DIR, 'training_data.json'), 'r', encoding='utf-8') as f:
                preset_count = len(_json.load(f))
        if os.path.exists(USER_DATA_FILE):
            with open(USER_DATA_FILE, 'r', encoding='utf-8') as f:
                user_count = len(_json.load(f))
        report = load_training_report()
    except Exception:
        pass

    return jsonify({
        'model_loaded': model is not None,
        'model_version': f'v{model_version}',
        'preset_samples': preset_count,
        'user_samples': user_count,
        'usable_preset_samples': model_metadata.get('preset_samples', preset_count),
        'usable_user_samples': model_metadata.get('user_samples', user_count),
        'filtered_samples': model_metadata.get('filtered_samples', 0),
        'low_confidence_samples': model_metadata.get('low_confidence_samples', {}),
        'filter_reasons': model_metadata.get('filter_reasons', {}),
        'last_metrics': model_metrics,
        'validation_metrics': model_metadata.get('validation_metrics', {}),
        'train_metrics': model_metadata.get('train_metrics', {}),
        'last_training_report': report
    })


@app.route('/api/time-estimation-training-explanation', methods=['GET'])
def time_estimation_training_explanation():
    global model, vectorizer, model_metadata, model_version
    try:
        explanation = build_training_explanation(
            model=model,
            vectorizer=vectorizer,
            metadata=model_metadata
        )
        explanation['model_version'] = f'v{model_version}'
        return jsonify(explanation)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print('[PlanMosaic Python ML] Starting on port 5100...')
    try:
        model, vectorizer, init_info = initialize_model()
        model_metrics = init_info.get('metrics', {})
        model_metadata = init_info.get('metadata', {})
        print(f'[PlanMosaic Python ML] Model initialized: {init_info}')
    except Exception as e:
        print(f'[PlanMosaic Python ML] Model init warning: {e}')
    app.run(host='127.0.0.1', port=5100, debug=False)
