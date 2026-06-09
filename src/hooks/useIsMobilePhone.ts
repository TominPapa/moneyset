import { useState, useEffect } from 'react';

/**
 * 접속한 기기의 화면 가로 폭이 600px 미만인지 실시간으로 감지하여
 * 핸드폰(Mobile Phone) 여부를 반환하는 Hook입니다.
 */
export function useIsMobilePhone(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return isMobile;
}
