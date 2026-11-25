import { useEffect, useRef } from 'react';
import styled from '@emotion/styled';
import { color } from '../styles.jsx';

const PIN_LABELS = {
  subway: '지하철', bus: '버스', convenience: '편의점', mart: '마트', restaurant: '음식점',
  cafe: '카페', hospital: '병원', pharmacy: '약국', gym: '헬스장', police: '지구대',
};

// SDK는 처음 지도를 그릴 때 한 번만 불러온다
let sdkPromise = null;
function loadSdk(appKey) {
  sdkPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    s.onload = () => window.kakao.maps.load(resolve);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export default function KakaoMap({ appKey, data }) {
  const boxRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadSdk(appKey).then(() => {
      if (cancelled) return;
      const { kakao } = window;
      boxRef.current.innerHTML = '';
      const center = new kakao.maps.LatLng(data.lat, data.lng);
      const map = new kakao.maps.Map(boxRef.current, { center, level: 4 });
      const bounds = new kakao.maps.LatLngBounds();
      bounds.extend(center);

      new kakao.maps.Marker({ map, position: center, title: data.address });

      (data.pins || []).forEach((p) => {
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
    }).catch(() => {});  // SDK 로드 실패(도메인 미등록 등) → 빈 칸으로 둔다

    return () => { cancelled = true; };
  }, [appKey, data]);

  return <Box ref={boxRef} />;
}

// 핀은 카카오 오버레이가 지도 안에 직접 붙이는 DOM이라 클래스로 꾸민다
const Box = styled.div`
  width: 100%;
  height: 360px;
  margin-top: 14px;
  border-radius: 4px;
  overflow: hidden;
  background: ${color.field};
  .map-pin {
    background: ${color.paper};
    color: ${color.ink};
    border: 1px solid ${color.ink};
    border-radius: 3px;
    padding: 2px 7px;
    font-size: 12px;
    white-space: nowrap;
  }
  .map-pin b { font-weight: 700; margin-right: 4px; }
`;
