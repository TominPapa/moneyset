// Design tokens — RESET Budget
// 기본 테마: noir_black
// 스펙 Section 16

export type ThemeMode = 'ivory_light' | 'noir_black' | 'system';

export interface ColorTokens {
  // 배경
  bgBase: string;
  bgCard: string;
  bgCardAlt: string;

  // 텍스트
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // 포인트
  accent1: string; // 메인 포인트
  accent2: string; // 보조 포인트
  accent3: string; // 3차 포인트

  // 안전도 레벨
  safetyVerySafe: string;
  safetySafe: string;
  safetyWarning: string;
  safetyRisk: string;
  safetyCritical: string;

  // 거래
  expense: string;
  income: string;

  // 경계/구분선
  border: string;
  divider: string;

  // 상태
  success: string;
  error: string;
  warning: string;
  info: string;
}

export interface TypographyTokens {
  fontFamily: string;
  // 크기 (rem)
  size2xl: string;
  sizeXl: string;
  sizeLg: string;
  sizeMd: string;
  sizeSm: string;
  sizeXs: string;
  // 굵기
  weightBold: number;
  weightMedium: number;
  weightRegular: number;
}

export interface SpacingTokens {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
}

export interface RadiusTokens {
  sm: string;
  md: string;
  lg: string;
  full: string;
}

export interface ThemeTokens {
  color: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
}

// ─── Noir Black (기본) ───────────────────────────────────────────────────────

const noirBlack: ThemeTokens = {
  color: {
    bgBase: '#0F0F0F',
    bgCard: '#1A1A1A',
    bgCardAlt: '#242424',

    textPrimary: '#F5F5F0',
    textSecondary: '#A8A8A0',
    textMuted: '#5A5A55',

    accent1: '#7DD3C0',   // 아이스 블루
    accent2: '#50C878',   // 에메랄드
    accent3: '#F5A623',   // 앰버

    safetyVerySafe: '#50C878',
    safetySafe: '#7DD3C0',
    safetyWarning: '#F5A623',
    safetyRisk: '#F07070',
    safetyCritical: '#E53935',

    expense: '#F07070',
    income: '#7DD3C0',

    border: '#2A2A2A',
    divider: '#222222',

    success: '#50C878',
    error: '#E53935',
    warning: '#F5A623',
    info: '#7DD3C0',
  },
  typography: {
    fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
    size2xl: '2rem',
    sizeXl: '1.5rem',
    sizeLg: '1.125rem',
    sizeMd: '1rem',
    sizeSm: '0.875rem',
    sizeXs: '0.75rem',
    weightBold: 700,
    weightMedium: 500,
    weightRegular: 400,
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
  },
  radius: {
    sm: '6px',
    md: '12px',
    lg: '20px',
    full: '9999px',
  },
};

// ─── Ivory Light ─────────────────────────────────────────────────────────────

const ivoryLight: ThemeTokens = {
  color: {
    bgBase: '#F8F6F1',
    bgCard: '#FFFFFF',
    bgCardAlt: '#F2EFE8',

    textPrimary: '#1A1A1A',
    textSecondary: '#5A5A55',
    textMuted: '#A8A8A0',

    accent1: '#1B3A5C',   // 딥 네이비
    accent2: '#7A9E7E',   // 세이지
    accent3: '#E07060',   // 소프트 코랄

    safetyVerySafe: '#7A9E7E',
    safetySafe: '#1B3A5C',
    safetyWarning: '#E07060',
    safetyRisk: '#C0392B',
    safetyCritical: '#922B21',

    expense: '#C0392B',
    income: '#1B3A5C',

    border: '#E0DDD6',
    divider: '#EAE7E0',

    success: '#7A9E7E',
    error: '#C0392B',
    warning: '#E07060',
    info: '#1B3A5C',
  },
  typography: noirBlack.typography,
  spacing: noirBlack.spacing,
  radius: noirBlack.radius,
};

// ─── 테마 맵 ──────────────────────────────────────────────────────────────────

export const themes: Record<Exclude<ThemeMode, 'system'>, ThemeTokens> = {
  noir_black: noirBlack,
  ivory_light: ivoryLight,
};

export const defaultTheme: ThemeMode = 'noir_black';

export function resolveTheme(mode: ThemeMode): ThemeTokens {
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? noirBlack : ivoryLight;
  }
  return themes[mode];
}
