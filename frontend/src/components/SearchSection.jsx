import { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Button, LinkButton, TextInput, color, mobile } from '../styles.jsx';
import { CATEGORY_LABELS, dur } from '../lib.js';

export default function SearchSection({ demoMode, loading, recent, weights, onWeightsChange, onSearch, onError, query }) {
  const [address, setAddress] = useState('');
  // 추천 건물·저장 기록을 눌러 검색하면 검색창 글자도 바꾼다 (query는 매번 새 객체라 같은 이름도 다시 반영)
  useEffect(() => { if (query) setAddress(query.text); }, [query]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // 중요도 패널: 열 때 높이를 0에서 자연스럽게 펼친다
  useGSAP(() => {
    if (!open) return;
    gsap.from(panelRef.current, { height: 0, opacity: 0, duration: dur(0.35), ease: 'power2.out', clearProps: 'height,opacity' });
  }, { dependencies: [open] });

  function search(addr = address) {
    const a = addr.trim();
    if (!a) return onError('주소를 입력해주세요.');
    setAddress(a);
    onSearch(a);
  }

  return (
    <Wrap>
      <h1>자취할 집, 주소부터 넣어 보세요</h1>
      <Lead>지하철, 버스, 편의점, 병원까지 걸어서 얼마나 걸리는지 보고 100점 만점으로 매겨요.</Lead>

      <SearchRow>
        <TextInput
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && search()}
          placeholder="예: 서울 마포구 서교동"
          aria-label="주소"
          autoComplete="off"
        />
        <Button onClick={() => search()} disabled={loading}>점수 보기</Button>
      </SearchRow>

      {recent.length > 0 && (
        <Recent aria-label="최근 검색">
          {recent.map((a) => (
            <LinkButton key={a} type="button" onClick={() => search(a)} disabled={loading}>{a}</LinkButton>
          ))}
        </Recent>
      )}

      {demoMode && (
        <Notice>카카오 API 키가 없어 가짜 데이터로 보여 줘요. .env에 KAKAO_API_KEY를 넣으면 실제 주변 시설로 바뀌어요.</Notice>
      )}

      <Toggle type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '중요도 접기' : '중요도 조절하기'}
      </Toggle>

      {open && (
        <div ref={panelRef} style={{ overflow: 'hidden' }}>
          <WeightSliders id="home" weights={weights} onChange={onWeightsChange} />
        </div>
      )}
    </Wrap>
  );
}

// 항목별 중요도 슬라이더. 홈과 MY > 기본 중요도에서 같이 쓴다 (둘 다 화면에 떠 있으니 id를 나눈다)
// 범위 5~50은 서버 검사(app.py WEIGHT_MIN/MAX)와 같아야 한다
export function WeightSliders({ id, weights, onChange }) {
  return (
    <Panel>
      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
        <div key={key}>
          <label htmlFor={`${id}-w-${key}`}>{label} <span>{weights[key]}</span></label>
          <input
            type="range"
            id={`${id}-w-${key}`}
            min="5" max="50" step="5"
            value={weights[key]}
            onChange={(e) => onChange({ ...weights, [key]: Number(e.target.value) })}
          />
        </div>
      ))}
    </Panel>
  );
}

const Wrap = styled.section`
  padding: 56px 0 32px;
  h1 { font-size: 30px; font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; }
  ${mobile} {
    padding-top: 40px;
    h1 { font-size: 25px; }
  }
`;

const Lead = styled.p`
  margin-top: 10px;
  color: ${color.ink2};
  font-size: 15px;
`;

const SearchRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 28px;
  ${mobile} { flex-direction: column; }
`;

// 최근 검색: 칩보다 조용한 밑줄 링크
const Recent = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 12px;
  font-size: 14px;
  button {
    color: ${color.ink2};
    text-decoration-color: ${color.rule};
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button:hover { color: ${color.ink}; text-decoration-color: ${color.ink}; }
`;

const Notice = styled.p`
  margin-top: 14px;
  font-size: 13px;
  color: ${color.ink2};
`;

const Toggle = styled(LinkButton)`
  margin-top: 24px;
  font-size: 14px;
`;

const Panel = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 24px;
  margin-top: 16px;
  label { display: flex; justify-content: space-between; font-size: 14px; }
  label span { font-variant-numeric: tabular-nums; color: ${color.ink2}; }
  ${mobile} { grid-template-columns: 1fr; }
`;
