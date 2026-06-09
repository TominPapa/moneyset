// tiers.ts — RESET Budget 티어 정의 및 기능 게이팅
// 텀블벅 펀딩 기준: 기본 팩(basic) / 올인원 팩(allinone) / 커플·가족 팩(couple)

// 'supporter'는 이전 버전 호환용 (allinone과 동일 취급)
export type UserTier = 'free' | 'basic' | 'allinone' | 'couple' | 'supporter';

// ─── 기능 키 ─────────────────────────────────────────────────────────────────

export type Feature =
  | 'record'       // 거래 기록 (/record)
  | 'budget'       // 예산 관리 (/budget)
  | 'recurring'    // 정기지출 (/recurring)
  | 'settings_full'// 설정 > 카테고리·자산·데이터 탭
  | 'safety'       // 재무 안전도 (/safety)
  | 'stats'        // 통계 리포트 (/stats/*)
  | 'settlement'   // 공동정산 (/settlement)
  | 'reset'        // 공백 리셋 (/reset)
  | 'debt';        // 부채 관리 (/debt)

// ─── 티어 우선순위 ──────────────────────────────────────────────────────────

const TIER_RANK: Record<UserTier, number> = {
  free:      0,
  basic:     1,
  allinone:  2,
  couple:    3,
  supporter: 2, // 구 버전 호환 → allinone과 동일
};

// ─── 기능별 최소 요구 티어 ──────────────────────────────────────────────────

const FEATURE_MIN: Record<Feature, UserTier> = {
  record:        'basic',
  budget:        'basic',
  recurring:     'basic',
  settings_full: 'basic',
  safety:        'allinone',
  stats:         'allinone',
  settlement:    'allinone',
  reset:         'allinone',
  debt:          'allinone',
};

// ─── 공개 API ───────────────────────────────────────────────────────────────

/** 현재 티어에서 해당 기능을 사용할 수 있는지 확인 */
export function hasFeature(tier: UserTier, feature: Feature): boolean {
  const effectiveTier = tier === ('supporter' as UserTier) ? 'allinone' : tier;
  const currentRank = TIER_RANK[effectiveTier] ?? 0;
  const minRequiredTier = FEATURE_MIN[feature] ?? 'free';
  const minRequiredRank = TIER_RANK[minRequiredTier] ?? 0;
  return currentRank >= minRequiredRank;
}

/** 티어 한국어 라벨 */
export function tierLabel(tier: UserTier): string {
  const labels: Record<string, string> = {
    free:      '무료',
    basic:     '기본 팩',
    allinone:  '올인원 팩',
    couple:    '커플·가족 팩',
    supporter: '올인원 팩', // 구 버전 호환
  };
  return labels[tier] ?? '무료';
}

/** 티어 뱃지 색상 CSS 변수명 */
export function tierColor(tier: UserTier): string {
  if (tier === 'couple') return 'var(--gold-500, #f59e0b)';
  if (tier === 'allinone' || tier === ('supporter' as UserTier)) return 'var(--mint-500, #10b981)';
  if (tier === 'basic') return 'var(--accent-1, #6366f1)';
  return 'var(--text-muted)';
}

/**
 * 환경변수 VITE_ACCESS_CODES 를 파싱해 코드 → 티어 매핑 반환
 * 형식: JSON {"CODE-XXXX":"basic","CODE-YYYY":"allinone","CODE-ZZZZ":"couple"}
 */
/**
 * 후원 코드가 유효한 경우 해당 티어를 반환, 아니면 null
 * 프론트엔드 오프라인 폴백 검증용: 오직 대표 공용 코드(VITE_SUPPORTER_CODE)만 검증하며,
 * 개별 후원 코드는 JS 번들 보안을 위해 백엔드 API에서만 처리합니다.
 */
export function parseTierFromCode(code: string): UserTier | null {
  const normalised = code.trim().toUpperCase();

  // 1. 대표 서포터 코드 검증 (VITE_SUPPORTER_CODE)
  const envSupporterCode = (import.meta.env.VITE_SUPPORTER_CODE as string || '').trim().toUpperCase();
  if (envSupporterCode && normalised === envSupporterCode) {
    return 'allinone';
  }

  return null;
}
