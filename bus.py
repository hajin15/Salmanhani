"""
버스정류장 조회 모듈 (공공데이터포털 TAGO)

카카오 장소 DB에는 버스정류장이 없어서 별도 제공자를 쓴다.
DATA_GO_KR_API_KEY가 없으면 데모(Mock) 데이터를 반환한다.

주의: TAGO 좌표기반 조회는 반경 파라미터가 없다. 기준 좌표에서
약 500m 안의 정류소만 돌려주므로, 그보다 좁히려면 받은 뒤 걸러야 한다.
"""

import os
import math
import requests

API_KEY = os.getenv("DATA_GO_KR_API_KEY", "")

ENDPOINT = "http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList"

# TAGO가 좌표 기준으로 훑어주는 대략적인 범위(m). API가 반경을 안 받아서 고정값이다.
TAGO_FIXED_RADIUS = 500


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    """두 좌표 사이 거리(m). TAGO 응답에 거리가 없어서 직접 계산한다."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return int(round(2 * r * math.asin(math.sqrt(a))))


def search_bus_stops(lat: float, lng: float, radius: int = TAGO_FIXED_RADIUS) -> list:
    """주변 버스정류장 → [{'name':..., 'distance':..., 'address':...}] (kakao.py와 같은 형태)"""
    if not API_KEY:
        from kakao import _mock_facilities  # 데모 모드에서만 필요 (순환 import 방지)
        return _mock_facilities(lat, lng, "bus", radius)

    try:
        res = requests.get(ENDPOINT, params={
            "serviceKey": API_KEY,
            "gpsLati": lat,
            "gpsLong": lng,
            "numOfRows": 50,
            "pageNo": 1,
            "_type": "json",
        }, timeout=5)
        body = res.json().get("response", {}).get("body", {})
    except Exception:
        return []

    # totalCount가 0이면 items가 빈 문자열로 온다. 1건이면 dict, 여러 건이면 list.
    items = body.get("items") or {}
    if not isinstance(items, dict):
        return []
    item = items.get("item") or []
    if isinstance(item, dict):
        item = [item]

    stops = []
    for s in item:
        try:
            s_lat, s_lng = float(s["gpslati"]), float(s["gpslong"])
        except (KeyError, TypeError, ValueError):
            continue  # 좌표 없는 정류소는 거리 계산이 안 되므로 버린다
        d = _haversine(lat, lng, s_lat, s_lng)
        if d > radius:
            continue
        stops.append({"name": s.get("nodenm", "정류장"), "distance": d, "address": "",
                      "lat": s_lat, "lng": s_lng})

    stops.sort(key=lambda x: x["distance"])
    return stops


if __name__ == "__main__":
    # 자체 점검 --------------------------------------------------------
    # 1) 위도 1도 = 약 111.2km (경도와 무관한 고정값) — 공식이 맞는지 보는 기준
    assert 110_900 <= _haversine(37.0, 127.0, 38.0, 127.0) <= 111_400

    # 2) 같은 지점은 0m
    assert _haversine(37.5, 127.0, 37.5, 127.0) == 0

    # 3) 강남역 ↔ 역삼역: Δ위도 311m, Δ경도 812m → √(311²+812²) ≈ 869m
    d = _haversine(37.4979, 127.0276, 37.5007, 127.0368)
    assert 850 <= d <= 890, f"거리 계산 이상: {d}m"

    # 4) 반경 밖 정류소는 걸러지는지 (좌표만 있고 거리 필드는 없는 응답 형태)
    assert _haversine(37.4979, 127.0276, 37.5100, 127.0276) > TAGO_FIXED_RADIUS

    print(f"OK - 위도1도 {_haversine(37.0,127.0,38.0,127.0)}m / 강남역~역삼역 {d}m")

    if API_KEY:
        got = search_bus_stops(37.4979, 127.0276)
        print(f"실제 조회: {len(got)}건")
        for s in got[:5]:
            print(f"  {s['name']} {s['distance']}m")
    else:
        print("DATA_GO_KR_API_KEY 없음 → 데모 데이터로 동작 중")
