# 회원 기능 설계 (가입·로그인·계정관리 + 분석 기록·즐겨찾기)

## 왜
로그인한 사람이 분석한 주소를 다시 찾아보고, 집 후보를 즐겨찾기로 추려 둘 수 있게 한다.
로그인하지 않아도 지금처럼 분석은 그대로 된다.

## 목표
- 이메일·비밀번호로 회원가입, 로그인, 로그아웃
- 계정관리: 비밀번호 변경, 회원 탈퇴(기록·즐겨찾기 함께 삭제)
- 로그인 상태에서 분석하면 기록에 자동 저장 (주소 + 그때의 총점·등급)
- 기록에서 ☆로 즐겨찾기 지정/해제, 즐겨찾기만 모아 보기
- 기록·즐겨찾기를 누르면 그 주소를 다시 분석

## 하지 않는 것
- 카카오 등 소셜 로그인 (나중에 버튼으로 추가 가능)
- 이메일 인증, 비밀번호 찾기(메일 발송)
- 상세 결과 전체 저장 (점수 기준이 바뀌면 옛 결과가 헷갈림)

## 방법 (검토한 안)
1. **이메일·비밀번호 + SQLite — 채택.** 외부 설정 없이 팀원 누구나 실행 가능, 요청한 계정관리를 그대로 만족.
2. 카카오 로그인 + SQLite — 콘솔·Redirect URI 설정 부담, 계정관리 기능이 거의 없어짐.
3. 계정 없이 localStorage — 회원가입 요청과 맞지 않아 제외.

## 설계
- **DB:** 파이썬 내장 `sqlite3`, 파일 `salmanhi.db`(gitignore). 서버 시작 시 테이블 자동 생성.
  - `users(id, email UNIQUE, password_hash, created_at)`
  - `history(id, user_id → users ON DELETE CASCADE, address, total, grade, favorite 0/1, created_at)`
  - 같은 주소를 다시 분석하면 새 행 대신 기존 행의 점수·시각을 갱신(즐겨찾기 유지).
- **인증:** Flask 기본 `session` 쿠키에 `user_id`. 비밀번호는 `werkzeug.security`로 해시. 새 의존성 없음.
- **API:** `POST /api/signup`, `/api/login`, `/api/logout`, `GET /api/me`, `POST /api/password`, `DELETE /api/me`,
  `GET /api/history?favorite=1`, `POST /api/history/<id>/favorite`, `DELETE /api/history/<id>`.
  `/api/analyze`는 로그인 상태면 기록에 저장.
- **검증:** 이메일 형식, 비밀번호 8자 이상. 남의 기록은 user_id로 막는다.
- **화면:** 헤더에 로그인/가입 또는 「내 계정」. 모달로 로그인·가입, 「내 계정」 패널에 기록·즐겨찾기 탭과 비밀번호 변경·탈퇴.

## 운영 시 주의
- 배포할 때 `SECRET_KEY`를 반드시 설정 (기본값이면 세션 위조 가능).
- 파일이 지워지는 호스팅에선 가입 정보가 사라짐 → 그때 PostgreSQL로 이전.

## 구현자 재량
- 화면 배치·스타일 세부 (기존 Emotion 스타일을 따른다)
- 코드를 app.py에 둘지 db.py/auth.py로 나눌지
