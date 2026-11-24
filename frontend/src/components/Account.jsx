import { useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { Button, Err, LinkButton, Small, TextInput, color } from '../styles.jsx';
import { DEFAULT_WEIGHTS, api } from '../lib.js';
import { WeightSliders } from './SearchSection.jsx';

// MY 탭. 비로그인이면 로그인·회원가입.
// 로그인이면 첫 화면(요약·메뉴) → #my/weights 기본 중요도, #my/account 계정 관리
export default function Account({ user, sub, active, go, onLogin, onLogout, onWeightsSaved }) {
  if (!user) return <AuthForm onDone={onLogin} />;
  if (sub === 'weights') return <MyWeights go={go} onSaved={onWeightsSaved} />;
  if (sub === 'account') return <AccountManage go={go} onLogout={onLogout} />;
  return <MyHome user={user} active={active} go={go} onLogout={onLogout} />;
}

// /api/me를 다시 읽는다 (요약 숫자는 저장 탭에서 바뀌므로 MY에 들어올 때마다)
function useMe(active) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (active) api('GET', '/api/me').then(({ ok, data }) => ok && setMe(data));
  }, [active]);
  return me;
}

function MyHome({ user, active, go, onLogout }) {
  const me = useMe(active);

  async function logout() {
    await api('POST', '/api/logout');
    onLogout();
  }

  return (
    <div>
      <h1>{user}</h1>
      {me && <Small>{me.created_at.slice(0, 10).replaceAll('-', '.')} 가입</Small>}

      <Stats>
        {[['저장한 집', 'saved'], ['즐겨찾기', 'favorite'], ['체크 완료', 'checked']].map(([label, key]) => (
          <button key={key} onClick={() => go('saved')}>
            <strong>{me ? me.stats[key] : '–'}</strong>
            {label}
          </button>
        ))}
      </Stats>

      <Menu>
        <li><button onClick={() => go('my/weights')}>내 기본 중요도 설정<span aria-hidden="true">›</span></button></li>
        <li><button disabled>출퇴근지 등록 <Small as="span">준비 중</Small></button></li>
      </Menu>
      <Menu>
        <li><button onClick={() => go('my/account')}>계정 관리<span aria-hidden="true">›</span></button></li>
        <li><button onClick={logout}>로그아웃</button></li>
      </Menu>
    </div>
  );
}

function MyWeights({ go, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api('GET', '/api/me').then(({ data }) => setDraft(data.weights ?? DEFAULT_WEIGHTS));
  }, []);

  async function save(w) {
    const { ok, data } = await api('PUT', '/api/me/weights', { weights: w });
    if (!ok) return setMsg({ ok: false, text: data.error });
    setDraft(w ?? DEFAULT_WEIGHTS);
    onSaved(w);
    setMsg({ ok: true, text: w ? '저장했어요. 홈 점수에도 바로 적용돼요.' : '기본값으로 되돌렸어요.' });
  }

  return (
    <div>
      <Back onClick={() => go('my')}>‹ MY</Back>
      <h1>내 기본 중요도</h1>
      <Small>나한테 중요한 항목을 높여 두면, 로그인할 때마다 홈 점수가 이 기준으로 계산돼요.</Small>
      {draft && <WeightSliders id="my" weights={draft} onChange={(w) => { setDraft(w); setMsg(null); }} />}
      {msg && (msg.ok ? <Small role="status" style={{ marginTop: 16 }}>{msg.text}</Small> : <Err role="alert">{msg.text}</Err>)}
      <Actions>
        <Button onClick={() => save(draft)} disabled={!draft}>저장</Button>
        <LinkButton onClick={() => save(null)}>기본값으로</LinkButton>
      </Actions>
    </div>
  );
}

function AccountManage({ go, onLogout }) {
  return (
    <div>
      <Back onClick={() => go('my')}>‹ MY</Back>
      <h1>계정 관리</h1>
      <PasswordForm />
      <Footer>
        <DeleteAccount onDeleted={() => { onLogout(); go('my'); }} />
      </Footer>
    </div>
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
    setPassword('');
    onDone();
  }

  return (
    <Form onSubmit={submit}>
      <h1>{isLogin ? '로그인' : '회원가입'}</h1>
      {/* 로그인은 형식 검사 없이 서버에 맡긴다 (로컬 테스트 계정 "00"도 들어가게). 가입은 이메일 형식 강제 */}
      <TextInput type={isLogin ? 'text' : 'email'} inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)}
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
      <h2>비밀번호 변경</h2>
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

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
  input { width: 100%; }
  h2 { font-size: 15px; font-weight: 700; margin-top: 28px; }
`;

const Back = styled(LinkButton)`
  text-decoration: none;
  font-size: 15px;
  color: ${color.ink2};
  min-height: 44px;
  margin-bottom: 4px;
`;

const Stats = styled.div`
  display: flex;
  margin: 24px 0 8px;
  border: 1px solid ${color.rule};
  border-radius: 6px;
  button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 14px 0;
    font: inherit;
    font-size: 13px;
    color: ${color.ink2};
    background: none;
    border: none;
    cursor: pointer;
  }
  button + button { border-left: 1px solid ${color.rule}; }
  strong { font-size: 22px; color: ${color.ink}; font-variant-numeric: tabular-nums; }
`;

// 앱 설정 화면처럼 한 줄씩 누르는 메뉴
const Menu = styled.ul`
  list-style: none;
  margin-top: 24px;
  border-top: 1px solid ${color.rule};
  button {
    width: 100%;
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font: inherit;
    font-size: 16px;
    color: ${color.ink};
    background: none;
    border: none;
    border-bottom: 1px solid ${color.rule};
    cursor: pointer;
    text-align: left;
  }
  button:disabled { color: ${color.ink2}; cursor: default; }
  span[aria-hidden] { font-size: 20px; color: ${color.ink2}; }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 28px;
  font-size: 14px;
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-top: 40px;
  font-size: 14px;
  form { flex: 1; margin-top: 0; }
`;
