import { useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import { GlobalStyle, Spinner, color } from './styles.jsx';
import { DEFAULT_WEIGHTS, api, loadRecent, postJSON, saveRecent } from './lib.js';
import SearchSection from './components/SearchSection.jsx';
import Results from './components/Results.jsx';
import Compare from './components/Compare.jsx';
import Saved from './components/Saved.jsx';
import Account from './components/Account.jsx';

// 하단 탭. 아이콘은 24×24 선 그림
const TABS = [
  { id: 'home',    label: '홈',   icon: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
  { id: 'compare', label: '비교', icon: 'M6 20V10M12 20V4M18 20v-6' },
  { id: 'saved',   label: '저장', icon: 'M6 3h12v18l-6-4-6 4z' },
  { id: 'my',      label: 'MY',   icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6' },
];

// 지금 화면은 주소 #compare, #my/account 처럼 URL에 둔다 → 휴대폰 뒤로가기·새로고침이 그대로 동작
const readRoute = () => {
  const [tab, sub = ''] = window.location.hash.slice(1).split('/');
  return TABS.some((t) => t.id === tab) ? { tab, sub } : { tab: 'home', sub: '' };
};

export default function App() {
  // 서버 설정: 카카오 키 유무 (예전엔 Jinja 템플릿 변수였다)
  const [config, setConfig] = useState({ demo_mode: false, kakao_js_key: '' });
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [recent, setRecent] = useState(loadRecent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [user, setUser] = useState(null);  // 로그인한 이메일, 아니면 null
  const [route, setRoute] = useState(readRoute);
  const { tab, sub } = route;

  // 로그인 정보 + 계정에 저장해 둔 기본 중요도를 홈 슬라이더에 적용 (켤 때, 로그인할 때)
  async function loadMe() {
    const { data } = await api('GET', '/api/me');
    setUser(data.email ?? null);
    if (data.weights) setWeights(data.weights);
  }

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setConfig).catch(() => {});
    loadMe();

    const onHash = () => { setRoute(readRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 이미 보고 있는 화면을 다시 누르면 맨 위로 (앱들의 흔한 동작). MY 안쪽 화면에서 MY를 누르면 MY 첫 화면으로
  const go = (to) => (to === (sub ? `${tab}/${sub}` : tab)
    ? window.scrollTo({ top: 0, behavior: 'smooth' })
    : (window.location.hash = to));

  // 검색창 밖에서 검색을 시작할 때: 검색창엔 label(건물 이름 등), 분석은 address로
  const [query, setQuery] = useState(null);
  function pick(address, label = address) {
    setQuery({ text: label });
    analyze(address);
  }

  async function analyze(address) {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { ok, data } = await postJSON('/api/analyze', { address, weights });
      if (!ok) {
        setError(data.error || '알 수 없는 오류가 발생했어요.');
        return;
      }
      setRecent(saveRecent(address));
      setResult(data);
    } catch {
      setError('서버와 연결할 수 없어요. Flask 서버가 실행 중인지 확인해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <GlobalStyle />
      <Header>
        <a href="#home">살만하니</a>
        {config.demo_mode && <span>데모 데이터</span>}
      </Header>

      {/* 탭을 옮겨도 화면을 없애지 않고 숨긴다 → 검색 결과·비교 입력이 그대로 남는다 */}
      <Main>
        <Screen hidden={tab !== 'home'}>
          <SearchSection
            demoMode={config.demo_mode}
            loading={loading}
            recent={recent}
            weights={weights}
            onWeightsChange={setWeights}
            onSearch={analyze}
            onError={setError}
            query={query}
          />

          {error && <ErrorBox role="alert">{error}</ErrorBox>}

          {loading && (
            <Loading>
              <Spinner />
              <p>주변 시설을 찾는 중이에요</p>
            </Loading>
          )}

          {result && <Results data={result} kakaoKey={config.kakao_js_key} onPick={pick} />}
        </Screen>

        <Screen hidden={tab !== 'compare'}>
          <Compare firstAddress={result?.address ?? ''} weights={weights} />
        </Screen>

        <Screen hidden={tab !== 'saved'}>
          <Saved user={user} active={tab === 'saved'} onLogin={() => go('my')}
            onPick={(a) => { go('home'); pick(a); }} />
        </Screen>

        <Screen hidden={tab !== 'my'}>
          <Account user={user} sub={sub} active={tab === 'my'} go={go}
            onLogin={loadMe} onLogout={() => setUser(null)}
            onWeightsSaved={(w) => setWeights(w ?? DEFAULT_WEIGHTS)} />
        </Screen>
      </Main>

      <TabBar aria-label="주요 메뉴">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>
            {t.label}
          </button>
        ))}
      </TabBar>
    </>
  );
}

const Header = styled.header`
  max-width: 640px;
  margin: 0 auto;
  padding: 20px 16px 0;
  padding-top: calc(20px + env(safe-area-inset-top));  /* 노치 회피 */
  display: flex;
  align-items: baseline;
  gap: 12px;
  a { font-size: 18px; font-weight: 700; color: ${color.ink}; text-decoration: none; }
  span { font-size: 13px; color: ${color.ink2}; }
`;

const Main = styled.main`
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px calc(96px + env(safe-area-inset-bottom));  /* 하단 탭에 가리지 않게 */
`;

// 숨겨졌던(display:none) 화면이 보일 때마다 CSS 애니메이션이 처음부터 다시 돈다
const enter = keyframes`from { opacity: 0; transform: translateY(8px); }`;

const Screen = styled.div`
  animation: ${enter} 0.25s ease-out;
  @media (prefers-reduced-motion: reduce) { animation: none; }
  > * > h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  > section:first-of-type { margin-top: 0; }  /* 비교 탭은 화면 맨 위에서 시작 */
`;

const TabBar = styled.nav`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  background: ${color.paper};
  border-top: 1px solid ${color.rule};
  padding-bottom: env(safe-area-inset-bottom);  /* 아이폰 홈 막대 */
  z-index: 10;
  button {
    flex: 1;
    max-width: 160px;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font: inherit;
    font-size: 11px;
    background: none;
    border: none;
    cursor: pointer;
    color: ${color.ink2};
    -webkit-tap-highlight-color: transparent;
  }
  button[aria-current='page'] { color: ${color.ink}; font-weight: 700; }
  svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
  button[aria-current='page'] svg { stroke-width: 2.2; }
`;

const ErrorBox = styled.div`
  color: ${color.alert};
  border-left: 3px solid ${color.alert};
  padding: 4px 0 4px 12px;
  margin-bottom: 24px;
  font-size: 15px;
`;

const Loading = styled.div`
  padding: 40px 0;
  color: ${color.ink2};
  font-size: 15px;
`;
