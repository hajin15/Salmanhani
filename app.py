"""
살만하니 - 자취방 생활 인프라 점수 앱
Flask 백엔드
"""

import os
import sys

# Windows 콘솔 기본 인코딩(cp949)에서 이모지·한글 출력이 깨지지 않도록
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

# kakao/scoring보다 먼저 호출해야 한다.
# kakao.py는 import 시점에 os.getenv("KAKAO_API_KEY")를 읽으므로,
# 이 줄이 아래로 내려가면 .env에 키를 넣어도 kakao.py는 빈 키를 들고 데모 데이터를 반환한다.
load_dotenv()

import kakao
import bus
import scoring

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "salmanhi_dev_key")

KAKAO_API_KEY = os.getenv("KAKAO_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


@app.route("/")
def index():
    return render_template("index.html",
                           demo_mode=not bool(KAKAO_API_KEY),
                           kakao_js_key=os.getenv("KAKAO_JS_KEY", ""))


@app.route("/api/analyze", methods=["POST"])
def analyze():
    """
    주소 분석 → 점수 반환
    Body: { address, weights: {transit, convenience, food, medical, leisure, safety} }
    """
    data = request.get_json(force=True)
    address = (data.get("address") or "").strip()
    if not address:
        return jsonify({"error": "주소를 입력해주세요."}), 400

    weights = data.get("weights") or None

    # 1. 주소 → 좌표
    coords = kakao.get_coords(address)
    if not coords:
        return jsonify({"error": "주소를 찾을 수 없어요. 더 구체적으로 입력해주세요."}), 404

    lat, lng = coords["lat"], coords["lng"]
    is_demo = coords.get("is_demo", not bool(KAKAO_API_KEY))

    # 2. 주변 시설 조회
    facilities = _get_facilities(lat, lng)

    # 3. 점수 계산
    result = scoring.calculate(facilities, weights)
    g = scoring.grade(result["total"])

    # 4. AI 한줄평 (OpenAI 키 있을 때만)
    ai_comment = _ai_comment(result) if OPENAI_API_KEY else _rule_comment(result)

    return jsonify({
        "address": coords.get("road_address", address),
        "lat": lat,
        "lng": lng,
        "is_demo": is_demo,
        "total": result["total"],
        "grade": g,
        "categories": result["categories"],
        "weights": result["weights"],
        "ai_comment": ai_comment,
        "facilities_summary": _facilities_summary(facilities),
        "pins": _map_pins(facilities),
    })


@app.route("/api/compare", methods=["POST"])
def compare():
    """
    여러 주소 비교
    Body: { addresses: ["...", "..."], weights: {...} }
    """
    data = request.get_json(force=True)
    addresses = data.get("addresses", [])[:3]  # 최대 3개
    weights = data.get("weights") or None

    if not addresses:
        return jsonify({"error": "주소를 입력해주세요."}), 400

    results = []
    for addr in addresses:
        addr = addr.strip()
        if not addr:
            continue
        coords = kakao.get_coords(addr)
        if not coords:
            results.append({"address": addr, "error": "주소를 찾을 수 없어요."})
            continue

        facilities = _get_facilities(coords["lat"], coords["lng"])
        res = scoring.calculate(facilities, weights)
        g = scoring.grade(res["total"])

        results.append({
            "address": coords.get("road_address", addr),
            "total": res["total"],
            "grade": g,
            "categories": res["categories"],
        })

    return jsonify({"results": results})


# ─── 내부 헬퍼 ──────────────────────────────────────────────────────

def _get_facilities(lat: float, lng: float) -> dict:
    """분석·비교가 같은 시설 목록으로 점수를 내도록 한 곳에서 모은다.
    (예전엔 비교 쪽만 버스를 빠뜨려서 같은 주소인데 점수가 달랐다.)
    버스정류장만 제공자가 다르다 — kakao.py 상단 주석 참고."""
    facilities = kakao.get_all_facilities(lat, lng)
    facilities["bus"] = bus.search_bus_stops(lat, lng)
    return facilities


def _facilities_summary(facilities: dict) -> dict:
    """각 카테고리별 대표 정보 요약"""
    def closest_name(places):
        if not places:
            return None
        p = min(places, key=lambda x: x["distance"])
        return {"name": p["name"], "distance": p["distance"]}

    return {
        "subway":      closest_name(facilities.get("subway", [])),
        "bus":         len(facilities.get("bus", [])),
        "convenience": closest_name(facilities.get("convenience", [])),
        "restaurant":  len([r for r in facilities.get("restaurant", []) if r["distance"] <= 500]),
        "hospital":    closest_name(facilities.get("hospital", [])),
        "gym":         closest_name(facilities.get("gym", [])),
    }


def _map_pins(facilities: dict) -> list:
    """지도 핀: 카테고리마다 가장 가까운 1곳 (점수도 최근접 거리 기준이라 화면과 맞는다)"""
    pins = []
    for key, places in facilities.items():
        places = [p for p in places if "lat" in p]
        if places:
            p = min(places, key=lambda x: x["distance"])
            pins.append({"category": key, "name": p["name"], "distance": p["distance"],
                         "lat": p["lat"], "lng": p["lng"]})
    return pins


def _rule_comment(result: dict) -> str:
    """규칙 기반 한줄 코멘트 (OpenAI 없을 때)"""
    cats = result["categories"]
    total = result["total"]

    # 가장 높은/낮은 항목 찾기
    best = max(cats, key=lambda k: cats[k]["pct"])
    worst = min(cats, key=lambda k: cats[k]["pct"])

    best_label = cats[best]["label"]
    worst_label = cats[worst]["label"]

    if total >= 80:
        return f"{best_label} 접근성이 뛰어나고 전반적으로 살기 좋은 입지입니다."
    elif total >= 65:
        return f"{best_label}은 좋지만, {worst_label} 부분에서 약간 불편함이 있을 수 있어요."
    elif total >= 50:
        return f"{worst_label} 인프라가 부족해요. 자가용이 있다면 극복할 수 있습니다."
    else:
        return f"전반적으로 생활 인프라가 부족한 지역이에요. {worst_label}이 가장 아쉬운 부분입니다."


def _ai_comment(result: dict) -> str:
    """OpenAI GPT 한줄평 생성"""
    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)

        cats_text = ", ".join(
            f"{v['label']} {v['pct']}점"
            for v in result["categories"].values()
        )
        prompt = (
            f"자취방 생활 인프라 분석 결과: 종합 {result['total']}점. "
            f"카테고리별: {cats_text}. "
            f"이 결과에 대한 한국어 한줄 코멘트를 50자 이내로 작성해줘. "
            f"친근하고 실용적인 톤으로."
        )

        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return _rule_comment(result)


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"\n🏠 살만하니 서버 시작 → http://localhost:{port}")
    if not KAKAO_API_KEY:
        print("⚠️  카카오 API 키 없음 → 데모 모드로 실행됩니다.")
    app.run(debug=True, host="0.0.0.0", port=port)
