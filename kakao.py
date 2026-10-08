"""
카카오 로컬 API 연동 모듈
API 키가 없으면 자동으로 데모(Mock) 데이터 반환
"""

import os
import math
import hashlib
import random
import requests

KAKAO_API_KEY = os.getenv("KAKAO_API_KEY", "")

HEADERS = {"Authorization": f"KakaoAK {KAKAO_API_KEY}"}

# 카카오 카테고리 대분류 코드 (공식 목록에 있는 것만)
CATEGORY = {
    "subway":      "SW8",   # 지하철역
    "convenience": "CS2",   # 편의점
    "mart":        "MT1",   # 대형마트
    "restaurant":  "FD6",   # 음식점
    "cafe":        "CE7",   # 카페
    "hospital":    "HP8",   # 병원
    "pharmacy":    "PM9",   # 약국
}

# 대분류 코드가 없는 시설은 키워드로 찾는다.
# (헬스장은 예전에 PT8로 부르고 있었는데, 그런 코드는 없어서 400 ValidationError였다.)
KEYWORD = {
    "gym": "헬스장",
}

# 버스정류장은 여기에 없다 — 카카오 장소 DB가 정류장을 담고 있지 않다.
# "버스정류장"/"정류장" 키워드 모두 0건이고 "버스"는 상호만 걸린다.
# ponytail: 버스를 점수에 넣으려면 공공데이터포털 버스정류장 API를 별도로 붙여야 한다.


def get_coords(address: str) -> dict | None:
    """주소 → 위경도 변환"""
    if not KAKAO_API_KEY:
        return _mock_coords(address)

    url = "https://dapi.kakao.com/v2/local/search/address.json"
    try:
        res = requests.get(url, headers=HEADERS, params={"query": address}, timeout=5)
        data = res.json()
        docs = data.get("documents", [])
        if not docs:
            # 주소 검색 실패 시 키워드 검색으로 재시도
            return _keyword_search_coords(address)
        d = docs[0]
        # road_address/address는 키가 있어도 값이 null로 온다(동 단위 주소 등).
        # .get(k, {}) 는 키가 없을 때만 {}를 주므로 null이면 터진다 → (x or {}) 로 받는다.
        road = d.get("road_address") or {}
        jibun = d.get("address") or {}
        return {
            "lat": float(d["y"]),
            "lng": float(d["x"]),
            "road_address": road.get("address_name", address),
            "jibun_address": jibun.get("address_name", address),
        }
    except Exception:
        return None


def _keyword_search_coords(address: str) -> dict | None:
    url = "https://dapi.kakao.com/v2/local/search/keyword.json"
    try:
        res = requests.get(url, headers=HEADERS, params={"query": address}, timeout=5)
        docs = res.json().get("documents", [])
        if not docs:
            return None
        d = docs[0]
        return {
            "lat": float(d["y"]),
            "lng": float(d["x"]),
            "road_address": d.get("road_address_name", address),
            "jibun_address": d.get("address_name", address),
        }
    except Exception:
        return None


def _paged_search(url: str, params: dict) -> list:
    """카테고리·키워드 검색 공통 페이징 (최대 3페이지 = 45건)"""
    results = []
    page = 1
    while True:
        try:
            res = requests.get(url, headers=HEADERS,
                               params={**params, "size": 15, "page": page}, timeout=5)
            data = res.json()
            for d in data.get("documents", []):
                dist = d.get("distance")
                if dist in (None, ""):
                    continue  # 거리 없는 결과는 점수 계산에 못 쓴다 (0으로 넣으면 바로 앞인 척함)
                results.append({
                    "name": d["place_name"],
                    "distance": int(dist),
                    "address": d.get("road_address_name", ""),
                    "lat": float(d["y"]),
                    "lng": float(d["x"]),
                })
            if data.get("meta", {}).get("is_end") or page >= 3:
                break
            page += 1
        except Exception:
            break

    return results


def search_nearby(lat: float, lng: float, category_key: str, radius: int = 1500) -> list:
    """대분류 코드로 주변 시설 검색 → [{'name':..., 'distance':..., 'address':...}]"""
    if not KAKAO_API_KEY:
        return _mock_facilities(lat, lng, category_key, radius)

    cat_code = CATEGORY.get(category_key)
    if not cat_code:
        return []

    return _paged_search("https://dapi.kakao.com/v2/local/search/category.json", {
        "category_group_code": cat_code,
        "x": lng, "y": lat, "radius": radius, "sort": "distance",
    })


def search_nearby_keyword(lat: float, lng: float, category_key: str, radius: int = 1500) -> list:
    """대분류 코드가 없는 시설(헬스장 등)을 키워드로 검색"""
    if not KAKAO_API_KEY:
        return _mock_facilities(lat, lng, category_key, radius)

    query = KEYWORD.get(category_key)
    if not query:
        return []

    return _paged_search("https://dapi.kakao.com/v2/local/search/keyword.json", {
        "query": query,
        "x": lng, "y": lat, "radius": radius, "sort": "distance",
    })


def get_all_facilities(lat: float, lng: float) -> dict:
    """6개 카테고리 전체 시설 조회"""
    return {
        "subway":      search_nearby(lat, lng, "subway", 2000),
        "convenience": search_nearby(lat, lng, "convenience", 1000),
        "mart":        search_nearby(lat, lng, "mart", 2000),
        "restaurant":  search_nearby(lat, lng, "restaurant", 1000),
        "cafe":        search_nearby(lat, lng, "cafe", 1000),
        "hospital":    search_nearby(lat, lng, "hospital", 1500),
        "pharmacy":    search_nearby(lat, lng, "pharmacy", 1000),
        "gym":         search_nearby_keyword(lat, lng, "gym", 1500),
    }


# ─── Mock 데이터 (API 키 없을 때) ───────────────────────────────────

_PRESET_ADDRESSES = {
    "강남": (37.4979, 127.0276),
    "역삼": (37.5007, 127.0368),
    "홍대": (37.5572, 126.9235),
    "신촌": (37.5552, 126.9368),
    "건대": (37.5403, 127.0705),
    "노원": (37.6542, 127.0568),
    "인천": (37.4563, 126.7052),
    "수원": (37.2636, 127.0286),
    "대전": (36.3504, 127.3845),
    "대구": (35.8714, 128.6014),
    "부산": (35.1796, 129.0756),
}


def _mock_coords(address: str) -> dict:
    """주소 해시 기반 일관된 가상 좌표 반환"""
    for key, coords in _PRESET_ADDRESSES.items():
        if key in address:
            return {
                "lat": coords[0] + _jitter(address, 0),
                "lng": coords[1] + _jitter(address, 1),
                "road_address": address,
                "jibun_address": address,
                "is_demo": True,
            }

    # 알 수 없는 주소 → 서울 기본값 + 해시 기반 위치
    base_lat, base_lng = 37.5665, 126.9780
    return {
        "lat": base_lat + _jitter(address, 0) * 0.5,
        "lng": base_lng + _jitter(address, 1) * 0.5,
        "road_address": address,
        "jibun_address": address,
        "is_demo": True,
    }


def _jitter(seed_str: str, idx: int) -> float:
    h = int(hashlib.md5((seed_str + str(idx)).encode()).hexdigest(), 16)
    return (h % 200 - 100) / 1000.0


def _mock_facilities(lat: float, lng: float, category_key: str, radius: int) -> list:
    """카테고리별 가상 시설 목록 (좌표 기반 시드로 일관성 유지)"""
    rng = random.Random(int((lat + lng) * 1000) + hash(category_key))

    configs = {
        "subway":      {"count_range": (0, 3),  "dist_range": (200, 1800), "names": ["○○역", "△△역", "□□역"]},
        "bus":         {"count_range": (2, 8),  "dist_range": (50, 400),   "names": ["버스정류장"]},
        "convenience": {"count_range": (1, 5),  "dist_range": (80, 600),   "names": ["GS25", "CU", "세븐일레븐", "이마트24", "미니스톱"]},
        "mart":        {"count_range": (0, 2),  "dist_range": (400, 2000), "names": ["이마트", "홈플러스", "롯데마트", "코스트코"]},
        "restaurant":  {"count_range": (5, 20), "dist_range": (100, 800),  "names": ["김치찌개", "삼겹살집", "중식당", "분식집", "한식집", "일식집"]},
        "cafe":        {"count_range": (2, 10), "dist_range": (100, 700),  "names": ["스타벅스", "이디야", "메가커피", "빽다방", "카페"]},
        "hospital":    {"count_range": (0, 4),  "dist_range": (200, 1500), "names": ["내과의원", "외과의원", "피부과", "정형외과", "이비인후과"]},
        "pharmacy":    {"count_range": (1, 4),  "dist_range": (100, 1000), "names": ["○○약국", "△△약국", "건강약국"]},
        "gym":         {"count_range": (0, 3),  "dist_range": (300, 1500), "names": ["헬스장", "피트니스센터", "스포츠센터"]},
    }

    cfg = configs.get(category_key, {"count_range": (0, 2), "dist_range": (200, 1500), "names": ["시설"]})
    count = rng.randint(*cfg["count_range"])
    result = []
    for i in range(count):
        name = rng.choice(cfg["names"])
        dist = rng.randint(*cfg["dist_range"])
        if dist <= radius:
            # 지도 핀용 가상 좌표: 기준점에서 dist(m)만큼 임의 방향으로 (위도 1도 ≈ 111km)
            ang = rng.uniform(0, 2 * math.pi)
            result.append({
                "name": f"{name} {i+1}호점" if count > 1 else name, "distance": dist, "address": "데모 주소",
                "lat": lat + dist * math.cos(ang) / 111_000,
                "lng": lng + dist * math.sin(ang) / (111_000 * math.cos(math.radians(lat))),
            })

    result.sort(key=lambda x: x["distance"])
    return result
