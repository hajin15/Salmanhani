"""회원·기록 API 자체 점검: python test_auth.py → ok
임시 DB 파일과 데모 데이터(카카오 키 없음)로 돈다."""

import os
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["KAKAO_API_KEY"] = ""
os.environ["DATA_GO_KR_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""

import app as appmod  # noqa: E402

app = appmod.app
PW = "password1"


def client():
    return app.test_client()


def signup(c, email, pw=PW):
    return c.post("/api/signup", json={"email": email, "password": pw})


def test_account():
    c = client()
    r = signup(c, "user@test.com")
    assert r.status_code == 201, r.json
    assert c.get("/api/me").json["email"] == "user@test.com"

    assert signup(client(), "short@test.com", "1234567").status_code == 400
    assert signup(client(), "not-an-email", PW).status_code == 400
    r = signup(client(), "USER@test.com")
    assert r.status_code == 409 and r.json["error"] == "이미 가입된 이메일이에요."

    c.post("/api/logout")
    assert c.get("/api/me").json["email"] is None

    assert c.post("/api/login", json={"email": "user@test.com", "password": "wrongpass1"}).status_code == 401
    assert c.post("/api/login", json={"email": "User@Test.com", "password": PW}).status_code == 200

    assert c.post("/api/password", json={"current": "wrongpass1", "new": "newpass123"}).status_code == 401
    assert c.post("/api/password", json={"current": PW, "new": "newpass123"}).status_code == 200
    c.post("/api/logout")
    assert c.post("/api/login", json={"email": "user@test.com", "password": PW}).status_code == 401
    assert c.post("/api/login", json={"email": "user@test.com", "password": "newpass123"}).status_code == 200

    assert c.delete("/api/me", json={"password": "wrong"}).status_code == 401
    assert c.delete("/api/me", json={"password": "newpass123"}).status_code == 200
    assert c.get("/api/me").json["email"] is None
    assert c.post("/api/login", json={"email": "user@test.com", "password": "newpass123"}).status_code == 401


def analyze(c, address):
    r = c.post("/api/analyze", json={"address": address})
    assert r.status_code == 200, r.json
    return r.json


def history(c, fav=False):
    return c.get("/api/history" + ("?favorite=1" if fav else "")).json["items"]


def test_history():
    assert client().get("/api/history").status_code == 401

    c = client()
    signup(c, "hist@test.com")
    addr = analyze(c, "서울 마포구 서교동")["address"]
    analyze(c, "서울 마포구 서교동")
    items = history(c)
    assert len(items) == 1 and items[0]["address"] == addr, items
    hid = items[0]["id"]

    assert c.post(f"/api/history/{hid}/favorite", json={"on": True}).status_code == 200
    analyze(c, "서울 마포구 서교동")
    assert history(c)[0]["favorite"] is True
    analyze(c, "서울 노원구 상계동")
    assert len(history(c)) == 2 and len(history(c, fav=True)) == 1

    other = client()
    signup(other, "other@test.com")
    assert other.post(f"/api/history/{hid}/favorite", json={"on": False}).status_code == 404
    assert other.delete(f"/api/history/{hid}").status_code == 404
    assert history(c, fav=True)[0]["id"] == hid

    assert c.delete(f"/api/history/{hid}").status_code == 200
    assert len(history(c)) == 1

    uid = appmod.db.get_user_by_email("hist@test.com")["id"]
    c.delete("/api/me", json={"password": PW})
    with appmod.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM history WHERE user_id = ?", (uid,)).fetchone()[0] == 0


def test_review_fixes():
    # SECRET_KEY 미설정이면 공개된 기본값을 쓰지 않는다
    assert app.secret_key != "salmanhani_dev_key"

    # 문자열이 아닌 입력은 500이 아니라 400
    c = client()
    assert c.post("/api/signup", json={"email": 1, "password": 12345678}).status_code == 400
    assert c.post("/api/login", json={"email": "a@b.c", "password": 12345678}).status_code == 401
    assert c.post("/api/signup", json=[1, 2]).status_code == 400

    # 도로명주소가 빈 문자열이어도 입력한 주소로 저장 (빈 주소끼리 한 줄로 합쳐지지 않게)
    signup(c, "blank@test.com")
    orig = appmod.kakao.get_coords
    appmod.kakao.get_coords = lambda a: {"lat": 37.55, "lng": 126.92, "road_address": ""}
    try:
        assert analyze(c, "어딘가 1번지")["address"] == "어딘가 1번지"
    finally:
        appmod.kakao.get_coords = orig
    assert history(c)[0]["address"] == "어딘가 1번지"

    # DB_PATH가 없으면 실행 위치가 아니라 프로젝트 폴더 기준
    saved = os.environ.pop("DB_PATH")
    try:
        assert appmod.db.db_path() == os.path.join(os.path.dirname(os.path.abspath(appmod.db.__file__)), "salmanhi.db")
    finally:
        os.environ["DB_PATH"] = saved


def test_favorite_from_result():
    # 비로그인: 결과에 기록 id가 없다 → 화면에 ☆ 버튼을 안 띄운다
    assert analyze(client(), "서울 마포구 서교동").get("history_id") is None

    c = client()
    signup(c, "star@test.com")
    r = analyze(c, "서울 마포구 서교동")
    assert r["history_id"] and r["favorite"] is False
    assert c.post(f"/api/history/{r['history_id']}/favorite", json={"on": True}).status_code == 200
    r2 = analyze(c, "서울 마포구 서교동")
    assert r2["history_id"] == r["history_id"] and r2["favorite"] is True


if __name__ == "__main__":
    test_account()
    test_history()
    test_review_fixes()
    test_favorite_from_result()
    print("ok")
