import os
import json
import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import cross_val_score
from sklearn.metrics import mean_absolute_error, r2_score

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE = os.path.join(MODEL_DIR, 'model.pkl')
VECTORIZER_FILE = os.path.join(MODEL_DIR, 'vectorizer.pkl')
TRAINING_DATA_FILE = os.path.join(MODEL_DIR, 'training_data.json')
USER_DATA_FILE = os.path.join(MODEL_DIR, 'user_training_data.json')


def _combine_features(task_name, category, context):
    parts = [task_name or '', category or '']
    if context:
        parts.append(context)
    return ' | '.join(parts)


def load_training_data():
    if not os.path.exists(TRAINING_DATA_FILE):
        return [], []
    with open(TRAINING_DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    X = [_combine_features(d['task_name'], d['category'], d.get('context', '')) for d in data]
    y = [d['estimated_minutes'] for d in data]
    return X, y


def load_user_data():
    if not os.path.exists(USER_DATA_FILE):
        return [], []
    with open(USER_DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    X = [_combine_features(d['task_name'], d['category'], d.get('context', '')) for d in data]
    y = [d['actual_minutes'] for d in data]
    return X, y


def train_model(X_texts, y_values):
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


def evaluate_model(model, vectorizer, X_texts, y_values):
    if len(y_values) < 5:
        return {'r2_score': None, 'mae': None}
    X = vectorizer.transform(X_texts)
    predictions = model.predict(X)
    mae = mean_absolute_error(y_values, predictions)
    r2 = r2_score(y_values, predictions)
    return {'r2_score': round(float(r2), 4), 'mae': round(float(mae), 1)}


def save_model(model, vectorizer):
    joblib.dump(model, MODEL_FILE)
    joblib.dump(vectorizer, VECTORIZER_FILE)


def load_model():
    if not os.path.exists(MODEL_FILE) or not os.path.exists(VECTORIZER_FILE):
        return None, None
    model = joblib.load(MODEL_FILE)
    vectorizer = joblib.load(VECTORIZER_FILE)
    return model, vectorizer


def initialize_model():
    model, vectorizer = load_model()
    if model is not None:
        return model, vectorizer, {'status': 'loaded', 'samples': 'existing'}

    X, y = load_training_data()
    if len(X) == 0:
        raise ValueError('No training data available')

    model, vectorizer = train_model(X, y)
    save_model(model, vectorizer)
    metrics = evaluate_model(model, vectorizer, X, y)
    return model, vectorizer, {
        'status': 'trained',
        'samples': len(X),
        'metrics': metrics
    }


def predict(model, vectorizer, task_name, category, context=''):
    if model is None or vectorizer is None:
        raise ValueError('Model not loaded')
    text = _combine_features(task_name, category, context)
    X = vectorizer.transform([text])
    pred = model.predict(X)[0]

    tree_preds = np.array([tree.predict(X)[0] for tree in model.estimators_])
    std_dev = np.std(tree_preds)
    confidence_interval = [max(1, round(pred - 1.96 * std_dev)), round(pred + 1.96 * std_dev)]

    return round(float(pred)), confidence_interval


def retrain_model():
    preset_X, preset_y = load_training_data()
    user_X, user_y = load_user_data()

    all_X = preset_X + user_X
    all_y = preset_y + user_y

    if len(all_X) == 0:
        raise ValueError('No training data available')

    model, vectorizer = train_model(all_X, all_y)
    save_model(model, vectorizer)
    metrics = evaluate_model(model, vectorizer, all_X, all_y)

    return {
        'status': 'retrained',
        'preset_samples': len(preset_X),
        'user_samples': len(user_X),
        'total_samples': len(all_X),
        'metrics': metrics
    }