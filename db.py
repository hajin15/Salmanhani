"""
회원·분석 기록 저장 (SQLite, 파이썬 내장)
DB는 파일 하나(DB_PATH, 기본 salmanhi.db)이고 서버가 켜질 때 테이블을 만든다.
ponytail: 파일이 지워지는 호스팅에선 가입 정보가 사라진다 → 그때 PostgreSQL로 옮긴다.
"""

import os
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS history (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address    TEXT NOT NULL,
    total      INTEGER NOT NULL,
    grade      TEXT NOT NULL,
    favorite   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (user_id, address)
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(os.getenv("DB_PATH", "salmanhi.db"))
    conn.row_factory = sqlite3.Row
    # SQLite는 연결마다 켜야 ON DELETE CASCADE가 동작한다 (안 켜면 탈퇴해도 기록이 남는다)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init():
    with connect() as conn:
        conn.executescript(SCHEMA)


# ─── 회원 ───────────────────────────────────────────────────────────

def create_user(email: str, password_hash: str) -> int | None:
    """가입. 이미 있는 이메일이면 None"""
    try:
        with connect() as conn:
            return conn.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)", (email, password_hash)
            ).lastrowid
    except sqlite3.IntegrityError:
        return None


def get_user_by_email(email: str):
    with connect() as conn:
        return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def get_user(user_id: int):
    with connect() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def set_password(user_id: int, password_hash: str):
    with connect() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))


def delete_user(user_id: int):
    with connect() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


# ─── 분석 기록·즐겨찾기 ─────────────────────────────────────────────

def save_history(user_id: int, address: str, total: int, grade: str):
    """같은 주소를 다시 분석하면 새 행 대신 점수·시각만 갱신 (즐겨찾기는 그대로)"""
    with connect() as conn:
        conn.execute(
            """INSERT INTO history (user_id, address, total, grade) VALUES (?, ?, ?, ?)
               ON CONFLICT (user_id, address) DO UPDATE SET
                 total = excluded.total, grade = excluded.grade,
                 created_at = datetime('now', 'localtime')""",
            (user_id, address, total, grade),
        )


def list_history(user_id: int, favorite_only: bool = False) -> list[dict]:
    sql = "SELECT id, address, total, grade, favorite, created_at FROM history WHERE user_id = ?"
    if favorite_only:
        sql += " AND favorite = 1"
    with connect() as conn:
        rows = conn.execute(sql + " ORDER BY created_at DESC, id DESC", (user_id,)).fetchall()
    return [{**dict(r), "favorite": bool(r["favorite"])} for r in rows]


def set_favorite(user_id: int, hid: int, on: bool) -> bool:
    """남의 기록이면 False (user_id 조건으로 막는다)"""
    with connect() as conn:
        return conn.execute(
            "UPDATE history SET favorite = ? WHERE id = ? AND user_id = ?", (int(on), hid, user_id)
        ).rowcount > 0


def delete_history(user_id: int, hid: int) -> bool:
    with connect() as conn:
        return conn.execute(
            "DELETE FROM history WHERE id = ? AND user_id = ?", (hid, user_id)
        ).rowcount > 0
