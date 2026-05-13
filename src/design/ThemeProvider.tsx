// ThemeProvider — RESET Budget
// data-theme 어트리뷰트를 html 요소에 세팅한다.
// 실제 토큰 값은 global.css의 [data-theme="..."] 셀렉터가 담당한다.

import { useEffect } from 'react';
import type { ThemeMode } from './tokens';

interface Props {
  mode: ThemeMode;
  children: React.ReactNode;
}

function resolveDataTheme(mode: ThemeMode): 'noir_black' | 'ivory_light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'noir_black'
      : 'ivory_light';
  }
  return mode;
}

export function ThemeProvider({ mode, children }: Props) {
  useEffect(() => {
    const root = document.documentElement;
    const resolved = resolveDataTheme(mode);
    root.setAttribute('data-theme', resolved);

    // system 모드: OS 설정 변경 시 실시간 반영
    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        root.setAttribute('data-theme', resolveDataTheme('system'));
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [mode]);

  return <>{children}</>;
}
