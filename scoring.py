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
    elif d <= 250:
        subway_score = 1.0
    elif d <= 400:
        subway_score = 0.85
    elif d <= 600:
        subway_score = 0.65
    elif d <= 900:
        subway_score = 0.45
    elif d <= 1300:
        subway_score = 0.25
    else:
        subway_score = 0.05

    # 버스 보너스 (300m 이내 정류장 수)
    bus_count = _count_within(bus, 300)
    bus_bonus = min(bus_count * 0.04, 0.15)

    return min(subway_score + bus_bonus, 1.0)


def _score_convenience(facilities: dict) -> float:
    """편의시설: 편의점 + 마트"""
    conv = facilities.get("convenience", [])
    mart = facilities.get("mart", [])

    d_conv = _closest(conv)
    d_mart = _closest(mart)

    # 편의점 (0~0.6)
    if d_conv is None:
        cs = 0.0
    elif d_conv <= 100:
        cs = 0.60
    elif d_conv <= 200:
        cs = 0.50
    elif d_conv <= 400:
        cs = 0.35
    else:
        cs = 0.15

    # 근처 편의점 개수 보너스 (편의점이 없으면 음수가 되지 않게 max)
    near = _count_within(conv, 300)
    cs += min(max(near - 1, 0) * 0.03, 0.10)

    # 마트 보너스 (0~0.30)
    if d_mart is None:
        ms = 0.0
    elif d_mart <= 400:
        ms = 0.30
    elif d_mart <= 800:
        ms = 0.18
    elif d_mart <= 1500:
        ms = 0.08
    else:
        ms = 0.0

    return min(cs + ms, 1.0)


def _score_food(facilities: dict) -> float:
    """식생활: 음식점 + 카페"""
    restaurants = facilities.get("restaurant", [])
    cafes = facilities.get("cafe", [])

    # 500m 이내 음식점 수 (카카오 검색은 최대 45건까지만 받는다)
    r_count = _count_within(restaurants, 500)
    if r_count >= 40:
        rs = 0.85
    elif r_count >= 25:
        rs = 0.70
    elif r_count >= 15:
        rs = 0.55
    elif r_count >= 8:
        rs = 0.40
    elif r_count >= 3:
        rs = 0.25
    elif r_count >= 1:
        rs = 0.15
    else:
        rs = 0.0

    # 카페 보너스
    c_count = _count_within(cafes, 500)
    cb = min(c_count * 0.02, 0.15)

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
    elif d_h <= 200:
        hs = 0.65
    elif d_h <= 400:
        hs = 0.50
    elif d_h <= 700:
        hs = 0.35
    elif d_h <= 1000:
        hs = 0.20
    else:
        hs = 0.05

    # 약국 (0~0.35)
    if d_p is None:
        ps = 0.0
    elif d_p <= 150:
        ps = 0.35
    elif d_p <= 300:
        ps = 0.25
    elif d_p <= 600:
        ps = 0.12
    else:
        ps = 0.03

    return min(hs + ps, 1.0)


def _score_leisure(facilities: dict) -> float:
    """여가·운동: 헬스장"""
    gyms = facilities.get("gym", [])

    d_g = _closest(gyms)

    if d_g is None:
        gs = 0.0
    elif d_g <= 200:
        gs = 1.00
    elif d_g <= 400:
        gs = 0.80
    elif d_g <= 700:
        gs = 0.55
    elif d_g <= 1000:
        gs = 0.35
    else:
        gs = 0.15

    return gs


def _step(value: float, table: list) -> float:
    """(기준, 점수) 표를 위에서부터 보고 처음 넘는 기준의 점수. 못 넘으면 마지막 점수."""
    for cut, score in table:
        if value >= cut:
            return score
    return table[-1][1]


def _score_safety(facilities: dict) -> float:
    """
    야간 안전 = CCTV 40% + 지구대·파출소 30% + 편의점 밀도 30%.
    편의점은 24h 영업 + 밝은 조명이라 불 켜진 거리의 대리 지표.
    CCTV 파일이 없으면(cctv=None) 지구대 50% + 편의점 50%.
    """
    conv = _step(_count_within(facilities.get("convenience", []), 500),
                 [(10, 1.0), (7, 0.85), (5, 0.7), (3, 0.5), (1, 0.3), (0, 0.05)])

    # 가까울수록 좋으니 거리에 -를 붙여 같은 표 함수를 쓴다. 1.5km 안에 없으면 0.1
    d = _closest(facilities.get("police", []))
    police = 0.1 if d is None else _step(-d, [(-300, 1.0), (-600, 0.8), (-1000, 0.6), (-1500, 0.4), (float("-inf"), 0.2)])

    cams = facilities.get("cctv")
    if cams is None:
        return round(0.5 * police + 0.5 * conv, 3)
    # 반경 300m 카메라 대수. 표본: 노원 19, 건대 33, 강남역 84, 신촌 127
    # ponytail: 지자체마다 등록 범위가 달라 지방은 낮게 나온다 (대전 시내 5). 지역별 보정은 불만 나오면.
    cctv = _step(cams, [(80, 1.0), (50, 0.85), (30, 0.7), (15, 0.5), (5, 0.3), (0, 0.1)])
    return round(0.4 * cctv + 0.3 * police + 0.3 * conv, 3)


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
