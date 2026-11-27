"""
CCTV 밀도 — 공공데이터포털 '전국CCTV표준데이터' CSV(파일데이터)를 메모리에 올려 반경 검색.
OpenAPI는 좌표·반경 검색이 안 돼서 파일을 받아 쓴다. 파일이 없으면 None → 점수는 편의점·지구대만으로.
"""

import csv
import os
from functools import lru_cache

from bus import _haversine

CSV_PATH = os.getenv("CCTV_CSV", os.path.join(os.path.dirname(__file__), "data", "cctv.csv"))

# 표준데이터 열 위치: 6=카메라대수, 12=WGS84위도, 13=WGS84경도
_COUNT, _LAT, _LNG = 6, 12, 13
_CELL = 100  # 격자 한 칸 = 0.01도(위도 약 1.1km) → 반경 300m는 주변 3×3칸이면 충분


def _cell(lat: float, lng: float) -> tuple:
    return int(lat * _CELL), int(lng * _CELL)


@lru_cache(maxsize=1)
def _grid() -> dict | None:
    """첫 호출 때 한 번만 읽는다 (약 38만 행, 몇 초)."""
    if not os.path.isfile(CSV_PATH):  # Docker는 없는 파일을 연결하면 빈 폴더를 만든다
        return None
    grid = {}
    with open(CSV_PATH, encoding="cp949", errors="replace", newline="") as f:
        rows = csv.reader(f)
        next(rows)  # 헤더
        for r in rows:
            try:
                lat, lng = float(r[_LAT]), float(r[_LNG])
                n = int(r[_COUNT] or 1)
            except (ValueError, IndexError):
                continue  # 좌표 빠진 행
            grid.setdefault(_cell(lat, lng), []).append((lat, lng, n))
    return grid


def count_nearby(lat: float, lng: float, radius: int = 300) -> int | None:
    """반경 안 CCTV 카메라 대수. 데이터 파일이 없으면 None."""
    grid = _grid()
    if grid is None:
        return None
    ci, cj = _cell(lat, lng)
    total = 0
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            for plat, plng, n in grid.get((ci + di, cj + dj), ()):
                if _haversine(lat, lng, plat, plng) <= radius:
                    total += n
    return total


if __name__ == "__main__":
    # 신촌역 근처: 서울 도심이면 수십 대는 나와야 한다
    n = count_nearby(37.5552, 126.9368)
    assert n is None or n > 0, n
    assert count_nearby(0.0, 0.0) in (None, 0)  # 바다 한가운데
    print("ok", n)
