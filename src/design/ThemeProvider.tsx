// ThemeProvider — RESET Budget
// tokens.ts 의 ThemeTokens 를 CSS variables 로 DOM에 주입한다.

import { useEffect } from 'react';
import { resolveTheme } from './tokens';
import type { ThemeMode } from './tokens';

interface Props {
  mode: ThemeMode;
  children: React.ReactNode;
}

export function ThemeProvider({ mode, children }: Props) {
  useEffect(() => {
    const theme = resolveTheme(mode);
    const root = document.documentElement;

    // 색상
    root.style.setProperty('--bg-base',        theme.color.bgBase);
    root.style.setProperty('--bg-card',        theme.color.bgCard);
    root.style.setProperty('--bg-card-alt',    theme.color.bgCardAlt);
    root.style.setProperty('--text-primary',   theme.color.textPrimary);
    root.style.setProperty('--text-secondary', theme.color.textSecondary);
    root.style.setProperty('--text-muted',     theme.color.textMuted);
    root.style.setProperty('--accent-1',       theme.color.accent1);
    root.style.setProperty('--accent-2',       theme.color.accent2);
    root.style.setProperty('--accent-3',       theme.color.accent3);
    root.style.setProperty('--border',         theme.color.border);
    root.style.setProperty('--divider',        theme.color.divider);
    root.style.setProperty('--expense',        theme.color.expense);
    root.style.setProperty('--income',         theme.color.income);
    root.style.setProperty('--success',        theme.color.success);
    root.style.setProperty('--error',          theme.color.error);
    root.style.setProperty('--warning-color',  theme.color.warning);
    root.style.setProperty('--info',           theme.color.info);

    // 안전도 레벨
    root.style.setProperty('--safety-very-safe', theme.color.safetyVerySafe);
    root.style.setProperty('--safety-safe',      theme.color.safetySafe);
    root.style.setProperty('--safety-warning',   theme.color.safetyWarning);
    root.style.setProperty('--safety-risk',      theme.color.safetyRisk);
    root.style.setProperty('--safety-critical',  theme.color.safetyCritical);

    // 타이포그래피
    root.style.setProperty('--font-family',    theme.typography.fontFamily);
    root.style.setProperty('--size-2xl',       theme.typography.size2xl);
    root.style.setProperty('--size-xl',        theme.typography.sizeXl);
    root.style.setProperty('--size-lg',        theme.typography.sizeLg);
    root.style.setProperty('--size-md',        theme.typography.sizeMd);
    root.style.setProperty('--size-sm',        theme.typography.sizeSm);
    root.style.setProperty('--size-xs',        theme.typography.sizeXs);

    // 스페이싱
    root.style.setProperty('--space-xs',  theme.spacing.xs);
    root.style.setProperty('--space-sm',  theme.spacing.sm);
    root.style.setProperty('--space-md',  theme.spacing.md);
    root.style.setProperty('--space-lg',  theme.spacing.lg);
    root.style.setProperty('--space-xl',  theme.spacing.xl);
    root.style.setProperty('--space-2xl', theme.spacing['2xl']);

    // 반경
    root.style.setProperty('--radius-sm',   theme.radius.sm);
    root.style.setProperty('--radius-md',   theme.radius.md);
    root.style.setProperty('--radius-lg',   theme.radius.lg);
    root.style.setProperty('--radius-full', theme.radius.full);

    // 테마 클래스
    root.setAttribute('data-theme', mode === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'noir_black' : 'ivory_light')
      : mode,
    );
  }, [mode]);

  return <>{children}</>;
}
