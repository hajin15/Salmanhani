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

from flask import Flask, request, jsonify
from dotenv import load_dotenv

# kakao/scoring보다 먼저 호출해야 한다.
# kakao.py는 import 시점에 os.getenv("KAKAO_API_KEY")를 읽으므로,
# 이 줄이 아래로 내려가면 .env에 키를 넣어도 kakao.py는 빈 키를 들고 데모 데이터를 반환한다.
load_dotenv()

import re
import secrets

from flask import session
from werkzeug.security import check_password_hash, generate_password_hash

import kakao
import bus
import scoring
import db

# 화면은 React(frontend/)로 만들고 `npm run build` 결과(frontend/dist)를 그대로 서빙한다
app = Flask(__name__, static_folder="frontend/dist", static_url_path="")
# 로그인 쿠키 서명 키. 코드에 박힌 기본값을 쓰면 누구나 남의 쿠키를 만들 수 있으므로,
# 없으면 실행할 때마다 무작위 키를 만든다 (대신 서버를 다시 켜면 모두 로그아웃된다).
app.secret_key = os.getenv("SECRET_KEY") or secrets.token_hex(32)
if not os.getenv("SECRET_KEY"):
    print("⚠️  SECRET_KEY가 없어 임시 키를 씁니다. 배포할 땐 .env에 SECRET_KEY를 꼭 넣으세요.")
# 다른 사이트에서 보낸 요청에는 로그인 쿠키를 싣지 않는다 (CSRF 완화)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
db.init()

KAKAO_API_KEY = os.getenv("KAKAO_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

FETCH_FAIL_MSG = "주변 시설 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요."


@app.route("/")
def index():
    if not os.path.exists(os.path.join(app.static_folder, "index.html")):
        return "화면이 아직 빌드되지 않았어요. frontend 폴더에서 npm run build를 실행하세요.", 503
    return app.send_static_file("index.html")


@app.route("/api/config")
def config():
    """화면이 켜질 때 읽는 설정 (카카오맵 JS 키는 원래 브라우저에 공개되는 키다)"""
    return jsonify({
        "demo_mode": not bool(KAKAO_API_KEY),
        "kakao_js_key": os.getenv("KAKAO_JS_KEY", ""),
    })


# ─── 회원 ───────────────────────────────────────────────────────────

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PW_MIN = 8
LOGIN_FAIL_MSG = "이메일 또는 비밀번호가 맞지 않아요."


def current_user_id() -> int | None:
    """세션의 user_id. 탈퇴 등으로 없어진 계정이면 None"""
    uid = session.get("user_id")
    if uid is None or db.get_user(uid) is None:
        return None
    return uid


def _body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _str(data: dict, key: str) -> str:
    """문자열이 아닌 값(숫자·null·목록)은 빈 문자열로 → 500 대신 형식 오류로 처리된다"""
    v = data.get(key)
    return v if isinstance(v, str) else ""


def _email(data: dict) -> str:
    return _str(data, "email").strip().lower()


@app.route("/api/signup", methods=["POST"])
def signup():
    data = _body()
    email, pw = _email(data), _str(data, "password")
    if not EMAIL_RE.match(email):
        return jsonify({"error": "이메일 형식이 올바르지 않아요."}), 400
    if len(pw) < PW_MIN:
        return jsonify({"error": f"비밀번호는 {PW_MIN}자 이상이어야 해요."}), 400
    uid = db.create_user(email, generate_password_hash(pw))
    if uid is None:
        return jsonify({"error": "이미 가입된 이메일이에요."}), 409
    session.clear()
    session["user_id"] = uid
    return jsonify({"email": email}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = _body()
    email = _email(data)
    user = db.get_user_by_email(email)
    if not user or not check_password_hash(user["password_hash"], _str(data, "password")):
        return jsonify({"error": LOGIN_FAIL_MSG}), 401
    session.clear()
    session["user_id"] = user["id"]
    return jsonify({"email": email})


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me", methods=["GET"])
def me():
    uid = current_user_id()
    return jsonify({"email": db.get_user(uid)["email"] if uid else None})


def _check_password(uid: int, pw: str) -> bool:
    return check_password_hash(db.get_user(uid)["password_hash"], pw or "")


@app.route("/api/password", methods=["POST"])
def change_password():
    uid = current_user_id()
    if not uid:
        return jsonify({"error": "로그인이 필요해요."}), 401
    data = _body()
    if not _check_password(uid, _str(data, "current")):
        return jsonify({"error": "현재 비밀번호가 맞지 않아요."}), 401
    new = _str(data, "new")
    if len(new) < PW_MIN:
        return jsonify({"error": f"비밀번호는 {PW_MIN}자 이상이어야 해요."}), 400
    db.set_password(uid, generate_password_hash(new))
    return jsonify({"ok": True})


@app.route("/api/me", methods=["DELETE"])
def delete_account():
    uid = current_user_id()
    if not uid:
        return jsonify({"error": "로그인이 필요해요."}), 401
    if not _check_password(uid, _str(_body(), "password")):
        return jsonify({"error": "비밀번호가 맞지 않아요."}), 401
    db.delete_user(uid)  # 기록·즐겨찾기는 ON DELETE CASCADE로 같이 지워진다
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/history")
def list_history():
    uid = current_user_id()
    if not uid:
        return jsonify({"error": "로그인이 필요해요."}), 401
    return jsonify({"items": db.list_history(uid, request.args.get("favorite") == "1")})


@app.route("/api/history/<int:hid>/favorite", methods=["POST"])
def favorite_history(hid):
    uid = current_user_id()
    if not uid:
        return jsonify({"error": "로그인이 필요해요."}), 401
    if not db.set_favorite(uid, hid, bool(_body().get("on"))):
        return jsonify({"error": "기록을 찾을 수 없어요."}), 404
    return jsonify({"ok": True})


@app.route("/api/history/<int:hid>", methods=["DELETE"])
def delete_history(hid):
    uid = current_user_id()
    if not uid:
        return jsonify({"error": "로그인이 필요해요."}), 401
    if not db.delete_history(uid, hid):
        return jsonify({"error": "기록을 찾을 수 없어요."}), 404
    return jsonify({"ok": True})


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

    # 2. 주변 시설 조회 — 실패를 '0곳'으로 치면 틀린 점수가 나가므로 차라리 다시 시도하게 한다
    try:
        facilities = _get_facilities(lat, lng)
    except kakao.FetchError:
        return jsonify({"error": FETCH_FAIL_MSG}), 503

    # 3. 점수 계산
    result = scoring.calculate(facilities, weights)
    g = scoring.grade(result["total"])

    # 4. AI 한줄평 (OpenAI 키 있을 때만)
    ai_comment = _ai_comment(result) if OPENAI_API_KEY else _rule_comment(result)

    # 5. 로그인 상태면 기록에 남긴다 (화면에 보이는 주소 그대로 → 같은 곳을 다르게 써도 한 줄)
    shown_address = coords.get("road_address") or address  # 빈 문자열이면 입력값
    uid = current_user_id()
    history_id, favorite = db.save_history(uid, shown_address, result["total"], g["grade"]) if uid else (None, False)

    return jsonify({
        "address": shown_address,
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
        "history_id": history_id,  # 비로그인이면 None → 화면에 ☆ 버튼 없음
        "favorite": favorite,
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

        try:
            facilities = _get_facilities(coords["lat"], coords["lng"])
        except kakao.FetchError:
            results.append({"address": addr, "error": FETCH_FAIL_MSG})
            continue
        res =scoring.calculate(facilities, weights)
        g = scoring.grade(res["total"])

        results.append({
            "address": coords.get("road_address") or addr,
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
