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

export default function KakaoMap({ appKey, data, homes }) {
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

      // 검색한 집: 기본 마커는 시설 핀들 사이에 묻혀서, 채운 라벨 + 반경 원으로 맨 위에 띄운다
      new kakao.maps.Marker({ map, position: center, title: data.address, zIndex: 10 });
      const here = document.createElement('div');
      here.className = 'map-here';
      here.textContent = '검색한 집';
      new kakao.maps.CustomOverlay({ map, position: center, content: here, yAnchor: 2.6, zIndex: 10 });
      new kakao.maps.Circle({
        map, center, radius: 60,
        strokeWeight: 2, strokeColor: color.plate, strokeOpacity: 0.9,
        fillColor: color.plate, fillOpacity: 0.15,
      });

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

      // 추천 건물: 점수를 크게, 파란 테두리로 시설 핀과 구분
      (homes || []).forEach((h) => {
        const pos = new kakao.maps.LatLng(h.lat, h.lng);
        bounds.extend(pos);
        const el = document.createElement('div');
        el.className = 'map-pin map-home';
        const tag = document.createElement('b');
        tag.textContent = `${h.total}점`;
        el.append(tag, h.name);
        new kakao.maps.CustomOverlay({ map, position: pos, content: el, yAnchor: 1.2 });
      });

      map.setBounds(bounds);
    }).catch(() => {});  // SDK 로드 실패(도메인 미등록 등) → 빈 칸으로 둔다

    return () => { cancelled = true; };
  }, [appKey, data, homes]);

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
  .map-here {
    position: relative;
    background: ${color.plate};
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 4px;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }
  .map-here::after {  /* 아래쪽 꼬리: 마커를 가리킨다 */
    content: '';
    position: absolute;
    left: 50%;
    bottom: -6px;
    margin-left: -6px;
    border: 6px solid transparent;
    border-bottom: 0;
    border-top-color: ${color.plate};
  }
  .map-home { border: 2px solid ${color.plate}; color: ${color.plate}; font-weight: 700; }
`;
