const CACHE_NAME = 'kctech-v3';
// 오프라인에서도 동작할 로컬 파일들
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
// 설치: 로컬 파일 캐싱
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(LOCAL_ASSETS))
  );
  self.skipWaiting();
});
// 활성화: 이전 캐시 삭제
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
// 요청 처리 전략:
//   - GET 외엔 무시
//   - index.html → Network First (항상 최신 버전)
//   - 나머지 로컬 파일 → Cache First (오프라인 우선)
//   - data.json (GitHub raw) → Network First, 쿼리스트링 무시 캐싱
//   - 기타 외부 CDN (폰트 등) → Network First with Cache Fallback
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  const isDataJson = url.hostname === 'raw.githubusercontent.com';
  const isIndexHtml = url.pathname === '/' || url.pathname.endsWith('index.html');
 
  if (isLocal && isIndexHtml) {
    // index.html: Network First → 항상 최신 파일 사용
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
  } else if (isLocal) {
    // 나머지 로컬 파일: Cache First (오프라인 우선)
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 503 });
        });
      })
    );
  } else if (isDataJson) {
    // data.json: Network First + 쿼리스트링 무시 캐싱
    const cleanReq = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(cleanReq, clone));
          }
          return res;
        })
        .catch(() => caches.match(cleanReq))
    );
  } else {
    // 기타 외부 CDN (폰트 등): Network First
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
