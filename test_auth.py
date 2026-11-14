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


if __name__ == "__main__":
    test_account()
    print("ok")
