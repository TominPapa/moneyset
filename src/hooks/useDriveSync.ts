// useDriveSync — Drive 쓰기 debounce 훅
// V1.5: 1.5초 debounce로 rate limit 대응

import { useRef, useCallback } from 'react';

type AsyncFn = () => Promise<void>;

/**
 * Drive 쓰기 작업을 1.5초 debounce로 처리하는 훅.
 * 연속 저장 시 마지막 1회만 Drive에 쓰고 중간 요청은 취소한다.
 * localCache 쓰기는 즉시 실행되므로 UI 반응성은 유지된다.
 */
export function useDriveSync(delayMs = 1500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<AsyncFn | null>(null);

  const schedule = useCallback(
    (fn: AsyncFn) => {
      pendingRef.current = fn;

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        const toRun = pendingRef.current;
        pendingRef.current = null;
        if (toRun) {
          try {
            await toRun();
          } catch (err) {
            // Drive 쓰기 실패는 로그만 남기고 UI 흐름 유지
            console.warn('[useDriveSync] Drive write failed:', err);
          }
        }
      }, delayMs);
    },
    [delayMs],
  );

  /** 컴포넌트 언마운트 전 즉시 flush (pending 작업 즉시 실행) */
  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const toRun = pendingRef.current;
    pendingRef.current = null;
    if (toRun) {
      try {
        await toRun();
      } catch (err) {
        console.warn('[useDriveSync] Drive flush failed:', err);
      }
    }
  }, []);

  return { schedule, flush };
}
