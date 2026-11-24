import { useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { Button, Err, LinkButton, Small, color } from '../styles.jsx';
import { api } from '../lib.js';

// 저장 탭: 로그인한 상태로 분석한 주소 기록과 즐겨찾기.
// 탭은 화면을 숨겨 둘 뿐 없애지 않으므로, 탭에 들어올 때마다(active) 다시 불러온다.
export default function Saved({ user, active, onPick, onLogin }) {
  const [tab, setTab] = useState('all');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  async function load(t = tab) {
    setError('');
    const { ok, data } = await api('GET', `/api/history${t === 'fav' ? '?favorite=1' : ''}`);
    if (ok) setItems(data.items); else setError(data.error);
  }
  useEffect(() => { if (user && active) load(tab); }, [user, active, tab]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(it) {
    const { ok, data } = await api('POST', `/api/history/${it.id}/favorite`, { on: !it.favorite });
    if (ok) load(); else setError(data.error);
  }

  async function remove(it) {
    const { ok, data } = await api('DELETE', `/api/history/${it.id}`);
    if (ok) load(); else setError(data.error);
  }

  if (!user) {
    return (
      <div>
        <h1>저장</h1>
        <Small>로그인하면 분석한 주소가 여기에 쌓이고, 즐겨찾기도 할 수 있어요.</Small>
        <Button onClick={onLogin} style={{ marginTop: 16 }}>로그인하러 가기</Button>
      </div>
    );
  }

  return (
    <div>
      <h1>저장</h1>
      <Tabs role="tablist">
        <Tab role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>기록</Tab>
        <Tab role="tab" aria-selected={tab === 'fav'} onClick={() => setTab('fav')}>즐겨찾기</Tab>
      </Tabs>
      {error && <Err role="alert">{error}</Err>}
      {items && items.length === 0 && (
        <Small>{tab === 'fav' ? '기록에서 ☆를 눌러 즐겨찾기에 추가해 보세요.' : '홈에서 주소를 분석하면 여기에 남아요.'}</Small>
      )}
      <List>
        {items?.map((it) => (
          <li key={it.id}>
            <Row>
              <Star onClick={() => toggle(it)} aria-pressed={it.favorite}
                aria-label={it.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}>{it.favorite ? '★' : '☆'}</Star>
              <div>
                <LinkButton onClick={() => onPick(it.address)}>{it.address}</LinkButton>
                <Small>{it.total}점 · {it.grade} · {it.created_at.slice(5, 10).replace('-', '/')}</Small>
              </div>
              <Del onClick={() => remove(it)} aria-label={`${it.address} 기록 삭제`}>삭제</Del>
            </Row>
            <Checklist key={it.id} item={it} />
          </li>
        ))}
      </List>
    </div>
  );
}

// 집 보러 갔을 때 볼 것. 키는 서버에 그대로 저장되므로 바꾸지 말고, 항목은 뒤에 추가만 한다
const CHECK_ITEMS = [
  ['water',   '수압·배수'],
  ['light',   '채광·방향'],
  ['mold',    '곰팡이·결로'],
  ['noise',   '소음 (도로·이웃)'],
  ['heat',    '보일러·난방'],
  ['window',  '창문·방충망'],
  ['storage', '수납 공간'],
  ['outlet',  '콘센트 위치·개수'],
  ['door',    '현관 보안·CCTV'],
  ['fee',     '관리비 포함 항목'],
];

// 접었다 펴는 건 브라우저 기본 <details>. 누를 때마다 바로 저장, 메모는 입력칸을 벗어날 때 저장
function Checklist({ item }) {
  const [marks, setMarks] = useState(item.checklist);
  const [memo, setMemo] = useState(item.memo);
  const [savedMemo, setSavedMemo] = useState(item.memo);
  const [status, setStatus] = useState(null);

  async function save(nextMarks, nextMemo) {
    const { ok, data } = await api('PUT', `/api/history/${item.id}/checklist`, { checklist: nextMarks, memo: nextMemo });
    setStatus(ok ? { ok: true, text: '저장했어요' } : { ok: false, text: data.error });
    if (ok) setSavedMemo(nextMemo);
  }

  function mark(key, v) {
    const next = { ...marks };
    if (next[key] === v) delete next[key]; else next[key] = v;  // 같은 걸 다시 누르면 취소
    setMarks(next);
    save(next, savedMemo);
  }

  const done = Object.keys(marks).length;
  const bad = Object.values(marks).filter((v) => v === 'bad').length;

  return (
    <Details>
      <summary>체크리스트 {done}/{CHECK_ITEMS.length}{bad > 0 && <Bad> · 별로 {bad}</Bad>}{savedMemo ? ' · 메모' : ''}</summary>
      <ul>
        {CHECK_ITEMS.map(([key, label]) => (
          <li key={key}>
            <span>{label}</span>
            <Mark aria-pressed={marks[key] === 'ok'} data-v="ok" onClick={() => mark(key, 'ok')}
              aria-label={`${label} 괜찮음`}>괜찮음</Mark>
            <Mark aria-pressed={marks[key] === 'bad'} data-v="bad" onClick={() => mark(key, 'bad')}
              aria-label={`${label} 별로`}>별로</Mark>
          </li>
        ))}
      </ul>
      <textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} rows={3}
        onBlur={() => memo !== savedMemo && save(marks, memo)}
        placeholder="메모 (예: 남향, 집주인 친절, 엘리베이터 없음)" aria-label={`${item.address} 메모`} />
      {status && (status.ok ? <Small role="status">{status.text}</Small> : <Err role="alert">{status.text}</Err>)}
    </Details>
  );
}

const Tabs = styled.div`
  display: flex;
  gap: 16px;
  margin: 12px 0 8px;
  border-bottom: 1px solid ${color.rule};
`;

const Tab = styled.button`
  font: inherit;
  font-size: 15px;
  background: none;
  border: none;
  padding: 6px 0;
  cursor: pointer;
  color: ${color.ink2};
  border-bottom: 2px solid transparent;
  &[aria-selected='true'] { color: ${color.ink}; font-weight: 700; border-bottom-color: ${color.ink}; }
`;

const List = styled.ul`
  list-style: none;
  > li {
    padding: 8px 0 12px;
    border-bottom: 1px solid ${color.rule};
    font-size: 15px;
  }
`;

const Row = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  > div { flex: 1; min-width: 0; }
  > div > button { text-align: left; }
`;

const Details = styled.details`
  margin-left: 54px;  /* ☆ 버튼 너비만큼 들여서 주소와 줄을 맞춘다 */
  summary { font-size: 14px; color: ${color.plate}; cursor: pointer; padding: 6px 0; min-height: 32px; }
  ul { list-style: none; margin: 4px 0 10px; }
  li { display: flex; align-items: center; gap: 6px; padding: 6px 0; font-size: 14px; }
  li > span { flex: 1; }
  textarea {
    width: 100%;
    font: inherit;
    font-size: 16px;  /* 16px 미만이면 iOS가 확대 */
    padding: 10px 12px;
    background: ${color.field};
    border: 1px solid transparent;
    border-radius: 4px;
    resize: vertical;
    &:focus { outline: none; background: ${color.paper}; border-color: ${color.ink}; }
  }
`;

const Bad = styled.span`color: ${color.alert};`;

const Mark = styled.button`
  font: inherit;
  font-size: 13px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 18px;
  border: 1px solid ${color.rule};
  background: ${color.paper};
  color: ${color.ink2};
  cursor: pointer;
  &[aria-pressed='true'][data-v='ok']  { background: ${color.plate}; border-color: ${color.plate}; color: #fff; }
  &[aria-pressed='true'][data-v='bad'] { background: ${color.alert}; border-color: ${color.alert}; color: #fff; }
`;

const Star = styled.button`
  font-size: 22px;
  min-width: 44px;
  min-height: 44px;
  background: none;
  border: none;
  cursor: pointer;
  color: ${color.plate};
`;

const Del = styled.button`
  font: inherit;
  font-size: 13px;
  min-height: 44px;
  background: none;
  border: none;
  cursor: pointer;
  color: ${color.ink2};
`;
