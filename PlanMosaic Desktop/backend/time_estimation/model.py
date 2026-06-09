import os
import json
import datetime
import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE = os.path.join(MODEL_DIR, 'model.pkl')
VECTORIZER_FILE = os.path.join(MODEL_DIR, 'vectorizer.pkl')
METADATA_FILE = os.path.join(MODEL_DIR, 'model_metadata.json')
TRAINING_REPORT_FILE = os.path.join(MODEL_DIR, 'training_report.json')
TRAINING_DATA_FILE = os.path.join(MODEL_DIR, 'training_data.json')
USER_DATA_FILE = os.path.join(MODEL_DIR, 'user_training_data.json')
MAX_TARGET_MINUTES = 24 * 60
IQR_FILTER_MIN_SAMPLES = 8
MAX_ESTIMATE_DEVIATION_RATIO = 6.0
MAX_STRUCTURED_STEPS_COUNT = 12
LOW_CONFIDENCE_RATIO = 3.0
EXCLUDE_RATIO = 4.5
LOW_CONFIDENCE_MINUTES_PER_STEP = 210
EXCLUDE_MINUTES_PER_STEP = 360
STRUCTURED_OUTPUT_TYPES = {
    'deliverable',
    'communication',
    'learning',
    'execution',
    'planning',
    'other',
}
ESTIMATOR_MODE = 'baseline_calibrated_ratio_v1'
BASELINE_RULE_VERSION = 1
TRAINING_EXPLANATION_VERSION = 1
DEFAULT_BASELINE_MINUTES = 30
MIN_CALIBRATION_RATIO = 0.45
MAX_CALIBRATION_RATIO = 2.8
VALIDATION_SPLIT_RATIO = 0.2
VALIDATION_RANDOM_STATE = 42
OUTPUT_TYPE_BASELINE_DELTAS = {
    'deliverable': 25,
    'communication': -5,
    'learning': 15,
    'execution': 5,
    'planning': 0,
    'other': 0,
}
OUTPUT_TYPE_LABELS = {
    'deliverable': '有明确交付物',
    'communication': '以沟通协作为主',
    'learning': '需要理解和吸收内容',
    'execution': '偏执行或操作类任务',
    'planning': '偏整理和规划',
    'other': '信息较少的通用任务',
}
DEADLINE_PRESSURE_DELTAS = {
    1: -5,
    2: 0,
    3: 5,
    4: 15,
    5: 25,
}


def _combine_features(task_name, category, context, structured_features=None, baseline_minutes=None):
    parts = [task_name or '', category or '']
    if context:
        parts.append(context)
    if structured_features:
        parts.append(
            ' '.join([
                f"difficulty_{structured_features['difficulty']}",
                f"familiarity_{structured_features['familiarity']}",
                f"steps_{structured_features['steps_count']}",
                f"deadline_{structured_features['deadline_pressure']}",
                f"output_{structured_features['output_type']}",
            ])
        )
    if baseline_minutes is not None:
        parts.append(f'baseline_bucket_{max(1, int(round(float(baseline_minutes) / 15.0)))}')
    return ' | '.join(parts)


def _safe_int(value, default=0):
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return default


def _clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def _contains_any(text, keywords):
    return any(keyword in text for keyword in keywords)


def _normalize_score(value, default_value, aliases=None):
    if isinstance(value, str):
        normalized = value.strip().lower()
        if aliases and normalized in aliases:
            return aliases[normalized]
    return _clamp(_safe_int(value, default_value), 1, 5)


def _normalize_output_type(value):
    if not isinstance(value, str):
        return ''
    normalized = value.strip().lower()
    aliases = {
        '文档': 'deliverable',
        '报告': 'deliverable',
        '作业': 'deliverable',
        '代码': 'deliverable',
        '交付物': 'deliverable',
        'deliverable': 'deliverable',
        '沟通': 'communication',
        '会议': 'communication',
        '回复': 'communication',
        'communication': 'communication',
        '学习': 'learning',
        '练习': 'learning',
        '复习': 'learning',
        'learning': 'learning',
        '执行': 'execution',
        '跑腿': 'execution',
        '运动': 'execution',
        'execution': 'execution',
        '规划': 'planning',
        '计划': 'planning',
        'planning': 'planning',
        '其他': 'other',
        'other': 'other',
    }
    return aliases.get(normalized, normalized if normalized in STRUCTURED_OUTPUT_TYPES else '')


def _infer_output_type(task_name, category, context):
    text = f'{task_name} {category} {context}'.lower()
    if _contains_any(text, ['学习', '复习', '刷题', '背诵', '笔记', '课程', '考试', '练习', '阅读']):
        return 'learning'
    if _contains_any(text, ['会议', '沟通', '讨论', '联系', '回复', '汇报', '邮件', '消息', '答辩', '电话']):
        return 'communication'
    if _contains_any(text, ['计划', '规划', '安排', '整理', '拆解', '清单']):
        return 'planning'
    if _contains_any(text, ['文档', '报告', 'ppt', '方案', '代码', '设计稿', '文章', '作业', '实验报告', '接口', '简历']):
        return 'deliverable'
    if _contains_any(text, ['执行', '测试', '调试', '安装', '清洁', '采购', '提交', '跑步', '健身', '办理']):
        return 'execution'
    return 'other'


def _infer_difficulty(task_name, category, context, output_type):
    text = f'{task_name} {category} {context}'.lower()
    score = 3
    if output_type in {'deliverable', 'learning'}:
        score += 1
    if _contains_any(text, ['论文', '架构', '系统', '开发', '调试', '分析', '实验', '研究', '压测', '复杂', '困难']):
        score += 1
    if _contains_any(text, ['热身', '整理', '回复', '简单', '例行', '日常']):
        score -= 1
    return _clamp(score, 1, 5)


def _infer_familiarity(task_name, category, context):
    text = f'{task_name} {category} {context}'.lower()
    if _contains_any(text, ['第一次', '新手', '陌生', '没做过', '不熟', '初次']):
        return 2
    if _contains_any(text, ['熟悉', '日常', '重复', '例行', '平时', '常规']):
        return 4
    return 3


def _infer_steps_count(task_name, context, output_type):
    text = f'{task_name} {context}'
    score = 1
    score += text.count('并') + text.count('、') + text.count('和')
    if _contains_any(text, ['整理', '分析', '设计', '撰写', '调试', '测试', '复盘', '汇总']):
        score += 1
    if output_type in {'deliverable', 'planning'}:
        score += 1
    if _contains_any(text, ['论文', '项目', '实验报告', '方案']):
        score += 2
    return _clamp(score, 1, MAX_STRUCTURED_STEPS_COUNT)


def _infer_deadline_pressure(task_name, context):
    text = f'{task_name} {context}'.lower()
    if _contains_any(text, ['马上', '立刻', '尽快', 'ddl', 'deadline', '今晚', '今天截止', '明天截止']):
        return 5
    if _contains_any(text, ['今天', '明天', '本周', '截止', '到期', '赶']):
        return 4
    if _contains_any(text, ['这周', '近期', '本月']):
        return 3
    return 2


def normalize_structured_features(task_name='', category='其他', context='', raw_features=None):
    raw = raw_features or {}
    if isinstance(raw.get('structured_features'), dict):
        raw = raw.get('structured_features') or {}

    inferred_output_type = _infer_output_type(task_name, category, context)
    output_type = _normalize_output_type(raw.get('output_type')) or inferred_output_type

    score_aliases = {
        '1': 1,
        '2': 2,
        '3': 3,
        '4': 4,
        '5': 5,
        '低': 2,
        '较低': 2,
        '中': 3,
        '中等': 3,
        '高': 4,
        '较高': 4,
        '很高': 5,
        '简单': 2,
        '普通': 3,
        '困难': 4,
        '很难': 5,
        '陌生': 2,
        '一般': 3,
        '熟悉': 4,
        '非常熟悉': 5,
        '轻': 2,
        '紧': 4,
    }

    difficulty = _normalize_score(
        raw.get('difficulty'),
        _infer_difficulty(task_name, category, context, output_type),
        aliases=score_aliases
    )
    familiarity = _normalize_score(
        raw.get('familiarity'),
        _infer_familiarity(task_name, category, context),
        aliases=score_aliases
    )
    deadline_pressure = _normalize_score(
        raw.get('deadline_pressure'),
        _infer_deadline_pressure(task_name, context),
        aliases=score_aliases
    )
    steps_count = _clamp(
        _safe_int(raw.get('steps_count'), _infer_steps_count(task_name, context, output_type)),
        1,
        MAX_STRUCTURED_STEPS_COUNT
    )

    return {
        'difficulty': difficulty,
        'familiarity': familiarity,
        'steps_count': steps_count,
        'deadline_pressure': deadline_pressure,
        'output_type': output_type,
    }


def _round_minutes(value):
    rounded = int(round(float(value)))
    if rounded <= 15:
        return max(5, int(round(rounded / 5.0) * 5))
    return max(5, int(round(rounded / 5.0) * 5))


def _build_factor(name, impact_minutes, reason, stage):
    impact_minutes = int(round(float(impact_minutes)))
    if impact_minutes > 0:
        direction = 'increase'
    elif impact_minutes < 0:
        direction = 'decrease'
    else:
        direction = 'neutral'
    return {
        'name': name,
        'impact_minutes': impact_minutes,
        'direction': direction,
        'reason': reason,
        'stage': stage,
    }


def _keyword_delta(task_name, category, context):
    text = f'{task_name} {category} {context}'.lower()
    factors = []

    if _contains_any(text, ['论文', '报告', 'ppt', '原型', '方案', '代码', '开发', '调试', '实验报告', '答辩']):
        factors.append(_build_factor('任务内容', 20, '任务描述显示需要产出较完整成果，通常更耗时', 'baseline'))
    if _contains_any(text, ['整理', '核对', '回复', '热身', '签到', '打卡', '例行']):
        factors.append(_build_factor('任务内容', -10, '任务描述更像短流程或例行事项，基础耗时会更短', 'baseline'))
    if _contains_any(text, ['第一次', '新手', '陌生', '没做过', '从零开始']):
        factors.append(_build_factor('经验情况', 10, '任务文本提示是首次或不熟悉场景，需要预留摸索时间', 'baseline'))
    if _contains_any(text, ['复盘', '总结', '汇总', '分析', '设计']):
        factors.append(_build_factor('处理深度', 10, '任务包含分析或总结环节，往往不止是机械执行', 'baseline'))

    total_delta = sum(factor['impact_minutes'] for factor in factors)
    return total_delta, factors


def calculate_rule_baseline(task_name, category, context='', structured_features=None):
    normalized_features = normalize_structured_features(task_name, category, context, structured_features)
    factors = []
    total_minutes = DEFAULT_BASELINE_MINUTES

    output_type = normalized_features['output_type']
    output_delta = OUTPUT_TYPE_BASELINE_DELTAS.get(output_type, 0)
    total_minutes += output_delta
    factors.append(
        _build_factor(
            '产出类型',
            output_delta,
            OUTPUT_TYPE_LABELS.get(output_type, '根据任务产出类型调整基础耗时'),
            'baseline'
        )
    )

    difficulty_delta = (normalized_features['difficulty'] - 3) * 15
    if difficulty_delta:
        factors.append(
            _build_factor(
                '任务难度',
                difficulty_delta,
                f"当前难度评分为 {normalized_features['difficulty']}，难度越高越需要额外时间",
                'baseline'
            )
        )
    total_minutes += difficulty_delta

    familiarity_delta = (3 - normalized_features['familiarity']) * 12
    if familiarity_delta:
        familiarity_reason = (
            f"当前熟悉度为 {normalized_features['familiarity']}，越不熟悉越需要摸索"
            if familiarity_delta > 0 else
            f"当前熟悉度为 {normalized_features['familiarity']}，熟悉任务通常会更快"
        )
        factors.append(_build_factor('熟悉度', familiarity_delta, familiarity_reason, 'baseline'))
    total_minutes += familiarity_delta

    steps_delta = (normalized_features['steps_count'] - 1) * 8
    if steps_delta:
        factors.append(
            _build_factor(
                '步骤数',
                steps_delta,
                f"步骤数为 {normalized_features['steps_count']}，拆分环节越多通常越耗时",
                'baseline'
            )
        )
    total_minutes += steps_delta

    deadline_delta = DEADLINE_PRESSURE_DELTAS.get(normalized_features['deadline_pressure'], 0)
    if deadline_delta:
        deadline_reason = (
            f"截止压力为 {normalized_features['deadline_pressure']}，通常需要预留沟通或返工缓冲"
            if deadline_delta > 0 else
            '截止压力较低，可按更平稳节奏安排'
        )
        factors.append(_build_factor('截止压力', deadline_delta, deadline_reason, 'baseline'))
    total_minutes += deadline_delta

    keyword_delta, keyword_factors = _keyword_delta(task_name, category, context)
    total_minutes += keyword_delta
    factors.extend(keyword_factors)

    unclamped_minutes = total_minutes
    baseline_minutes = _clamp(_round_minutes(total_minutes), 5, MAX_TARGET_MINUTES)
    sorted_factors = sorted(
        [factor for factor in factors if factor['impact_minutes'] != 0],
        key=lambda item: abs(item['impact_minutes']),
        reverse=True
    )

    return {
        'baseline_minutes': baseline_minutes,
        'unclamped_minutes': _round_minutes(unclamped_minutes),
        'structured_features': normalized_features,
        'factor_details': factors,
        'top_factors': sorted_factors[:3],
        'summary': ' + '.join(
            factor['reason'] for factor in sorted_factors[:2]
        ) or '根据结构化字段生成基础时间',
    }


def assess_sample_quality(estimated_minutes, actual_minutes, structured_features):
    estimated_minutes = _safe_int(estimated_minutes, 0)
    actual_minutes = _safe_int(actual_minutes, 0)
    steps_count = max(1, _safe_int((structured_features or {}).get('steps_count'), 1))
    flags = []
    confidence_score = 100
    exclude_from_training = False

    if actual_minutes <= 0:
        return {
            'low_confidence': False,
            'exclude_from_training': True,
            'flags': ['non_positive_actual_minutes'],
            'confidence_score': 100,
        }

    if actual_minutes > MAX_TARGET_MINUTES:
        return {
            'low_confidence': True,
            'exclude_from_training': True,
            'flags': ['actual_minutes_too_large'],
            'confidence_score': 0,
        }

    if estimated_minutes <= 0:
        flags.append('missing_estimated_reference')
        confidence_score -= 20

    if estimated_minutes > 0:
        ratio = actual_minutes / max(estimated_minutes, 1)
        if ratio > EXCLUDE_RATIO or ratio < (1.0 / EXCLUDE_RATIO):
            exclude_from_training = True
            flags.append('estimate_gap_extreme')
            confidence_score -= 55
        elif ratio > LOW_CONFIDENCE_RATIO or ratio < (1.0 / LOW_CONFIDENCE_RATIO):
            flags.append('estimate_gap_large')
            confidence_score -= 25

    minutes_per_step = actual_minutes / max(steps_count, 1)
    if minutes_per_step > EXCLUDE_MINUTES_PER_STEP:
        exclude_from_training = True
        flags.append('minutes_per_step_extreme')
        confidence_score -= 45
    elif minutes_per_step > LOW_CONFIDENCE_MINUTES_PER_STEP:
        flags.append('minutes_per_step_high')
        confidence_score -= 20

    if actual_minutes < max(3, steps_count):
        flags.append('actual_minutes_suspiciously_short')
        confidence_score -= 15

    confidence_score = max(0, confidence_score)
    return {
        'low_confidence': bool(flags),
        'exclude_from_training': exclude_from_training,
        'flags': flags,
        'confidence_score': confidence_score,
    }


def _normalize_sample(raw_sample, target_key, sample_source):
    structured = raw_sample.get('sample') or {}
    features = structured.get('features') or {}
    labels = structured.get('labels') or {}
    quality = structured.get('quality') or {}
    meta = structured.get('meta') or {}

    task_name = (features.get('task_name') or raw_sample.get('task_name') or '').strip()
    category = (features.get('category') or raw_sample.get('category') or '其他').strip() or '其他'
    context = (features.get('context') or raw_sample.get('context') or '').strip()

    estimated_minutes = _safe_int(
        features.get('estimated_minutes', raw_sample.get('estimated_minutes')),
        0
    )
    actual_minutes = _safe_int(
        labels.get('actual_minutes', raw_sample.get('actual_minutes')),
        0
    )
    if target_key == 'estimated_minutes':
        target_minutes = _safe_int(
            labels.get('estimated_minutes', raw_sample.get('estimated_minutes')),
            0
        )
    else:
        target_minutes = actual_minutes

    structured_features = normalize_structured_features(
        task_name,
        category,
        context,
        {
            'difficulty': features.get('difficulty', raw_sample.get('difficulty')),
            'familiarity': features.get('familiarity', raw_sample.get('familiarity')),
            'steps_count': features.get('steps_count', raw_sample.get('steps_count')),
            'deadline_pressure': features.get('deadline_pressure', raw_sample.get('deadline_pressure')),
            'output_type': features.get('output_type', raw_sample.get('output_type')),
            'structured_features': features.get('structured_features', raw_sample.get('structured_features')),
        }
    )
    quality_reference_minutes = actual_minutes if actual_minutes > 0 else target_minutes
    quality_estimated_minutes = estimated_minutes if estimated_minutes > 0 else target_minutes
    computed_quality = assess_sample_quality(
        quality_estimated_minutes,
        quality_reference_minutes,
        structured_features
    )
    stored_flags = quality.get('flags') or quality.get('quality_flags') or []
    combined_flags = list(dict.fromkeys(list(stored_flags) + computed_quality['flags']))
    low_confidence = bool(quality.get('low_confidence')) or computed_quality['low_confidence']
    exclude_from_training = bool(quality.get('exclude_from_training')) or computed_quality['exclude_from_training']
    confidence_score = _safe_int(
        quality.get('confidence_score', computed_quality['confidence_score']),
        computed_quality['confidence_score']
    )
    baseline_info = calculate_rule_baseline(task_name, category, context, structured_features)
    baseline_minutes = baseline_info['baseline_minutes']
    calibration_ratio = _clamp(
        float(target_minutes) / max(float(baseline_minutes), 1.0),
        MIN_CALIBRATION_RATIO,
        MAX_CALIBRATION_RATIO
    )

    return {
        'task_name': task_name,
        'category': category,
        'context': context,
        'estimated_minutes': estimated_minutes,
        'actual_minutes': actual_minutes,
        'target_minutes': target_minutes,
        'source': meta.get('source') or raw_sample.get('source') or sample_source,
        'sample_version': structured.get('version', raw_sample.get('sample_version', 1)),
        'estimate_ratio': quality.get('estimate_ratio'),
        'structured_features': structured_features,
        'baseline_minutes': baseline_minutes,
        'baseline_summary': baseline_info['summary'],
        'calibration_ratio': round(float(calibration_ratio), 4),
        'low_confidence': low_confidence,
        'exclude_from_training': exclude_from_training,
        'quality_flags': combined_flags,
        'confidence_score': confidence_score,
    }


def _validate_sample(sample, require_estimate_reference=False):
    if not sample['task_name']:
        return False, 'missing_task_name'
    if sample['target_minutes'] <= 0:
        return False, 'non_positive_target'
    if sample['target_minutes'] > MAX_TARGET_MINUTES:
        return False, 'target_too_large'
    if require_estimate_reference and sample['estimated_minutes'] <= 0:
        return False, 'missing_estimated_minutes'

    if sample['estimated_minutes'] > 0 and sample['actual_minutes'] > 0:
        ratio = sample['actual_minutes'] / max(sample['estimated_minutes'], 1)
        if ratio > MAX_ESTIMATE_DEVIATION_RATIO or ratio < (1.0 / MAX_ESTIMATE_DEVIATION_RATIO):
            return False, 'estimate_deviation_too_large'

    structured_features = sample.get('structured_features') or {}
    if structured_features.get('output_type') not in STRUCTURED_OUTPUT_TYPES:
        return False, 'invalid_output_type'
    if sample.get('exclude_from_training'):
        return False, 'excluded_low_confidence_sample'

    return True, None


def _apply_iqr_filter(samples):
    if len(samples) < IQR_FILTER_MIN_SAMPLES:
        return samples, 0

    values = np.array([sample['target_minutes'] for sample in samples], dtype=float)
    q1, q3 = np.percentile(values, [25, 75])
    iqr = q3 - q1
    if iqr <= 0:
        return samples, 0

    lower = max(1.0, q1 - 1.5 * iqr)
    upper = min(float(MAX_TARGET_MINUTES), q3 + 1.5 * iqr)

    kept = []
    filtered = 0
    for sample in samples:
        if lower <= sample['target_minutes'] <= upper:
            kept.append(sample)
        else:
            filtered += 1
    return kept, filtered


def _build_training_features(sample):
    return _combine_features(
        sample['task_name'],
        sample['category'],
        sample['context'],
        sample.get('structured_features'),
        baseline_minutes=sample.get('baseline_minutes')
    )


def _vectorize_samples(samples):
    X = [_build_training_features(sample) for sample in samples]
    y = [sample['calibration_ratio'] for sample in samples]
    return X, y


def _split_training_samples(samples):
    if len(samples) < 2:
        return list(samples), []

    validation_size = max(1, int(round(len(samples) * VALIDATION_SPLIT_RATIO)))
    validation_size = min(validation_size, len(samples) - 1)
    train_samples, validation_samples = train_test_split(
        samples,
        test_size=validation_size,
        random_state=VALIDATION_RANDOM_STATE,
        shuffle=True,
    )
    return train_samples, validation_samples


def _load_samples(file_path, target_key, sample_source, apply_iqr=False, require_estimate_reference=False):
    if not os.path.exists(file_path):
        return [], {
            'raw_samples': 0,
            'usable_samples': 0,
            'filtered_samples': 0,
            'filter_reasons': {},
            'low_confidence_samples': 0,
        }

    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    normalized = []
    filter_reasons = {}
    low_confidence_samples = 0
    for raw_sample in data:
        sample = _normalize_sample(raw_sample, target_key, sample_source)
        is_valid, reason = _validate_sample(
            sample,
            require_estimate_reference=require_estimate_reference
        )
        if not is_valid:
            filter_reasons[reason] = filter_reasons.get(reason, 0) + 1
            continue
        if sample['low_confidence']:
            low_confidence_samples += 1
        normalized.append(sample)

    iqr_filtered = 0
    if apply_iqr:
        normalized, iqr_filtered = _apply_iqr_filter(normalized)
        if iqr_filtered:
            filter_reasons['iqr_outlier'] = filter_reasons.get('iqr_outlier', 0) + iqr_filtered

    stats = {
        'raw_samples': len(data),
        'usable_samples': len(normalized),
        'filtered_samples': len(data) - len(normalized),
        'filter_reasons': filter_reasons,
        'low_confidence_samples': low_confidence_samples,
    }
    return normalized, stats


def load_training_data():
    return _load_samples(TRAINING_DATA_FILE, 'estimated_minutes', 'preset_dataset')


def load_user_data():
    return _load_samples(
        USER_DATA_FILE,
        'actual_minutes',
        'desktop_task_completion',
        apply_iqr=True,
        require_estimate_reference=True
    )


def train_model(samples):
    X_texts, y_values = _vectorize_samples(samples)
    vectorizer = TfidfVectorizer(max_features=500, ngram_range=(1, 2))
    X = vectorizer.fit_transform(X_texts)

    model = RandomForestRegressor(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X, y_values)

    return model, vectorizer


def evaluate_model(model, vectorizer, samples):
    if len(samples) == 0:
        return {'r2_score': None, 'mae': None, 'ratio_mae': None, 'sample_count': 0}
    X_texts, y_values = _vectorize_samples(samples)
    X = vectorizer.transform(X_texts)
    ratio_predictions = np.clip(
        model.predict(X),
        MIN_CALIBRATION_RATIO,
        MAX_CALIBRATION_RATIO
    )
    minute_predictions = [
        _clamp(
            _round_minutes(pred_ratio * sample['baseline_minutes']),
            5,
            MAX_TARGET_MINUTES
        )
        for pred_ratio, sample in zip(ratio_predictions, samples)
    ]
    target_minutes = [sample['target_minutes'] for sample in samples]
    mae = mean_absolute_error(target_minutes, minute_predictions)
    ratio_mae = mean_absolute_error(y_values, ratio_predictions)
    r2 = None
    if len(samples) >= 2:
        r2 = round(float(r2_score(target_minutes, minute_predictions)), 4)
    return {
        'r2_score': r2,
        'mae': round(float(mae), 1),
        'ratio_mae': round(float(ratio_mae), 3),
        'sample_count': len(samples),
    }


def save_model(model, vectorizer, metadata):
    joblib.dump(model, MODEL_FILE)
    joblib.dump(vectorizer, VECTORIZER_FILE)
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)


def load_model():
    if not os.path.exists(MODEL_FILE) or not os.path.exists(VECTORIZER_FILE):
        return None, None, {}
    model = joblib.load(MODEL_FILE)
    vectorizer = joblib.load(VECTORIZER_FILE)
    metadata = {}
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
    return model, vectorizer, metadata


def load_training_report():
    if not os.path.exists(TRAINING_REPORT_FILE):
        return {}
    with open(TRAINING_REPORT_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_training_report(report):
    with open(TRAINING_REPORT_FILE, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)


def _build_metadata(preset_stats, user_stats, all_samples, metrics, train_metrics=None, validation_metrics=None):
    return {
        'estimator_mode': ESTIMATOR_MODE,
        'baseline_version': BASELINE_RULE_VERSION,
        'preset_samples': preset_stats['usable_samples'],
        'user_samples': user_stats['usable_samples'],
        'total_samples': len(all_samples),
        'filtered_samples': preset_stats['filtered_samples'] + user_stats['filtered_samples'],
        'low_confidence_samples': {
            'preset': preset_stats.get('low_confidence_samples', 0),
            'user': user_stats.get('low_confidence_samples', 0),
        },
        'filter_reasons': {
            'preset': preset_stats['filter_reasons'],
            'user': user_stats['filter_reasons'],
        },
        'metrics': metrics,
        'train_metrics': train_metrics or {},
        'validation_metrics': validation_metrics or {},
    }


def _load_all_training_samples():
    preset_samples, preset_stats = load_training_data()
    user_samples, user_stats = load_user_data()
    all_samples = preset_samples + user_samples
    return preset_samples, user_samples, all_samples, preset_stats, user_stats


def _evaluate_existing_model(model, vectorizer, validation_samples):
    if model is None or vectorizer is None:
        return {'r2_score': None, 'mae': None, 'ratio_mae': None, 'sample_count': len(validation_samples)}
    try:
        return evaluate_model(model, vectorizer, validation_samples)
    except Exception as exc:
        return {
            'r2_score': None,
            'mae': None,
            'ratio_mae': None,
            'sample_count': len(validation_samples),
            'error': str(exc),
        }


def _decide_model_replacement(existing_model, candidate_validation_metrics, existing_validation_metrics):
    candidate_mae = candidate_validation_metrics.get('mae')
    existing_mae = existing_validation_metrics.get('mae')

    if existing_model is None:
        return {
            'action': 'initialize',
            'should_replace': True,
            'reason': 'no_existing_model',
            'mae_improvement': None,
        }

    if candidate_mae is None:
        return {
            'action': 'keep_existing',
            'should_replace': False,
            'reason': 'candidate_validation_mae_unavailable',
            'mae_improvement': None,
        }

    if existing_mae is None:
        return {
            'action': 'replace',
            'should_replace': True,
            'reason': 'existing_validation_mae_unavailable',
            'mae_improvement': None,
        }

    mae_improvement = round(float(existing_mae - candidate_mae), 1)
    if candidate_mae < existing_mae:
        return {
            'action': 'replace',
            'should_replace': True,
            'reason': 'candidate_validation_mae_improved',
            'mae_improvement': mae_improvement,
        }

    return {
        'action': 'keep_existing',
        'should_replace': False,
        'reason': 'candidate_validation_mae_not_improved',
        'mae_improvement': mae_improvement,
    }


def _build_training_report(
    preset_stats,
    user_stats,
    all_samples,
    train_samples,
    validation_samples,
    candidate_train_metrics,
    candidate_validation_metrics,
    existing_validation_metrics,
    decision,
    existing_metadata,
):
    return {
        'trained_at': datetime.datetime.now().isoformat(),
        'estimator_mode': ESTIMATOR_MODE,
        'baseline_version': BASELINE_RULE_VERSION,
        'dataset': {
            'preset_samples': preset_stats['usable_samples'],
            'user_samples': user_stats['usable_samples'],
            'total_samples': len(all_samples),
            'train_samples': len(train_samples),
            'validation_samples': len(validation_samples),
            'validation_ratio': VALIDATION_SPLIT_RATIO,
            'filtered_samples': preset_stats['filtered_samples'] + user_stats['filtered_samples'],
            'low_confidence_samples': {
                'preset': preset_stats.get('low_confidence_samples', 0),
                'user': user_stats.get('low_confidence_samples', 0),
            },
            'filter_reasons': {
                'preset': preset_stats['filter_reasons'],
                'user': user_stats['filter_reasons'],
            },
        },
        'candidate_model': {
            'train_metrics': candidate_train_metrics,
            'validation_metrics': candidate_validation_metrics,
        },
        'serving_model_before_training': {
            'metrics': existing_metadata.get('metrics', {}),
            'validation_metrics': existing_validation_metrics,
            'total_samples': existing_metadata.get('total_samples', 0),
            'preset_samples': existing_metadata.get('preset_samples', 0),
            'user_samples': existing_metadata.get('user_samples', 0),
        },
        'decision': decision,
    }


def _run_training_cycle(existing_model=None, existing_vectorizer=None, existing_metadata=None):
    existing_metadata = existing_metadata or {}
    preset_samples, user_samples, all_samples, preset_stats, user_stats = _load_all_training_samples()
    if len(all_samples) == 0:
        raise ValueError('No training data available')

    train_samples, validation_samples = _split_training_samples(all_samples)
    candidate_model, candidate_vectorizer = train_model(train_samples)
    candidate_train_metrics = evaluate_model(candidate_model, candidate_vectorizer, train_samples)
    candidate_validation_metrics = evaluate_model(candidate_model, candidate_vectorizer, validation_samples)
    existing_validation_metrics = _evaluate_existing_model(
        existing_model,
        existing_vectorizer,
        validation_samples
    )
    decision = _decide_model_replacement(
        existing_model,
        candidate_validation_metrics,
        existing_validation_metrics
    )
    report = _build_training_report(
        preset_stats,
        user_stats,
        all_samples,
        train_samples,
        validation_samples,
        candidate_train_metrics,
        candidate_validation_metrics,
        existing_validation_metrics,
        decision,
        existing_metadata,
    )
    save_training_report(report)

    if decision['should_replace']:
        final_model, final_vectorizer = train_model(all_samples)
        final_fit_metrics = evaluate_model(final_model, final_vectorizer, all_samples)
        metadata_metrics = (
            candidate_validation_metrics
            if candidate_validation_metrics.get('mae') is not None else
            final_fit_metrics
        )
        metadata = _build_metadata(
            preset_stats,
            user_stats,
            all_samples,
            metadata_metrics,
            train_metrics=candidate_train_metrics,
            validation_metrics=candidate_validation_metrics,
        )
        save_model(final_model, final_vectorizer, metadata)
        return {
            'serving_model': final_model,
            'serving_vectorizer': final_vectorizer,
            'serving_metadata': metadata,
            'report': report,
            'decision': decision,
            'candidate_train_metrics': candidate_train_metrics,
            'candidate_validation_metrics': candidate_validation_metrics,
            'existing_validation_metrics': existing_validation_metrics,
            'model_updated': True,
            'preset_samples': len(preset_samples),
            'user_samples': len(user_samples),
            'total_samples': len(all_samples),
            'filtered_samples': metadata['filtered_samples'],
            'filter_reasons': metadata['filter_reasons'],
            'serving_metrics': metadata_metrics,
        }

    return {
        'serving_model': existing_model,
        'serving_vectorizer': existing_vectorizer,
        'serving_metadata': existing_metadata,
        'report': report,
        'decision': decision,
        'candidate_train_metrics': candidate_train_metrics,
        'candidate_validation_metrics': candidate_validation_metrics,
        'existing_validation_metrics': existing_validation_metrics,
        'model_updated': False,
        'preset_samples': len(preset_samples),
        'user_samples': len(user_samples),
        'total_samples': len(all_samples),
        'filtered_samples': preset_stats['filtered_samples'] + user_stats['filtered_samples'],
        'filter_reasons': {
            'preset': preset_stats['filter_reasons'],
            'user': user_stats['filter_reasons'],
        },
        'serving_metrics': existing_metadata.get('metrics', {}),
    }


def initialize_model():
    model, vectorizer, metadata = load_model()
    if (
        model is not None and
        metadata.get('estimator_mode') == ESTIMATOR_MODE and
        metadata.get('validation_metrics')
    ):
        return model, vectorizer, {
            'status': 'loaded',
            'samples': metadata.get('total_samples', 'existing'),
            'metrics': metadata.get('metrics', {}),
            'metadata': metadata,
        }
    cycle = _run_training_cycle(model, vectorizer, metadata)
    status = 'loaded' if (model is not None and not cycle['model_updated']) else (
        'migrated' if model is not None else 'trained'
    )
    return cycle['serving_model'], cycle['serving_vectorizer'], {
        'status': status,
        'samples': cycle['total_samples'],
        'metrics': cycle['serving_metrics'],
        'metadata': cycle['serving_metadata'],
        'training_report': cycle['report'],
    }


def _derive_confidence(prediction, confidence_interval, metadata):
    total_samples = metadata.get('total_samples', 0) or 0
    user_samples = metadata.get('user_samples', 0) or 0
    interval_width = max(0, confidence_interval[1] - confidence_interval[0])
    relative_width = interval_width / max(prediction, 1)

    score = 100
    reasons = []

    if total_samples < 20:
        score -= 35
        reasons.append('训练样本较少')
    elif total_samples < 60:
        score -= 15
        reasons.append('训练样本量一般')

    if user_samples == 0:
        score -= 20
        reasons.append('缺少用户真实完成样本')
    elif user_samples < 5:
        score -= 10
        reasons.append('用户真实完成样本较少')

    if relative_width > 1.2:
        score -= 35
        reasons.append('预测区间较宽')
    elif relative_width > 0.7:
        score -= 20
        reasons.append('预测区间偏宽')
    elif relative_width > 0.45:
        score -= 10
        reasons.append('预测存在一定波动')

    if score >= 75:
        level = '高'
    elif score >= 45:
        level = '中'
    else:
        level = '低'

    if not reasons:
        reasons.append('训练样本与预测区间表现稳定')

    return {
        'confidence_level': level,
        'low_confidence': level == '低',
        'confidence_reasons': reasons,
        'relative_interval_width': round(float(relative_width), 3),
    }


def _build_major_factors(baseline_info, calibration_delta, calibration_ratio, used_model):
    factors = list(baseline_info.get('top_factors') or [])
    if used_model and abs(calibration_delta) >= 5:
        compare_text = '更长' if calibration_delta > 0 else '更短'
        factors.insert(
            0,
            _build_factor(
                '模型校准',
                calibration_delta,
                f"模型结合历史样本判断，该任务通常会比规则基线{compare_text}",
                'calibration'
            )
        )
    limited = sorted(factors, key=lambda item: abs(item['impact_minutes']), reverse=True)[:3]
    summaries = [factor['reason'] for factor in limited]
    if used_model and abs(calibration_delta) < 5:
        summaries.append(
            f"模型校准系数约为 {round(float(calibration_ratio), 2)}，与规则基线接近"
        )
    return limited, summaries[:3]


def predict(model, vectorizer, task_name, category, context='', structured_features=None, metadata=None):
    baseline_info = calculate_rule_baseline(task_name, category, context, structured_features)
    normalized_features = baseline_info['structured_features']
    baseline_minutes = baseline_info['baseline_minutes']
    estimator_metadata = metadata or {}

    if model is None or vectorizer is None:
        confidence_interval = [
            max(5, _round_minutes(baseline_minutes * 0.75)),
            _clamp(_round_minutes(baseline_minutes * 1.35), 5, MAX_TARGET_MINUTES)
        ]
        factor_details, explanations = _build_major_factors(
            baseline_info,
            calibration_delta=0,
            calibration_ratio=1.0,
            used_model=False
        )
        confidence = _derive_confidence(baseline_minutes, confidence_interval, {'total_samples': 0, 'user_samples': 0})
        confidence['confidence_level'] = '低'
        confidence['low_confidence'] = True
        confidence['confidence_reasons'] = ['当前使用规则基线估算，尚未应用模型校准']
        return {
            'estimated_minutes': baseline_minutes,
            'baseline_minutes': baseline_minutes,
            'calibrated_minutes': baseline_minutes,
            'calibration_ratio': 1.0,
            'calibration_delta_minutes': 0,
            'baseline_comparison': '当前直接使用规则基线估算',
            'confidence_interval': confidence_interval,
            'major_factors': explanations,
            'factor_details': factor_details,
            'estimator_mode': 'baseline_only',
            'used_model': False,
            'fallback': True,
            'structured_features': normalized_features,
            **confidence,
        }

    text = _combine_features(
        task_name,
        category,
        context,
        normalized_features,
        baseline_minutes=baseline_minutes
    )
    X = vectorizer.transform([text])
    pred_ratio = float(np.clip(model.predict(X)[0], MIN_CALIBRATION_RATIO, MAX_CALIBRATION_RATIO))

    tree_preds = np.array([
        np.clip(tree.predict(X)[0], MIN_CALIBRATION_RATIO, MAX_CALIBRATION_RATIO)
        for tree in model.estimators_
    ])
    tree_minutes = np.array([
        _clamp(_round_minutes(ratio * baseline_minutes), 5, MAX_TARGET_MINUTES)
        for ratio in tree_preds
    ], dtype=float)
    std_dev = np.std(tree_minutes)

    estimated_minutes = _clamp(_round_minutes(pred_ratio * baseline_minutes), 5, MAX_TARGET_MINUTES)
    confidence_interval = [
        max(5, _round_minutes(estimated_minutes - 1.96 * std_dev)),
        _clamp(_round_minutes(estimated_minutes + 1.96 * std_dev), 5, MAX_TARGET_MINUTES)
    ]
    confidence = _derive_confidence(estimated_minutes, confidence_interval, estimator_metadata)
    calibration_delta = estimated_minutes - baseline_minutes
    factor_details, explanations = _build_major_factors(
        baseline_info,
        calibration_delta=calibration_delta,
        calibration_ratio=pred_ratio,
        used_model=True
    )

    return {
        'estimated_minutes': estimated_minutes,
        'baseline_minutes': baseline_minutes,
        'calibrated_minutes': estimated_minutes,
        'calibration_ratio': round(float(pred_ratio), 3),
        'calibration_delta_minutes': calibration_delta,
        'baseline_comparison': (
            f'模型校准后比基线增加 {calibration_delta} 分钟'
            if calibration_delta > 0 else
            f'模型校准后比基线减少 {abs(calibration_delta)} 分钟'
            if calibration_delta < 0 else
            '模型校准后与规则基线基本一致'
        ),
        'confidence_interval': confidence_interval,
        'major_factors': explanations,
        'factor_details': factor_details,
        'estimator_mode': estimator_metadata.get('estimator_mode', ESTIMATOR_MODE),
        'used_model': True,
        'fallback': False,
        'structured_features': normalized_features,
        **confidence,
    }


def build_training_explanation(model=None, vectorizer=None, metadata=None):
    estimator_metadata = metadata or {}
    example_task_name = '准备数据结构课程实验报告初稿'
    example_category = '学习'
    example_context = '需要先阅读实验要求，完成实验并整理成报告，和同学核对格式，本周截止'
    example_actual_minutes = 110

    example_features = normalize_structured_features(
        example_task_name,
        example_category,
        example_context
    )
    baseline_info = calculate_rule_baseline(
        example_task_name,
        example_category,
        example_context,
        example_features
    )
    prediction = predict(
        model,
        vectorizer,
        example_task_name,
        example_category,
        example_context,
        structured_features=example_features,
        metadata=estimator_metadata
    )
    feedback_quality = assess_sample_quality(
        prediction['estimated_minutes'],
        example_actual_minutes,
        example_features
    )
    future_calibration_ratio = round(
        float(example_actual_minutes) / max(float(baseline_info['baseline_minutes']), 1.0),
        3
    )

    return {
        'success': True,
        'version': TRAINING_EXPLANATION_VERSION,
        'title': 'PlanMosaic 时间评估模型训练说明',
        'audience': '非计算机专业本科生',
        'summary': (
            '这个方案不是从零训练大模型，而是先把任务整理成少量容易理解的特征，'
            '再用规则算出基线时间，最后由轻量模型根据历史样本做校准。'
        ),
        'what_llm_does': '主要负责理解任务文本、补齐结构化信息，不直接学习全部时间规律。',
        'what_model_does': '主要学习“规则基线和真实结果之间通常差多少”，输出校准比例。',
        'implementation_alignment': {
            'estimator_mode': estimator_metadata.get('estimator_mode', ESTIMATOR_MODE),
            'baseline_version': BASELINE_RULE_VERSION,
            'functions': [
                'normalize_structured_features',
                'calculate_rule_baseline',
                'predict',
                'assess_sample_quality',
                'retrain_model',
            ],
        },
        'training_data_flow': [
            {
                'step': '整理样本',
                'plain_text': (
                    '系统会保存任务名称、类别、上下文、估算值、实际值，以及难度、熟悉度、步骤数、'
                    '截止压力、产出类型等结构化特征。'
                ),
                'implementation': 'collect_training_data -> user_training_data.json',
            },
            {
                'step': '提取特征',
                'plain_text': (
                    '如果用户没有显式填写特征，系统会从任务文本中推断；如果用户已经补充信息，'
                    '则优先使用用户给出的值。'
                ),
                'implementation': 'normalize_structured_features',
            },
            {
                'step': '计算基线',
                'plain_text': (
                    '先从 30 分钟基础值出发，再按产出类型、难度、熟悉度、步骤数、截止压力和关键词做加减。'
                ),
                'implementation': 'calculate_rule_baseline',
            },
            {
                'step': '模型校准',
                'plain_text': (
                    '轻量模型不直接预测分钟数，而是预测一个校准比例，再乘回基线时间，'
                    '所以结果更容易解释。'
                ),
                'implementation': 'train_model / predict',
            },
            {
                'step': '实际反馈',
                'plain_text': (
                    '任务完成后，系统把实际用时写回为新样本；重训练时会划分训练集和验证集，'
                    '只有验证 MAE 更优的新模型才会替换旧模型。'
                ),
                'implementation': '_split_training_samples / evaluate_model / retrain_model',
            },
        ],
        'feature_reference': [
            {
                'name': 'difficulty',
                'label': '任务难度',
                'range': '1-5',
                'meaning': '越难，基线时间越长；当前实现每高 1 档约增加 15 分钟。',
            },
            {
                'name': 'familiarity',
                'label': '熟悉度',
                'range': '1-5',
                'meaning': '越熟悉越快；当前实现每比中等熟悉低 1 档约增加 12 分钟。',
            },
            {
                'name': 'steps_count',
                'label': '步骤数',
                'range': '1-12',
                'meaning': '流程越多越耗时；当前实现每多 1 步约增加 8 分钟。',
            },
            {
                'name': 'deadline_pressure',
                'label': '截止压力',
                'range': '1-5',
                'meaning': '截止越近，越需要预留沟通和返工缓冲。',
            },
            {
                'name': 'output_type',
                'label': '产出类型',
                'range': 'deliverable / communication / learning / execution / planning / other',
                'meaning': '不同产出类型对应不同的基线加减规则，例如交付物通常比纯沟通更耗时。',
            },
        ],
        'example': {
            'task_description': {
                'task_name': example_task_name,
                'category': example_category,
                'context': example_context,
            },
            'feature_extraction': {
                'structured_features': example_features,
                'explanation': (
                    '这个示例没有手动填写特征，因此结果来自真实代码中的自动推断逻辑。'
                ),
            },
            'baseline_estimation': {
                'baseline_minutes': baseline_info['baseline_minutes'],
                'summary': baseline_info['summary'],
                'factor_details': baseline_info['factor_details'],
            },
            'model_calibration': {
                'estimated_minutes': prediction['estimated_minutes'],
                'calibrated_minutes': prediction['calibrated_minutes'],
                'calibration_ratio': prediction['calibration_ratio'],
                'calibration_delta_minutes': prediction['calibration_delta_minutes'],
                'used_model': prediction['used_model'],
                'baseline_comparison': prediction['baseline_comparison'],
                'major_factors': prediction['major_factors'],
                'confidence_level': prediction['confidence_level'],
                'confidence_interval': prediction['confidence_interval'],
            },
            'actual_feedback': {
                'assumed_actual_minutes': example_actual_minutes,
                'feedback_note': '这里的实际用时是课程展示示例值，用来演示任务完成后如何形成训练反馈。',
                'sample_quality': feedback_quality,
                'future_training_signal': {
                    'target_minutes': example_actual_minutes,
                    'baseline_minutes': baseline_info['baseline_minutes'],
                    'future_calibration_ratio': future_calibration_ratio,
                    'meaning': (
                        '这表示如果后续重训练吸收了该样本，模型会学习这类任务相对规则基线是偏长还是偏短。'
                    ),
                },
            },
        },
        'teaching_notes': [
            '预置样本用于让模型先具备基础判断能力，用户自己的完成记录才会逐步把结果拉向个人节奏。',
            '低可信或异常样本不会直接进入训练，以减少错误反馈对模型的污染。',
            '课程展示时可以把它理解为“先有可解释规则，再用数据做微调”，而不是黑箱预测。',
        ],
        'training_summary': {
            'total_samples': estimator_metadata.get('total_samples', 0),
            'preset_samples': estimator_metadata.get('preset_samples', 0),
            'user_samples': estimator_metadata.get('user_samples', 0),
            'filtered_samples': estimator_metadata.get('filtered_samples', 0),
            'validation_metrics': estimator_metadata.get('validation_metrics', {}),
        },
    }


def retrain_model():
    existing_model, existing_vectorizer, existing_metadata = load_model()
    cycle = _run_training_cycle(existing_model, existing_vectorizer, existing_metadata)
    return {
        'status': 'retrained' if cycle['model_updated'] else 'kept_existing',
        'preset_samples': cycle['preset_samples'],
        'user_samples': cycle['user_samples'],
        'total_samples': cycle['total_samples'],
        'filtered_samples': cycle['filtered_samples'],
        'filter_reasons': cycle['filter_reasons'],
        'metrics': cycle['serving_metrics'],
        'metadata': cycle['serving_metadata'],
        'train_metrics': cycle['candidate_train_metrics'],
        'validation_metrics': cycle['candidate_validation_metrics'],
        'previous_validation_metrics': cycle['existing_validation_metrics'],
        'decision': cycle['decision'],
        'training_report': cycle['report'],
        'model_updated': cycle['model_updated'],
    }
