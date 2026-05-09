// Drive Adapter Interface — RESET Budget
// 스펙 Section 11, 12 기준
// 이 파일은 인터페이스 정의만 포함한다. 실제 구현은 Phase 2에서 작성한다.

import type {
  FileEnvelope,
  AppConfig,
  Transaction,
  SharedExpense,
  SettlementTransfer,
  ResetSession,
  Account,
  Liability,
  BudgetPlan,
} from '../domain/types';

// ─── Drive 파일 경로 상수 ──────────────────────────────────────────────────────

export const DRIVE_FILE_NAMES = {
  manifest: 'manifest.json',
  config: 'config.json',
  accounts: 'accounts.json',
  liabilities: 'liabilities.json',
  settlementTransfers: 'shared/settlement-transfers.json',
  resetSessions: 'resets/reset-sessions.json',
  appState: 'app_state.json',         // appDataFolder 저장
  monthTransactions: (ym: string) => `months/${ym}.transactions.json`,
  monthSharedExpenses: (ym: string) => `shared/${ym}.shared-expenses.json`,
  monthBudgetPlan: (ym: string) => `months/${ym}.budget.json`,
} as const;

// ─── Manifest ────────────────────────────────────────────────────────────────

export interface Manifest {
  schemaVersion: string;
  ledgerId: string;
  createdAt: string;
  lastUpdatedAt: string;
  activeMonths: string[];   // YYYY-MM[]
  lastOpenedMonth: string;  // YYYY-MM
  rootFolderId: string;
}

// ─── App State (appDataFolder) ────────────────────────────────────────────────

export interface AppState {
  currentLedgerRootFolderId: string;
  onboardingCompleted: boolean;
  lastOpenedRoute: string;
  localCacheVersion: number;
  lastSyncAt: string;
  installId: string;
}

// ─── 충돌 감지 결과 ───────────────────────────────────────────────────────────

export type ConflictResolution = 'use_drive' | 'use_local';

export interface ConflictInfo {
  fileType: string;
  driveUpdatedAt: string;
  localUpdatedAt: string;
}

// ─── Drive Adapter 인터페이스 ─────────────────────────────────────────────────

export interface DriveAdapter {
  // 인증
  isAuthenticated(): boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;

  // 장부 관리
  createLedger(name: string): Promise<string>; // rootFolderId 반환
  findExistingLedger(): Promise<string | null>; // rootFolderId or null
  openLedger(rootFolderId: string): Promise<Manifest>;
  /** 로그인 시 폴더 내 파일 ID를 일괄 캐싱 (findFile API 호출 횟수 최소화) */
  warmCache(ym: string): Promise<void>;

  // Manifest
  readManifest(): Promise<Manifest>;
  writeManifest(manifest: Manifest): Promise<void>;

  // AppConfig
  readConfig(): Promise<FileEnvelope<AppConfig>>;
  writeConfig(config: FileEnvelope<AppConfig>): Promise<void>;

  // 자산/부채
  readAccounts(): Promise<FileEnvelope<Account[]>>;
  writeAccounts(data: FileEnvelope<Account[]>): Promise<void>;
  readLiabilities(): Promise<FileEnvelope<Liability[]>>;
  writeLiabilities(data: FileEnvelope<Liability[]>): Promise<void>;

  // 거래 (월별)
  readTransactions(ym: string): Promise<FileEnvelope<Transaction[]>>;
  writeTransactions(ym: string, data: FileEnvelope<Transaction[]>): Promise<void>;

  // 공동지출 (월별)
  readSharedExpenses(ym: string): Promise<FileEnvelope<SharedExpense[]>>;
  writeSharedExpenses(ym: string, data: FileEnvelope<SharedExpense[]>): Promise<void>;

  // 정산 송금
  readSettlementTransfers(): Promise<FileEnvelope<SettlementTransfer[]>>;
  writeSettlementTransfers(data: FileEnvelope<SettlementTransfer[]>): Promise<void>;

  // 리셋 세션
  readResetSessions(): Promise<FileEnvelope<ResetSession[]>>;
  writeResetSessions(data: FileEnvelope<ResetSession[]>): Promise<void>;

  // 예산 계획 (월별)
  readBudgetPlan(ym: string): Promise<FileEnvelope<BudgetPlan | null>>;
  writeBudgetPlan(ym: string, data: FileEnvelope<BudgetPlan>): Promise<void>;

  // AppState (appDataFolder)
  readAppState(): Promise<AppState | null>;
  writeAppState(state: AppState): Promise<void>;
}

// ─── 충돌 감지 헬퍼 ──────────────────────────────────────────────────────────

export function detectConflict(
  driveEnvelope: FileEnvelope<unknown>,
  localEnvelope: FileEnvelope<unknown>,
): ConflictInfo | null {
  if (
    driveEnvelope.updatedAt !== localEnvelope.updatedAt ||
    driveEnvelope.revisionHint !== localEnvelope.revisionHint
  ) {
    return {
      fileType: driveEnvelope.fileType,
      driveUpdatedAt: driveEnvelope.updatedAt,
      localUpdatedAt: localEnvelope.updatedAt,
    };
  }
  return null;
}
