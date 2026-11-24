/* 살만하니 — 흰 종이, 검은 글씨, 포인트는 도로명주소판 파랑 하나 */
import { Global, css, keyframes } from '@emotion/react';
import styled from '@emotion/styled';

export const color = {
  paper: '#FFFFFF',
  ink:   '#000000',
  ink2:  '#5C5C5C',  // 보조 글씨
  rule:  '#E2E2E2',  // 구분선·트랙
  field: '#F4F4F4',  // 입력창 바탕
  plate: '#1F4E9C',  // 도로명주소판 파랑 — 유일한 포인트 색
  alert: '#C4202F',  // 에러에만
};

export const mobile = '@media (max-width: 480px)';

export function GlobalStyle() {
  return (
    <Global
      styles={css`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root { color-scheme: light; }
        body {
          font-family: 'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', sans-serif;
          background: ${color.paper};
          color: ${color.ink};
          line-height: 1.6;
          min-height: 100vh;
          -webkit-text-size-adjust: 100%;  /* 가로 전환 시 글자 확대 방지 */
          word-break: keep-all;            /* 한국어는 어절 단위로 줄바꿈 */
        }
        :focus-visible { outline: 2px solid ${color.plate}; outline-offset: 2px; }
        input[type='range'] { width: 100%; accent-color: ${color.plate}; }
      `}
    />
  );
}

// 16px 미만이면 iOS가 확대해 버린다
const field = css`
  font: inherit;
  font-size: 16px;
  color: ${color.ink};
  background: ${color.field};
  border: 1px solid transparent;
  border-radius: 4px;
  &::placeholder { color: #8a8a8a; }
  &:focus { outline: none; background: ${color.paper}; border-color: ${color.ink}; }
`;

export const TextInput = styled.input`
  ${field};
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
`;

export const NumberInput = styled.input`
  ${field};
  width: 6.5em;
  padding: 7px 10px;
  text-align: right;
`;

// secondary는 DOM으로 넘기지 않는다 (React 경고 방지)
export const Button = styled('button', { shouldForwardProp: (p) => p !== 'secondary' })`
  font: inherit;
  font-size: 15px;
  font-weight: 500;
  border-radius: 4px;
  padding: 12px 18px;
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid ${color.ink};
  background: ${(p) => (p.secondary ? color.paper : color.ink)};
  color: ${(p) => (p.secondary ? color.ink : color.paper)};
  &:disabled { opacity: 0.4; cursor: default; }
`;

// 밑줄만 있는 조용한 텍스트 버튼
export const LinkButton = styled.button`
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
`;

export const Block = styled.section`
  margin-top: 56px;
  h2 {
    font-size: 18px;
    font-weight: 700;
    padding-bottom: 10px;
    border-bottom: 2px solid ${color.ink};
  }
`;

export const Hint = styled.p`
  margin-top: 10px;
  font-size: 13px;
  color: ${color.ink2};
`;

export const Small = styled.p`
  font-size: 13px;
  color: ${color.ink2};
`;

export const Err = styled.p`
  color: ${color.alert};
  font-size: 14px;
`;

const spin = keyframes`to { transform: rotate(360deg); }`;

export const Spinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid ${color.rule};
  border-top-color: ${color.ink};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
  margin-bottom: 12px;
  @media (prefers-reduced-motion: reduce) { animation-duration: 2.4s; }
`;
