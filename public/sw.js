// Kill-switch service worker
// 이전 PWA 버전에서 등록된 서비스 워커를 자동 해제하기 위한 파일
// 설치 즉시 활성화 → 스스로 unregister → 모든 탭 새로고침

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => {
      return self.clients.matchAll({ type: 'window' });
    }).then((clients) => {
      clients.forEach((c) => c.navigate(c.url));
    })
  );
});
