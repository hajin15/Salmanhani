// 화면 여러 곳에서 같이 쓰는 상수·도우미

export const CATEGORY_LABELS = {
  transit:     '교통',
  convenience: '편의시설',
  food:        '식생활',
  medical:     '의료',
  leisure:     '여가·운동',
  safety:      '야간 안전',
};

export const DEFAULT_WEIGHTS = {
  transit:     20,
  convenience: 20,
  food:        15,
  medical:     15,
  leisure:     15,
  safety:      15,
};

// 움직임을 줄여 달라는 설정이면 GSAP 애니메이션 시간을 0으로
export const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const dur = (s) => (REDUCED_MOTION ? 0 : s);

// 서버 에러 응답({error})도 그대로 돌려줘서 화면에서 메시지를 보여 줄 수 있게 한다
export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { ok: res.ok && !data.error, data };
}

export const postJSON = (url, body) => api('POST', url, body);

// ── 최근 검색 ──
// 이 브라우저에만 남는다. 사파리 개인정보 모드 등에서 localStorage가 막히면 조용히 생략.
const RECENT_KEY = 'salmanhani.recent';
const RECENT_MAX = 5;

export function loadRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRecent(address) {
  // 같은 주소는 맨 앞으로 올리고, 오래된 건 밀어낸다 (입력한 그대로 저장 → 눌렀을 때 같은 검색이 된다)
  const list = [address, ...loadRecent().filter((a) => a !== address)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* 저장 불가 → 무시 */ }
  return list;
}

// ── 가격 ──
// 보증금을 월 비용으로 바꿀 때 쓰는 연 이율.
// ponytail: 고정 5% (시장 전월세전환율 근사). 정확히 하려면 한국부동산원 지역별 전환율로 바꾸면 된다.
const DEPOSIT_RATE = 0.05;

// 한 달 실부담(만원) = 월세 + 보증금을 묶어 둔 값(보증금 × 연이율 ÷ 12). 둘 다 비면 null.
export function monthlyCost(deposit, rent) {
  if (deposit == null && rent == null) return null;
  return (rent ?? 0) + (deposit ?? 0) * DEPOSIT_RATE / 12;
}

export function parsePrice(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;  // 음수·이상값은 안 넣은 것으로
}
