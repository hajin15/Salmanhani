import { useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { GlobalStyle, Spinner, color } from './styles.jsx';
import { DEFAULT_WEIGHTS, loadRecent, postJSON, saveRecent } from './lib.js';
import SearchSection from './components/SearchSection.jsx';
import Results from './components/Results.jsx';
import Compare from './components/Compare.jsx';
import Account from './components/Account.jsx';

export default function App() {
  // 서버 설정: 카카오 키 유무 (예전엔 Jinja 템플릿 변수였다)
  const [config, setConfig] = useState({ demo_mode: false, kakao_js_key: '' });
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [recent, setRecent] = useState(loadRecent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [user, setUser] = useState(null);  // 로그인한 이메일, 아니면 null

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setConfig).catch(() => {});
    fetch('/api/me').then((r) => r.json()).then((d) => setUser(d.email)).catch(() => {});
  }, []);

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
        <a href="/">살만하니</a>
        {config.demo_mode && <span>데모 데이터</span>}
        <Right><Account user={user} onUserChange={setUser} onPick={analyze} /></Right>
      </Header>

      <Main>
        <SearchSection
          demoMode={config.demo_mode}
          loading={loading}
          recent={recent}
          weights={weights}
          onWeightsChange={setWeights}
          onSearch={analyze}
          onError={setError}
        />

        {error && <ErrorBox role="alert">{error}</ErrorBox>}

        {loading && (
          <Loading>
            <Spinner />
            <p>주변 시설을 찾는 중이에요</p>
          </Loading>
        )}

        {result && (
          <>
            <Results data={result} kakaoKey={config.kakao_js_key} />
            <Compare firstAddress={result.address} weights={weights} />
          </>
        )}
      </Main>
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

const Right = styled.div`
  margin-left: auto;
  font-size: 14px;
`;

const Main = styled.main`
  max-width: 640px;
  margin: 0 auto;
  padding: 0 16px 80px;
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
