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
//
// Silent Re-auth (iframe): window !== window.top 이면 부모 창으로 토큰 전달만 하고 앱 마운트 생략
const _hash = window.location.hash;
let _isSilentReauthFrame = false;

if (_hash.includes('access_token') || _hash.includes('error=')) {
  const _params = new URLSearchParams(_hash.slice(1));

  if (window !== window.top) {
    // ── Silent Re-auth iframe: 토큰 또는 오류를 부모 창으로 전달 ──────────────
    _isSilentReauthFrame = true;
    try {
      if (_hash.includes('access_token')) {
        const _token = _params.get('access_token');
        if (_token) {
          window.parent.postMessage(
            { type: 'oauth_silent_token', token: _token },
            window.location.origin,
          );
        }
      } else {
        const _error = _params.get('error') ?? 'unknown';
        window.parent.postMessage(
          { type: 'oauth_silent_error', error: _error },
          window.location.origin,
        );
      }
    } catch {
      // parent origin 접근 불가 → 무시
    }
  } else if (_hash.includes('access_token')) {
    // ── 일반 OAuth 리디렉트 처리 ─────────────────────────────────────────────
    const _token = _params.get('access_token');
    if (_token) {
      sessionStorage.setItem('__oauth_token__', _token);
      window.history.replaceState(null, '', '/login');
    }
  }
}

// Silent Re-auth iframe 내에서는 React 앱을 마운트하지 않음
if (!_isSilentReauthFrame) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
