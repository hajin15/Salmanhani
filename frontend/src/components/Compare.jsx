import { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Block, Button, Hint, NumberInput, TextInput, color } from '../styles.jsx';
import { CATEGORY_LABELS, dur, monthlyCost, parsePrice, postJSON } from '../lib.js';

const PLACEHOLDERS = ['집 1 (지금 본 주소)', '집 2', '집 3 (선택)'];
const EMPTY = { address: '', deposit: '', rent: '' };
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const short = (a) => (!a ? '주소 오류' : a.length > 12 ? `${a.slice(0, 12)}…` : a);

export default function Compare({ firstAddress, weights }) {
  const [entries, setEntries] = useState([EMPTY, EMPTY, EMPTY]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const tableRef = useRef(null);

  // 방금 본 주소를 집 1에 채운다 (이미 쓴 게 있으면 그대로)
  useEffect(() => {
    setEntries((es) => (es[0].address ? es : [{ ...es[0], address: firstAddress }, ...es.slice(1)]));
  }, [firstAddress]);

  useGSAP(() => {
    if (results) gsap.from('tbody tr', { x: -12, opacity: 0, duration: dur(0.4), stagger: dur(0.05), ease: 'power2.out' });
  }, { scope: tableRef, dependencies: [results] });

  const edit = (i, field, value) =>
    setEntries((es) => es.map((e, j) => (j === i ? { ...e, [field]: value } : e)));

  async function compare() {
    const filled = entries
      .map((e) => ({ address: e.address.trim(), cost: monthlyCost(parsePrice(e.deposit), parsePrice(e.rent)) }))
      .filter((e) => e.address);
    if (filled.length < 2) {
      alert('주소를 2개 이상 입력해주세요.');
      return;
    }

    setBusy(true);
    try {
      const { data } = await postJSON('/api/compare', { addresses: filled.map((e) => e.address), weights });
      // 서버는 보낸 순서대로 결과를 돌려준다 → 같은 인덱스에 가격을 붙인다
      setResults(data.results.map((r, i) => ({ ...r, cost: filled[i].cost })));
    } catch {
      alert('비교 중 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Block>
      <h2>다른 집과 비교하기</h2>
      <Hint>가격은 비워 둬도 돼요. 넣으면 한 달에 실제로 드는 돈까지 비교해요.</Hint>

      <Inputs>
        {entries.map((e, i) => (
          <Entry key={i}>
            <TextInput
              type="text"
              value={e.address}
              onChange={(ev) => edit(i, 'address', ev.target.value)}
              placeholder={PLACEHOLDERS[i]}
              aria-label={`집 ${i + 1} 주소`}
            />
            <PriceRow>
              <label>보증금 <NumberInput type="number" min="0" step="100" inputMode="numeric" placeholder="1000"
                value={e.deposit} onChange={(ev) => edit(i, 'deposit', ev.target.value)} /> 만원</label>
              <label>월세 <NumberInput type="number" min="0" step="1" inputMode="numeric" placeholder="50"
                value={e.rent} onChange={(ev) => edit(i, 'rent', ev.target.value)} /> 만원</label>
            </PriceRow>
          </Entry>
        ))}
      </Inputs>
      <Button secondary onClick={compare} disabled={busy} style={{ marginTop: 10 }}>
        {busy ? '비교 중...' : '비교하기'}
      </Button>

      {results && <div ref={tableRef}><CompareTable results={results} /></div>}
    </Block>
  );
}

function CompareTable({ results }) {
  const ok = results.filter((r) => !r.error);
  const maxTotal = Math.max(...ok.map((r) => r.total));

  // 가격 행 — 가격 넣은 집이 하나라도 있을 때만. 둘 다 낮을수록 좋다.
  const priced = ok.filter((r) => r.cost != null);
  const perPoint = (r) => (r.total > 0 ? (r.cost * 10000) / r.total : null);  // 점수 1점에 드는 월 비용(원)
  const minCost = Math.min(...priced.map((r) => r.cost));
  const pp = priced.map(perPoint).filter((v) => v != null);
  const minPP = Math.min(...pp);

  return (
    <TableWrap>
      <table>
        <thead>
          <tr>
            <th>항목</th>
            {results.map((r, i) => <th key={i}>{short(r.address)}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>종합 점수</th>
            {results.map((r, i) => (r.error
              ? <td key={i} className="error">{r.error}</td>
              : <td key={i} className={r.total === maxTotal ? 'best' : ''}>{r.total} ({r.grade.grade})</td>))}
          </tr>

          {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
            const maxPct = Math.max(...ok.map((r) => r.categories[key]?.pct ?? 0));
            return (
              <tr key={key}>
                <td>{label}</td>
                {results.map((r, i) => {
                  if (r.error) return <td key={i}>-</td>;
                  const pct = r.categories[key]?.pct ?? 0;
                  return <td key={i} className={pct === maxPct ? 'best' : ''}>{pct}점</td>;
                })}
              </tr>
            );
          })}

          {priced.length > 0 && (
            <>
              <tr>
                <td>한 달 실부담</td>
                {results.map((r, i) => (r.error || r.cost == null
                  ? <td key={i}>-</td>
                  : <td key={i} className={priced.length > 1 && r.cost === minCost ? 'best' : ''}>{won(r.cost)}만원</td>))}
              </tr>
              <tr>
                <td>1점당 월 비용</td>
                {results.map((r, i) => {
                  const v = r.error || r.cost == null ? null : perPoint(r);
                  return v == null
                    ? <td key={i}>-</td>
                    : <td key={i} className={pp.length > 1 && v === minPP ? 'best' : ''}>{won(v)}원</td>;
                })}
              </tr>
            </>
          )}
        </tbody>
      </table>
    </TableWrap>
  );
}

const Inputs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
`;

const Entry = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${color.rule};
  &:last-child { border-bottom: none; }
`;

const PriceRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: 14px;
  color: ${color.ink2};
  label { display: flex; align-items: center; gap: 6px; }
`;

const TableWrap = styled.div`
  margin-top: 24px;
  overflow-x: auto;
  table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
  th, td { padding: 10px 8px; text-align: right; border-bottom: 1px solid ${color.rule}; }
  th:first-child, td:first-child { text-align: left; padding-left: 0; }
  thead th { font-weight: 500; border-bottom: 2px solid ${color.ink}; }
  .error { color: ${color.alert}; }
  .best { color: ${color.plate}; font-weight: 700; }
`;
