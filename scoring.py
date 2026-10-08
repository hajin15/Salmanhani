"""
살만하니 점수 계산 모듈

6개 카테고리 × 기본 가중치 = 100점 만점
가중치는 사용자 슬라이더로 조정 가능
"""


# 기본 카테고리 가중치 (합 = 100)
DEFAULT_WEIGHTS = {
    "transit":      20,  # 교통
    "convenience":  20,  # 편의시설
    "food":         15,  # 식생활
    "medical":      15,  # 의료
    "leisure":      15,  # 여가·운동
    "safety":       15,  # 야간 안전
}

CATEGORY_LABELS = {
    "transit":      "교통",
    "convenience":  "편의시설",
    "food":         "식생활",
    "medical":      "의료",
    "leisure":      "여가·운동",
    "safety":       "야간 안전",
}


def _closest(places: list) -> int | None:
    """가장 가까운 시설의 거리(m) 반환. 없으면 None"""
    if not places:
        return None
    return min(p["distance"] for p in places)


def _count_within(places: list, max_dist: int) -> int:
    return sum(1 for p in places if p["distance"] <= max_dist)


# ─── 카테고리별 0.0~1.0 점수 계산 ──────────────────────────────────

def _score_transit(facilities: dict) -> float:
    """교통: 지하철 거리 + 버스 정류장 수 (버스는 bus.py / 공공데이터포털 TAGO)"""
    subway = facilities.get("subway", [])
    bus = facilities.get("bus", [])

    # 지하철 기본 점수
    d = _closest(subway)
    if d is None:
        subway_score = 0.0
    elif d <= 300:
        subway_score = 1.0
    elif d <= 500:
        subway_score = 0.90
    elif d <= 800:
        subway_score = 0.75
    elif d <= 1200:
        subway_score = 0.55
    elif d <= 1800:
        subway_score = 0.30
    else:
        subway_score = 0.10

    # 버스 보너스 (300m 이내 정류장 수)
    bus_count = _count_within(bus, 300)
    bus_bonus = min(bus_count * 0.06, 0.20)

    return min(subway_score + bus_bonus, 1.0)


def _score_convenience(facilities: dict) -> float:
    """편의시설: 편의점 + 마트"""
    conv = facilities.get("convenience", [])
    mart = facilities.get("mart", [])

    d_conv = _closest(conv)
    d_mart = _closest(mart)

    # 편의점 (0~0.7)
    if d_conv is None:
        cs = 0.0
    elif d_conv <= 150:
        cs = 0.70
    elif d_conv <= 300:
        cs = 0.60
    elif d_conv <= 600:
        cs = 0.45
    else:
        cs = 0.25

    # 근처 편의점 개수 보너스
    near = _count_within(conv, 500)
    cs += min((near - 1) * 0.05, 0.15)

    # 마트 보너스 (0~0.30)
    if d_mart is None:
        ms = 0.0
    elif d_mart <= 500:
        ms = 0.30
    elif d_mart <= 1000:
        ms = 0.20
    elif d_mart <= 2000:
        ms = 0.10
    else:
        ms = 0.0

    return min(cs + ms, 1.0)


def _score_food(facilities: dict) -> float:
    """식생활: 음식점 + 카페"""
    restaurants = facilities.get("restaurant", [])
    cafes = facilities.get("cafe", [])

    # 500m 이내 음식점 수
    r_count = _count_within(restaurants, 500)
    if r_count >= 15:
        rs = 0.90
    elif r_count >= 10:
        rs = 0.80
    elif r_count >= 5:
        rs = 0.65
    elif r_count >= 3:
        rs = 0.50
    elif r_count >= 1:
        rs = 0.35
    else:
        rs = 0.10

    # 카페 보너스
    c_count = _count_within(cafes, 500)
    cb = min(c_count * 0.04, 0.15)

    return min(rs + cb, 1.0)


def _score_medical(facilities: dict) -> float:
    """의료: 병원 + 약국"""
    hospitals = facilities.get("hospital", [])
    pharmacies = facilities.get("pharmacy", [])

    d_h = _closest(hospitals)
    d_p = _closest(pharmacies)

    # 병원 (0~0.65)
    if d_h is None:
        hs = 0.0
    elif d_h <= 300:
        hs = 0.65
    elif d_h <= 600:
        hs = 0.55
    elif d_h <= 1000:
        hs = 0.40
    elif d_h <= 1500:
        hs = 0.25
    else:
        hs = 0.10

    # 약국 (0~0.35)
    if d_p is None:
        ps = 0.0
    elif d_p <= 200:
        ps = 0.35
    elif d_p <= 500:
        ps = 0.25
    elif d_p <= 1000:
        ps = 0.15
    else:
        ps = 0.05

    return min(hs + ps, 1.0)


def _score_leisure(facilities: dict) -> float:
    """여가·운동: 헬스장"""
    gyms = facilities.get("gym", [])

    d_g = _closest(gyms)

    if d_g is None:
        gs = 0.30  # 없어도 기본점수
    elif d_g <= 300:
        gs = 1.00
    elif d_g <= 600:
        gs = 0.85
    elif d_g <= 1000:
        gs = 0.70
    elif d_g <= 1500:
        gs = 0.50
    else:
        gs = 0.35

    return gs


def _score_safety(facilities: dict) -> float:
    """
    야간 안전: 편의점 밀도(불 켜진 가게)를 야간 안전 대리 지표로 사용.
    편의점은 24h 영업 + 밝은 조명 → 야간 안전도와 상관관계
    """
    conv = facilities.get("convenience", [])
    near = _count_within(conv, 500)

    if near >= 5:
        return 1.00
    elif near >= 4:
        return 0.88
    elif near >= 3:
        return 0.75
    elif near >= 2:
        return 0.60
    elif near >= 1:
        return 0.45
    else:
        return 0.20


# ─── 종합 점수 계산 ─────────────────────────────────────────────────

_SCORE_FUNCS = {
    "transit":     _score_transit,
    "convenience": _score_convenience,
    "food":        _score_food,
    "medical":     _score_medical,
    "leisure":     _score_leisure,
    "safety":      _score_safety,
}


def calculate(facilities: dict, weights: dict | None = None) -> dict:
    """
    Returns:
    {
        "total": 82,                       # 0~100 정수
        "categories": {
            "transit":     {"score": 18, "max": 20, "pct": 90, "label": "교통"},
            ...
        },
        "weights": { ... },
        "raw": { "transit": 0.9, ... }     # 0.0~1.0 카테고리 원점수
    }
    """
    w = _normalize_weights(weights or DEFAULT_WEIGHTS)

    raw = {cat: fn(facilities) for cat, fn in _SCORE_FUNCS.items()}

    categories = {}
    total = 0.0
    for cat, pct in raw.items():
        max_pts = w[cat]
        pts = pct * max_pts
        total += pts
        categories[cat] = {
            "score": round(pts, 1),
            "max":   round(max_pts, 1),
            "pct":   round(pct * 100),
            "label": CATEGORY_LABELS[cat],
        }

    return {
        "total":      round(total),
        "categories": categories,
        "weights":    w,
        "raw":        raw,
    }


def _normalize_weights(weights: dict) -> dict:
    """가중치 합이 100이 되도록 정규화"""
    total = sum(weights.get(k, 0) for k in DEFAULT_WEIGHTS)
    if total == 0:
        return DEFAULT_WEIGHTS.copy()
    return {k: weights.get(k, DEFAULT_WEIGHTS[k]) / total * 100 for k in DEFAULT_WEIGHTS}


def grade(total: int) -> dict:
    """점수 → 등급 + 한마디"""
    if total >= 90:
        return {"grade": "S", "emoji": "🏆", "text": "최상급 입지입니다!"}
    elif total >= 80:
        return {"grade": "A", "emoji": "😊", "text": "생활하기 매우 좋은 곳이에요."}
    elif total >= 70:
        return {"grade": "B", "emoji": "🙂", "text": "전반적으로 살기 괜찮은 곳이에요."}
    elif total >= 60:
        return {"grade": "C", "emoji": "😐", "text": "몇 가지 불편함이 있을 수 있어요."}
    elif total >= 50:
        return {"grade": "D", "emoji": "😕", "text": "생활 인프라가 다소 부족해요."}
    else:
        return {"grade": "F", "emoji": "😞", "text": "인프라가 많이 부족한 위치예요."}
