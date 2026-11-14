import { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import { Button, LinkButton, TextInput, color } from '../styles.jsx';
import { api } from '../lib.js';

// 헤더 오른쪽: 비로그인이면 「로그인」, 로그인이면 「내 계정」.
// 창은 브라우저 기본 <dialog> — Esc 닫기·포커스 가두기가 공짜다.
export default function Account({ user, onUserChange, onPick }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <LinkButton onClick={() => setOpen(true)}>{user ? '내 계정' : '로그인'}</LinkButton>
      <Dialog ref={ref} onClose={() => setOpen(false)} aria-label={user ? '내 계정' : '로그인'}>
        <Close onClick={() => setOpen(false)} aria-label="닫기">×</Close>
        {open && (user
          ? <MyAccount user={user} onUserChange={onUserChange} onPick={(a) => { setOpen(false); onPick(a); }} />
          : <AuthForm onDone={(email) => { onUserChange(email); setOpen(false); }} />)}
      </Dialog>
    </>
  );
}

function AuthForm({ onDone }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const isLogin = mode === 'login';

  async function submit(e) {
    e.preventDefault();
    setError('');
    const { ok, data } = await api('POST', isLogin ? '/api/login' : '/api/signup', { email, password });
    if (!ok) return setError(data.error);
    onDone(data.email);
  }

  return (
    <Form onSubmit={submit}>
      <h2>{isLogin ? '로그인' : '회원가입'}</h2>
      <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일" aria-label="이메일" autoComplete="email" required />
      <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        placeholder={isLogin ? '비밀번호' : '비밀번호 (8자 이상)'} aria-label="비밀번호"
        autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={isLogin ? undefined : 8} required />
      {error && <Err role="alert">{error}</Err>}
      <Button type="submit">{isLogin ? '로그인' : '가입하기'}</Button>
      <Small>
        {isLogin ? '처음이신가요? ' : '이미 계정이 있나요? '}
        <LinkButton type="button" onClick={() => { setMode(isLogin ? 'signup' : 'login'); setError(''); }}>
          {isLogin ? '회원가입' : '로그인'}
        </LinkButton>
      </Small>
    </Form>
  );
}

function MyAccount({ user, onUserChange, onPick }) {
  const [tab, setTab] = useState('all');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  async function load(t = tab) {
    const { ok, data } = await api('GET', `/api/history${t === 'fav' ? '?favorite=1' : ''}`);
    if (ok) setItems(data.items); else setError(data.error);
  }
  useEffect(() => { load(tab); }, [tab]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(it) {
    const { ok, data } = await api('POST', `/api/history/${it.id}/favorite`, { on: !it.favorite });
    if (ok) load(); else setError(data.error);
  }

  async function remove(it) {
    const { ok, data } = await api('DELETE', `/api/history/${it.id}`);
    if (ok) load(); else setError(data.error);
  }

  async function logout() {
    await api('POST', '/api/logout');
    onUserChange(null);
  }

  return (
    <div>
      <h2>내 계정</h2>
      <Small>{user}</Small>

      <Tabs role="tablist">
        <Tab role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>기록</Tab>
        <Tab role="tab" aria-selected={tab === 'fav'} onClick={() => setTab('fav')}>즐겨찾기</Tab>
      </Tabs>
      {error && <Err role="alert">{error}</Err>}
      {items && items.length === 0 && (
        <Small>{tab === 'fav' ? '기록에서 ☆를 눌러 즐겨찾기에 추가해 보세요.' : '로그인한 상태로 분석한 주소가 여기에 남아요.'}</Small>
      )}
      <List>
        {items?.map((it) => (
          <li key={it.id}>
            <Star onClick={() => toggle(it)} aria-pressed={it.favorite}
              aria-label={it.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}>{it.favorite ? '★' : '☆'}</Star>
            <div>
              <LinkButton onClick={() => onPick(it.address)}>{it.address}</LinkButton>
              <Small>{it.total}점 · {it.grade} · {it.created_at.slice(5, 10).replace('-', '/')}</Small>
            </div>
            <Del onClick={() => remove(it)} aria-label={`${it.address} 기록 삭제`}>삭제</Del>
          </li>
        ))}
      </List>

      <PasswordForm />

      <Footer>
        <LinkButton onClick={logout}>로그아웃</LinkButton>
        <DeleteAccount onDeleted={() => onUserChange(null)} />
      </Footer>
    </div>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const { ok, data } = await api('POST', '/api/password', { current, new: next });
    setMsg(ok ? { ok: true, text: '비밀번호를 바꿨어요.' } : { ok: false, text: data.error });
    if (ok) { setCurrent(''); setNext(''); }
  }

  return (
    <Form onSubmit={submit}>
      <h3>비밀번호 변경</h3>
      <TextInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
        placeholder="현재 비밀번호" aria-label="현재 비밀번호" autoComplete="current-password" required />
      <TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)}
        placeholder="새 비밀번호 (8자 이상)" aria-label="새 비밀번호" autoComplete="new-password" minLength={8} required />
      {msg && (msg.ok ? <Small role="status">{msg.text}</Small> : <Err role="alert">{msg.text}</Err>)}
      <Button type="submit" secondary>변경</Button>
    </Form>
  );
}

function DeleteAccount({ onDeleted }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!window.confirm('탈퇴하면 기록과 즐겨찾기가 모두 지워져요. 계속할까요?')) return;
    const { ok, data } = await api('DELETE', '/api/me', { password });
    if (!ok) return setError(data.error);
    onDeleted();
  }

  if (!open) return <LinkButton onClick={() => setOpen(true)}>회원 탈퇴</LinkButton>;
  return (
    <Form onSubmit={submit}>
      <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        placeholder="비밀번호 확인" aria-label="탈퇴용 비밀번호 확인" autoComplete="current-password" required />
      {error && <Err role="alert">{error}</Err>}
      <Button type="submit" secondary>탈퇴하기</Button>
    </Form>
  );
}

const Dialog = styled.dialog`
  margin: auto;
  width: min(440px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 28px 24px;
  border: 1px solid ${color.ink};
  border-radius: 4px;
  background: ${color.paper};
  color: ${color.ink};
  &::backdrop { background: rgba(0, 0, 0, 0.35); }
  h2 { font-size: 18px; font-weight: 700; }
  h3 { font-size: 15px; font-weight: 700; margin-top: 28px; }
`;

const Close = styled.button`
  position: absolute;
  top: 10px;
  right: 14px;
  font-size: 24px;
  line-height: 1;
  background: none;
  border: none;
  cursor: pointer;
  color: ${color.ink2};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 10px;
  input { width: 100%; }
`;

const Err = styled.p`
  color: ${color.alert};
  font-size: 14px;
`;

const Small = styled.p`
  font-size: 13px;
  color: ${color.ink2};
`;

const Tabs = styled.div`
  display: flex;
  gap: 16px;
  margin: 20px 0 8px;
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
  li {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid ${color.rule};
    font-size: 14px;
  }
  li > div { flex: 1; min-width: 0; }
  li > div > button { text-align: left; }
`;

const Star = styled.button`
  font-size: 20px;
  background: none;
  border: none;
  cursor: pointer;
  color: ${color.plate};
`;

const Del = styled.button`
  font: inherit;
  font-size: 13px;
  background: none;
  border: none;
  cursor: pointer;
  color: ${color.ink2};
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-top: 28px;
  font-size: 14px;
  form { flex: 1; }
`;
