import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

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
