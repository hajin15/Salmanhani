'use strict';

// ── 상태 ──────────────────────────────────────────────────────────
let lastResult = null;

// ── 가중치 기본값 ─────────────────────────────────────────────────
const DEFAULT_WEIGHTS = {
  transit:     20,
  convenience: 20,
  food:        15,
  medical:     15,
  leisure:     15,
  safety:      15,
};

const CATEGORY_LABELS = {
  transit:     '교통',
  convenience: '편의시설',
  food:        '식생활',
  medical:     '의료',
  leisure:     '여가·운동',
  safety:      '야간 안전',
};

// ── 초기화 ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initWeightSliders();
  initSearchForm();
  initCompareForm();
  renderRecent();

  // Enter 키로 검색
  document.getElementById('addr-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('search-btn').click();
  });
});

// ── 가중치 슬라이더 ───────────────────────────────────────────────
function initWeightSliders() {
  const toggle = document.getElementById('weight-toggle');
  const panel = document.getElementById('weight-panel');

  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
    toggle.textContent = open ? '중요도 접기' : '중요도 조절하기';
  });

  Object.keys(DEFAULT_WEIGHTS).forEach(key => {
    const slider = document.getElementById(`w-${key}`);
    const valueEl = document.getElementById(`wv-${key}`);
    if (!slider || !valueEl) return;

    slider.value = DEFAULT_WEIGHTS[key];
    valueEl.textContent = DEFAULT_WEIGHTS[key];

    slider.addEventListener('input', () => {
      valueEl.textContent = slider.value;
    });
  });
}

function getWeights() {
  const w = {};
  Object.keys(DEFAULT_WEIGHTS).forEach(key => {
    const el = document.getElementById(`w-${key}`);
    w[key] = el ? parseInt(el.value) : DEFAULT_WEIGHTS[key];
  });
  return w;
}

// ── 검색 폼 ───────────────────────────────────────────────────────
function initSearchForm() {
  document.getElementById('search-btn').addEventListener('click', async () => {
    const addr = document.getElementById('addr-input').value.trim();
    if (!addr) {
      showError('주소를 입력해주세요.');
      return;
    }
    await runAnalyze(addr);
  });
}

async function runAnalyze(address) {
  showLoading(true);
  hideError();
  hideResults();

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, weights: getWeights() }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showError(data.error || '알 수 없는 오류가 발생했어요.');
      return;
    }

    lastResult = data;
    saveRecent(address);
    renderResults(data);
  } catch (e) {
    showError('서버와 연결할 수 없어요. Flask 서버가 실행 중인지 확인해주세요.');
  } finally {
    showLoading(false);
  }
}

// ── 최근 검색 ─────────────────────────────────────────────────────
// 이 브라우저에만 남는다. 사파리 개인정보 모드 등에서 localStorage가 막히면 조용히 생략.
const RECENT_KEY = 'salmanhi.recent';
const RECENT_MAX = 5;

function loadRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveRecent(address) {
  // 같은 주소는 맨 앞으로 올리고, 오래된 건 밀어낸다 (입력한 그대로 저장 → 눌렀을 때 같은 검색이 된다)
  const list = [address, ...loadRecent().filter(a => a !== address)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* 저장 불가 → 무시 */ }
  renderRecent();
}

function renderRecent() {
  const el = document.getElementById('recent-list');
  if (!el) return;
  el.innerHTML = '';
  loadRecent().forEach(addr => {
    // 사용자가 친 문자열이라 textContent로 넣는다
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'recent-chip';
    chip.textContent = addr;
    chip.addEventListener('click', () => {
      document.getElementById('addr-input').value = addr;
      runAnalyze(addr);
    });
    el.appendChild(chip);
  });
}

// ── 결과 렌더링 ───────────────────────────────────────────────────
function renderResults(data) {
  // 주소 — 도로명주소판 (주소는 입력값이 그대로 올 수도 있어서 textContent)
  const plate = document.getElementById('result-address');
  const inner = document.createElement('span');
  inner.textContent = data.address;
  if (data.is_demo) {
    const note = document.createElement('small');
    note.textContent = '가짜 데이터';
    inner.appendChild(note);
  }
  plate.replaceChildren(inner);

  animateNumber('score-num', 0, data.total, 800);

  // 등급 + 코멘트
  document.getElementById('grade-text').textContent = `${data.grade.grade}등급`;
  document.getElementById('ai-comment').textContent = data.ai_comment;


  // 카테고리 카드
  renderCategoryCards(data.categories);

  // 시설 요약
  renderFacilitySummary(data.facilities_summary);

  // 비교 첫 번째 주소 채우기
  const ci = document.getElementById('compare-addr-1');
  if (ci && !ci.value) ci.value = data.address;

  showResults();

  // 지도는 보이는 상태에서 그려야 크기가 맞는다 → showResults 뒤
  renderMap(data);
}

// ── 지도 ──────────────────────────────────────────────────────────
const PIN_LABELS = {
  subway: '지하철', bus: '버스', convenience: '편의점', mart: '마트', restaurant: '음식점',
  cafe: '카페', hospital: '병원', pharmacy: '약국', gym: '헬스장',
};

function renderMap(data) {
  const box = document.getElementById('map');
  if (!box || !window.kakao?.maps) return;  // JS 키 없거나 SDK 로드 실패 → 지도 생략

  kakao.maps.load(() => {
    box.innerHTML = '';
    const center = new kakao.maps.LatLng(data.lat, data.lng);
    const map = new kakao.maps.Map(box, { center, level: 4 });
    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(center);

    new kakao.maps.Marker({ map, position: center, title: data.address });

    (data.pins || []).forEach(p => {
      const pos = new kakao.maps.LatLng(p.lat, p.lng);
      bounds.extend(pos);
      // 이름은 외부 API 값이라 innerHTML 대신 textContent로 넣는다
      const el = document.createElement('div');
      el.className = 'map-pin';
      const tag = document.createElement('b');
      tag.textContent = PIN_LABELS[p.category] || '';
      el.append(tag, `${p.name} ${p.distance}m`);
      new kakao.maps.CustomOverlay({ map, position: pos, content: el, yAnchor: 1.2 });
    });

    map.setBounds(bounds);
  });
}

function renderCategoryCards(categories) {
  const grid = document.getElementById('cat-grid');
  grid.innerHTML = '';

  Object.values(categories).forEach(cat => {
    grid.innerHTML += `
      <div class="cat-row">
        <span>${cat.label}</span>
        <div class="bar-bg"><div class="bar-fill" style="width:${cat.pct}%"></div></div>
        <span class="cat-score">${cat.score}/${cat.max}</span>
      </div>
    `;
  });
}

function renderFacilitySummary(summary) {
  const el = document.getElementById('facility-list');
  if (!el) return;

  const near = p => p ? `${p.name}, ${p.distance}m` : '반경 안에 없음';
  const rows = [
    ['지하철역',          near(summary.subway)],
    ['버스정류장 (500m)', `${summary.bus ?? 0}곳`],
    ['편의점',            near(summary.convenience)],
    ['음식점 (500m)',     `${summary.restaurant ?? 0}곳`],
    ['병원',              near(summary.hospital)],
    ['헬스장',            near(summary.gym)],
  ];

  // 시설 이름은 외부 API 값이라 textContent로 넣는다
  el.replaceChildren(...rows.map(([label, val]) => {
    const row = document.createElement('div');
    row.className = 'facility-row';
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = val;
    row.append(dt, dd);
    return row;
  }));
}

// ── 비교 기능 ─────────────────────────────────────────────────────
// 보증금을 월 비용으로 바꿀 때 쓰는 연 이율.
// ponytail: 고정 5% (시장 전월세전환율 근사). 정확히 하려면 한국부동산원 지역별 전환율로 바꾸면 된다.
const DEPOSIT_RATE = 0.05;

// 한 달 실부담(만원) = 월세 + 보증금을 묶어 둔 값(보증금 × 연이율 ÷ 12). 둘 다 비면 null.
function monthlyCost(deposit, rent) {
  if (deposit == null && rent == null) return null;
  return (rent ?? 0) + (deposit ?? 0) * DEPOSIT_RATE / 12;
}

function readPrice(id) {
  const v = document.getElementById(id)?.value;
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;  // 음수·이상값은 안 넣은 것으로
}

function initCompareForm() {
  document.getElementById('compare-btn').addEventListener('click', async () => {
    const entries = [1, 2, 3]
      .map(i => ({
        address: document.getElementById(`compare-addr-${i}`)?.value.trim(),
        cost: monthlyCost(readPrice(`compare-deposit-${i}`), readPrice(`compare-rent-${i}`)),
      }))
      .filter(e => e.address);
    const addrs = entries.map(e => e.address);

    if (addrs.length < 2) {
      alert('주소를 2개 이상 입력해주세요.');
      return;
    }

    const btn = document.getElementById('compare-btn');
    btn.disabled = true;
    btn.textContent = '비교 중...';

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: addrs, weights: getWeights() }),
      });
      const data = await res.json();
      // 서버는 보낸 순서대로 결과를 돌려준다 → 같은 인덱스에 가격을 붙인다
      data.results.forEach((r, i) => { r.cost = entries[i].cost; });
      renderCompareResults(data.results);
    } catch (e) {
      alert('비교 중 오류가 발생했어요.');
    } finally {
      btn.disabled = false;
      btn.textContent = '비교하기';
    }
  });
}

function renderCompareResults(results) {
  const el = document.getElementById('compare-results');
  const tbody = document.getElementById('compare-tbody');
  if (!el || !tbody) return;

  const cats = Object.keys(CATEGORY_LABELS);
  const maxTotal = Math.max(...results.filter(r => !r.error).map(r => r.total));

  tbody.innerHTML = '';

  // 총점 행
  let tr = '<tr>';
  tr += '<th>종합 점수</th>';
  results.forEach(r => {
    if (r.error) {
      tr += `<td class="error-cell">${r.error}</td>`;
    } else {
      const best = r.total === maxTotal ? 'best-score' : '';
      tr += `<td class="${best}">${r.total} (${r.grade.grade})</td>`;
    }
  });
  tr += '</tr>';
  tbody.innerHTML += tr;

  // 카테고리별 행
  cats.forEach(key => {
    let row = `<tr><td>${CATEGORY_LABELS[key]}</td>`;
    const pcts = results.filter(r => !r.error).map(r => r.categories[key]?.pct ?? 0);
    const maxPct = Math.max(...pcts);

    results.forEach(r => {
      if (r.error) {
        row += '<td>-</td>';
      } else {
        const pct = r.categories[key]?.pct ?? 0;
        const cls = pct === maxPct ? 'best-score' : '';
        row += `<td class="${cls}">${pct}점</td>`;
      }
    });
    row += '</tr>';
    tbody.innerHTML += row;
  });

  // 가격 행 — 가격 넣은 집이 하나라도 있을 때만. 둘 다 낮을수록 좋다.
  const priced = results.filter(r => !r.error && r.cost != null);
  if (priced.length) {
    const perPoint = r => r.total > 0 ? r.cost * 10000 / r.total : null;  // 점수 1점에 드는 월 비용(원)
    const minCost = Math.min(...priced.map(r => r.cost));
    const pp = priced.map(perPoint).filter(v => v != null);
    const minPP = pp.length ? Math.min(...pp) : null;
    const won = n => Math.round(n).toLocaleString('ko-KR');

    let costRow = '<tr><td>한 달 실부담</td>';
    let ppRow = '<tr><td>1점당 월 비용</td>';
    results.forEach(r => {
      if (r.error || r.cost == null) {
        costRow += '<td>-</td>';
        ppRow += '<td>-</td>';
        return;
      }
      costRow += `<td class="${priced.length > 1 && r.cost === minCost ? 'best-score' : ''}">${won(r.cost)}만원</td>`;
      const v = perPoint(r);
      ppRow += v == null ? '<td>-</td>'
        : `<td class="${pp.length > 1 && v === minPP ? 'best-score' : ''}">${won(v)}원</td>`;
    });
    tbody.innerHTML += costRow + '</tr>' + ppRow + '</tr>';
  }

  // 헤더 세팅
  const thead = document.getElementById('compare-thead');
  if (thead) {
    thead.innerHTML = '<th>항목</th>' +
      results.map(r => `<th>${!r.address ? '주소 오류' : r.address.length > 12 ? r.address.substring(0, 12) + '…' : r.address}</th>`).join('');
  }

  el.style.display = 'block';
}

// ── UI 유틸 ───────────────────────────────────────────────────────
function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'block' : 'none';
  document.getElementById('search-btn').disabled = show;
}

function showResults() {
  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideResults() {
  document.getElementById('results').style.display = 'none';
}

function showError(msg) {
  const el = document.getElementById('error-box');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError() {
  document.getElementById('error-box').style.display = 'none';
}

function animateNumber(id, from, to, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  function update(now) {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(from + (to - from) * easeOut(t));
    if (t < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
