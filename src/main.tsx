import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// ─── 구버전 서비스 워커 강제 해제 ────────────────────────────────────────────
// 이전 PWA 설정에서 등록된 서비스 워커가 구버전 JS를 캐싱하는 문제 방지
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    let unregistered = false;
    for (const reg of registrations) {
      reg.unregister();
      unregistered = true;
    }
    // 서비스 워커가 있었으면 새로고침해서 최신 JS 로드
    if (unregistered) window.location.reload();
  }).catch(() => {});
}

// OAuth redirect 복귀 처리: React Router보다 먼저 실행
// Google이 /#access_token=xxx 로 돌아올 때 토큰을 sessionStorage에 저장하고
// URL을 /login 으로 교체 → RouteGuard가 해시를 지워버리는 문제 방지
const _hash = window.location.hash;
if (_hash.includes('access_token')) {
  const _params = new URLSearchParams(_hash.slice(1));
  const _token = _params.get('access_token');
  if (_token) {
    sessionStorage.setItem('__oauth_token__', _token);
    window.history.replaceState(null, '', '/login');
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
