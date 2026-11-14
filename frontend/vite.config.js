import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 중엔 Vite(5173)가 화면을, Flask(5000)가 /api를 맡는다.
// 배포는 `npm run build` → Flask가 dist/를 그대로 서빙.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:5000' },
  },
});
