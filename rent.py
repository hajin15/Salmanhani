"""
전월세 실거래 조회 (국토부, 공공데이터포털)

버스와 같은 DATA_GO_KR_API_KEY를 쓴다. 키는 하나지만 서비스마다 활용신청을 따로 해야 하고,
신청 안 한 서비스는 403(SERVICE_KEY_IS_NOT_REGISTERED_ERROR)이 온다.
점수에 안 들어가는 참고 정보라, 실패하면 None → 화면에서 섹션을 숨긴다.

API는 '시군구 + 계약월' 단위로만 준다. 최근 12개월 × 건물 유형 3개를 받아서
법정동·지번이 같은 거래만 남긴다. 단독·다가구는 지번을 가려서 공개하므로 뺐다.
"""

import os
import datetime
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import requests

API_KEY = os.getenv("DATA_GO_KR_API_KEY", "")
BASE = "http://apis.data.go.kr/1613000/"
MONTHS = 12

# 유형: (서비스 경로, 건물명 필드)
SERVICES = {
    "아파트":     ("RTMSDataSvcAptRent/getRTMSDataSvcAptRent", "aptNm"),
    "오피스텔":   ("RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent", "offiNm"),
    "연립다세대": ("RTMSDataSvcRHRent/getRTMSDataSvcRHRent", "mhouseNm"),
}


# ponytail: 프로세스 메모리 캐시. 이번 달 거래는 계속 늘어나니 서버를 다시 켜야 갱신된다.
@lru_cache(maxsize=1024)
def _month(svc: str, lawd: str, ym: str) -> list:
    items, page = [], 1
    while True:
        r = requests.get(BASE + svc, timeout=10, params={
            "serviceKey": API_KEY, "LAWD_CD": lawd, "DEAL_YMD": ym,
            "numOfRows": 1000, "pageNo": page,
        })
        r.raise_for_status()
        items += parse(r.content)
        total = int(ET.fromstring(r.content).findtext(".//totalCount") or 0)
        if len(items) >= total or page >= 10:
            return items
        page += 1


def parse(xml: bytes) -> list:
    root = ET.fromstring(xml)
    code = root.findtext(".//resultCode")
    if code not in (None, "00", "000"):  # 트래픽 초과 등은 200 + 에러코드로 온다
        raise ValueError(f"resultCode={code}")
    return [{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")]


def _months(today: datetime.date) -> list:
    y, m = today.year, today.month
    out = []
    for _ in range(MONTHS):
        out.append(f"{y}{m:02d}")
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out


def _num(s: str) -> float:
    return float((s or "0").replace(",", "") or 0)


def lookup(coords: dict) -> dict | None:
    """kakao.get_coords 결과 → 이 건물의 최근 1년 전월세 요약 (모르면 None)"""
    b_code, dong, main = coords.get("b_code"), coords.get("dong"), coords.get("main_no")
    if not (API_KEY and b_code and dong and main):
        return None
    sub = coords.get("sub_no") or "0"
    jibun = main if sub == "0" else f"{main}-{sub}"

    jobs = [(kind, svc, name_key, ym) for kind, (svc, name_key) in SERVICES.items() for ym in _months(datetime.date.today())]
    try:
        with ThreadPoolExecutor(max_workers=12) as ex:
            pages = list(ex.map(lambda j: _month(j[1], b_code[:5], j[3]), jobs))
    except (requests.RequestException, ET.ParseError, ValueError):
        return None

    deals = []
    for (kind, _, name_key, _), items in zip(jobs, pages):
        for it in items:
            if it.get("umdNm") == dong and it.get("jibun") == jibun:
                deals.append({
                    "kind": kind,
                    "name": it.get(name_key, ""),
                    "date": f"{it.get('dealYear')}.{int(_num(it.get('dealMonth'))):02d}.{int(_num(it.get('dealDay'))):02d}",
                    "deposit": int(_num(it.get("deposit"))),      # 만원
                    "rent": int(_num(it.get("monthlyRent"))),     # 만원, 0이면 전세
                    "area": round(_num(it.get("excluUseAr")), 1), # ㎡
                    "floor": it.get("floor", ""),
                })
    return summarize(deals)


def summarize(deals: list) -> dict:
    deals = sorted(deals, key=lambda d: d["date"], reverse=True)
    monthly = [d for d in deals if d["rent"] > 0]
    jeonse = [d for d in deals if d["rent"] == 0]
    avg = lambda xs: round(sum(xs) / len(xs))
    return {
        "count": len(deals),
        "name": deals[0]["name"] if deals else None,
        "kind": "·".join(dict.fromkeys(d["kind"] for d in deals)) or None,  # 주상복합은 "아파트·오피스텔"
        "monthly": monthly and {
            "count": len(monthly),
            "deposit_avg": avg([d["deposit"] for d in monthly]),
            "rent_min": min(d["rent"] for d in monthly),
            "rent_max": max(d["rent"] for d in monthly),
        } or None,
        "jeonse": jeonse and {"count": len(jeonse), "deposit_avg": avg([d["deposit"] for d in jeonse])} or None,
        "recent": deals[:3],
    }


if __name__ == "__main__":
    sample = b"""<response><header><resultCode>000</resultCode></header><body><items>
    <item><offiNm>A</offiNm><umdNm>X</umdNm><jibun>1-2</jibun><deposit>1,000</deposit><monthlyRent>50</monthlyRent>
    <excluUseAr>23.5</excluUseAr><floor>3</floor><dealYear>2026</dealYear><dealMonth>9</dealMonth><dealDay>1</dealDay></item>
    </items><totalCount>1</totalCount></body></response>"""
    assert parse(sample)[0]["deposit"] == "1,000"
    s = summarize([
        {"kind": "오피스텔", "name": "A", "date": "2026.09.01", "deposit": 1000, "rent": 50, "area": 23.5, "floor": "3"},
        {"kind": "오피스텔", "name": "A", "date": "2026.10.01", "deposit": 1000, "rent": 60, "area": 23.5, "floor": "5"},
        {"kind": "오피스텔", "name": "A", "date": "2026.03.01", "deposit": 12000, "rent": 0, "area": 23.5, "floor": "2"},
    ])
    assert s["count"] == 3 and s["recent"][0]["date"] == "2026.10.01"
    assert s["monthly"] == {"count": 2, "deposit_avg": 1000, "rent_min": 50, "rent_max": 60}
    assert s["jeonse"] == {"count": 1, "deposit_avg": 12000}
    assert summarize([])["monthly"] is None
    assert _months(datetime.date(2026, 2, 5))[:3] == ["202602", "202601", "202512"]
    print("ok")
