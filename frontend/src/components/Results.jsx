import { useRef, useState } from 'react';
import styled from '@emotion/styled';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Block, Hint, color, mobile } from '../styles.jsx';
import { api, dur } from '../lib.js';
import CategoryChart from './CategoryChart.jsx';
import KakaoMap from './KakaoMap.jsx';

const near = (p) => (p ? `${p.name}, ${p.distance}m` : '반경 안에 없음');

export default function Results({ data, kakaoKey }) {
  const rootRef = useRef(null);
  const scoreRef = useRef(null);

  useGSAP(() => {
    rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 섹션이 차례로 떠오르고, 점수는 0부터 올라간다
    gsap.from('[data-reveal]', { y: 16, opacity: 0, duration: dur(0.5), stagger: dur(0.08), ease: 'power2.out' });
    const n = { v: 0 };
    gsap.to(n, {
      v: data.total,
      duration: dur(0.8),
      ease: 'power3.out',
      onUpdate: () => { scoreRef.current.textContent = Math.round(n.v); },
    });
  }, { scope: rootRef, dependencies: [data] });

  const s = data.facilities_summary;
  const facilities = [
    ['지하철역',          near(s.subway)],
    ['버스정류장 (500m)', `${s.bus ?? 0}곳`],
    ['편의점',            near(s.convenience)],
    ['음식점 (500m)',     `${s.restaurant ?? 0}곳`],
    ['병원',              near(s.hospital)],
    ['헬스장',            near(s.gym)],
    ['지구대·파출소',     near(s.police)],
    ...(s.cctv != null ? [['CCTV (300m)', `${s.cctv}대`]] : []),
  ];

  return (
    <div ref={rootRef}>
      {/* 도로명주소판: 이 페이지의 유일한 장식 */}
      <Plate data-reveal>
        <span>
          {data.address}
          {data.is_demo && <small>가짜 데이터</small>}
        </span>
      </Plate>
      {data.history_id && <FavoriteButton key={data.history_id} id={data.history_id} initial={data.favorite} />}

      <Hero data-reveal>
        <Score>
          <span ref={scoreRef}>0</span><small>/100</small>
        </Score>
        <div>
          <Grade>{data.grade.grade}등급</Grade>
          <Comment>{data.ai_comment}</Comment>
        </div>
      </Hero>

      <Block data-reveal>
        <h2>항목별 점수</h2>
        <CategoryChart categories={data.categories} />
      </Block>

      {kakaoKey && (
        <Block data-reveal>
          <h2>지도</h2>
          <Hint>종류별로 가장 가까운 곳만 표시했어요.</Hint>
          <KakaoMap appKey={kakaoKey} data={data} />
        </Block>
      )}

      <Block data-reveal>
        <h2>가까운 시설</h2>
        <Facilities>
          {facilities.map(([label, val]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{val}</dd>
            </div>
          ))}
        </Facilities>
      </Block>

      {data.rent && <RentHistory rent={data.rent} />}
    </div>
  );
}

// 만원 단위 → "1억 2,000" / "1,000"
const won = (m) => (m >= 10000 ? `${Math.floor(m / 10000)}억${m % 10000 ? ` ${(m % 10000).toLocaleString()}` : ''}` : m.toLocaleString());

function RentHistory({ rent }) {
  const { monthly, jeonse } = rent;
  return (
    <Block data-reveal>
      <h2>최근 1년 전월세 실거래</h2>
      {rent.count === 0 ? (
        <Hint>이 건물은 최근 1년 신고된 전월세 거래가 없어요. (단독·다가구는 건물 단위로 공개되지 않아요)</Hint>
      ) : (
        <>
          <Hint>{rent.name} · {rent.kind} · 국토교통부 신고 기준</Hint>
          <Facilities>
            {monthly && (
              <div>
                <dt>월세 {monthly.count}건</dt>
                <dd>
                  보증금 평균 {won(monthly.deposit_avg)} / 월{' '}
                  {monthly.rent_min === monthly.rent_max ? monthly.rent_min : `${monthly.rent_min}~${monthly.rent_max}`}만
                </dd>
              </div>
            )}
            {jeonse && (
              <div>
                <dt>전세 {jeonse.count}건</dt>
                <dd>평균 {won(jeonse.deposit_avg)}</dd>
              </div>
            )}
            {rent.recent.map((d, i) => (
              <div key={i}>
                <dt>{d.date} · {d.floor}층 · {d.area}㎡</dt>
                <dd>{d.rent ? `${won(d.deposit)} / ${d.rent}만` : `전세 ${won(d.deposit)}`}</dd>
              </div>
            ))}
          </Facilities>
        </>
      )}
    </Block>
  );
}

// 도로명주소판: 파란 판, 흰 글씨, 안쪽 흰 테두리
// 로그인 상태에서만 보인다 (비로그인이면 history_id가 없다)
function FavoriteButton({ id, initial }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const { ok, data } = await api('POST', `/api/history/${id}/favorite`, { on: !on });
    setBusy(false);
    if (ok) setOn(!on); else alert(data.error);
  }

  return (
    <Fav onClick={toggle} disabled={busy} aria-pressed={on}>
      {on ? '★ 즐겨찾기됨' : '☆ 즐겨찾기'}
    </Fav>
  );
}

const Fav = styled.button`
  display: block;
  margin-top: 10px;
  font: inherit;
  font-size: 14px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: ${color.plate};
  &:disabled { opacity: 0.5; }
`;

const Plate = styled.div`
  display: inline-block;
  max-width: 100%;
  background: ${color.plate};
  color: #fff;
  border-radius: 6px;
  padding: 4px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
  span {
    display: block;
    border: 1.5px solid rgba(255, 255, 255, 0.85);
    border-radius: 3px;
    padding: 8px 14px;
  }
  small { display: block; font-size: 12px; font-weight: 400; opacity: 0.8; }
`;

const Hero = styled.section`
  display: flex;
  align-items: flex-end;
  gap: 24px;
  margin-top: 28px;
  > div:last-child { padding-bottom: 4px; }
  ${mobile} { flex-direction: column; align-items: flex-start; gap: 10px; }
`;

const Score = styled.div`
  font-size: 88px;
  font-weight: 700;
  line-height: 0.9;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  small { font-size: 20px; font-weight: 500; letter-spacing: 0; color: ${color.ink2}; margin-left: 4px; }
  ${mobile} { font-size: 72px; }
`;

const Grade = styled.div`
  font-size: 18px;
  font-weight: 700;
`;

const Comment = styled.p`
  margin-top: 2px;
  color: ${color.ink2};
  font-size: 15px;
`;

const Facilities = styled.dl`
  > div {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid ${color.rule};
    font-size: 15px;
  }
  dt { color: ${color.ink2}; flex-shrink: 0; }
  dd { text-align: right; }
`;
