// Domain Types — RESET Budget
// 스펙 Section 14 기준
// any 사용 금지 / strict mode

// ─── 공통 기본 타입 ────────────────────────────────────────────────────────────

export type ISODate = string;      // YYYY-MM-DD
export type ISODateTime = string;  // ISO 8601

export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=일, 1=월 ...
export type ThemeMode = 'ivory_light' | 'noir_black' | 'system';
export type BudgetGroup = 'living' | 'required' | 'excluded';
export type EntryKind = 'expense' | 'income' | 'transfer';
export type SplitMode = 'equal' | 'ratio' | 'custom_amount';
export type SharedExpenseStatus = 'open' | 'partially_settled' | 'settled';
export type SettlementTransferDirection = 'in' | 'out';
export type ResetMode = 'detailed_recovery' | 'summary_recovery' | 'restart_today';
export type AccountKind = 'checking' | 'savings' | 'investment';
export type LiabilityKind = 'loan' | 'installment' | 'rent' | 'credit_card_recurring';

// ─── 거래 (Transaction) ────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  ledgerMonth: string;           // YYYY-MM (저장 파일 기준)
  date: ISODate;
  entryKind: EntryKind;
  title: string;
  amount: number;                // 양수만 허용
  categoryId: string;
  paymentMethodId?: string;
  accountId?: string;
  memo?: string;
  tags?: string[];
  isShared: boolean;
  sharedExpenseId?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ─── 카테고리 (Category) ──────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  entryKind: 'expense' | 'income';
  budgetGroup: BudgetGroup;
  icon?: string;
  colorToken?: string;
  sortOrder: number;
}

// ─── 결제수단 (PaymentMethod) ─────────────────────────────────────────────────

export interface PaymentMethod {
  id: string;
  name: string;
  kind: 'cash' | 'bank' | 'card' | 'simple_pay';
  isActive: boolean;
  sortOrder: number;
}

// ─── 고정지출 규칙 (FixedExpenseRule) ─────────────────────────────────────────

export interface FixedExpenseRule {
  id: string;
  name: string;
  amount: number;
  dueDay: number;        // 1-28
  categoryId: string;
  isActive: boolean;
}

// ─── 예정 필수지출 (PlannedRequiredExpense) ────────────────────────────────────

export interface PlannedRequiredExpense {
  id: string;
  name: string;
  amount: number;
  dueDate: ISODate;
  categoryId: string;
  isPaid: boolean;
}

// ─── 공동지출 (SharedExpense) ─────────────────────────────────────────────────

export interface SharedExpense {
  id: string;
  transactionId: string;
  counterpartyId: string;
  paidBy: 'me' | 'counterparty';
  splitMode: SplitMode;
  myShareAmount: number;
  counterpartyShareAmount: number;
  settledInAmount: number;
  settledOutAmount: number;
  status: SharedExpenseStatus;
  note?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ─── 정산 송금 (SettlementTransfer) ──────────────────────────────────────────

export interface SettlementTransfer {
  id: string;
  sharedExpenseId: string;
  direction: SettlementTransferDirection;
  amount: number;
  transferredAt: ISODate;
  paymentMethodId?: string;
  memo?: string;
  createdAt: ISODateTime;
}

// ─── 리셋 세션 (ResetSession) ─────────────────────────────────────────────────

export interface ResetSession {
  id: string;
  blankPeriodStart: ISODate;
  blankPeriodEnd: ISODate;
  mode: ResetMode;
  summaryAmount?: number;
  summaryMemo?: string;
  recoveredTransactionIds: string[];
  completedAt?: ISODateTime;
  createdAt: ISODateTime;
}

// ─── 안전도 기준 (SafetyThreshold) ───────────────────────────────────────────

export type SafetyLevel = 'very_safe' | 'safe' | 'warning' | 'risk' | 'critical';

export interface SafetyThreshold {
  level: SafetyLevel;
  minInclusive: number;
  maxExclusive: number; // very_safe 는 9999 사용
  label: string;
}

// ─── 자산 계좌 (Account) ──────────────────────────────────────────────────────

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  institution?: string;
  balance: number;        // 사용자 수동 입력
  isActive: boolean;
  sortOrder: number;
  lastUpdatedAt: ISODateTime;
  createdAt: ISODateTime;
}

// ─── 부채/고정의무 (Liability) ────────────────────────────────────────────────

export interface Liability {
  id: string;
  name: string;
  kind: LiabilityKind;
  monthlyAmount: number;
  dueDay: number;           // 1-28
  totalBalance?: number;    // 남은 원금
  remainingMonths?: number; // 잔여 개월
  categoryId: string;
  isActive: boolean;
  autoFixedExpense: boolean; // true 면 FixedExpenseRule 자동 생성
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ─── 상대방 (Counterparty) ───────────────────────────────────────────────────

export interface Counterparty {
  id: string;
  name: string;
  isDefault: boolean;
}

// ─── 앱 설정 (AppConfig) ─────────────────────────────────────────────────────

export interface AppConfig {
  currency: 'KRW';
  monthMode: 'calendar' | 'payday';
  payday: number;               // 1-28
  weekStartDay: WeekStartDay;
  expectedNetIncomeDefault: number;
  savingsTargetDefault: number;
  includeExpectedSettlementReceivableInSafety: boolean;
  resetThresholdDays: number;
  fixedExpenses: FixedExpenseRule[];
  plannedRequiredExpenses: PlannedRequiredExpense[];
  safetyThresholds: SafetyThreshold[];
  defaultSplitMode: SplitMode;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  counterparties: Counterparty[];
  themeMode: ThemeMode;
  onboardingCompleted: boolean;
}

// ─── Drive 파일 Envelope ──────────────────────────────────────────────────────

export interface FileEnvelope<T> {
  schemaVersion: string;
  fileType: string;
  updatedAt: ISODateTime;
  revisionHint?: string;
  data: T;
}

// ─── 파생 상태 (Derived State) ────────────────────────────────────────────────

export interface SafetySummary {
  monthlyBudgetBase: number;
  livingSpentSoFar: number;
  monthlySpendableRemaining: number;
  dailyRecommendedLimit: number;
  weeklyRecommendedLimit: number;
  idealSpendableRemaining: number;
  safetyScore: number;
  safetyLevel: SafetyLevel;
  weeklyOverspendRatio: number;
}

export interface AssetSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  checkingTotal: number;
  savingsTotal: number;
  investmentTotal: number;
  lastUpdatedAt: ISODateTime;
}

export interface SharedSettlementSummary {
  outstandingReceivable: number;
  outstandingPayable: number;
  openSharedExpenseCount: number;
  settledThisMonthAmount: number;
}

export interface ResetSummary {
  resetNeeded: boolean;
  blankDays: number;
  blankPeriodStart?: ISODate;
  blankPeriodEnd?: ISODate;
}

// ─── 예산 계획 (BudgetPlan) — V1.5 신규 ──────────────────────────────────────

export interface BudgetItem {
  id: string;
  categoryId: string;
  budgetAmount: number;
  alertThreshold?: number;  // 경고 기준 % (기본 80)
}

export interface BudgetPlan {
  id: string;
  targetMonth: string;        // YYYY-MM
  totalBudgetAmount: number;
  items: BudgetItem[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ─── 정기지출/구독/할부 (RecurringItem) — V1.5 신규 ──────────────────────────

export type RecurringKind  = 'regular' | 'subscription' | 'installment';
export type RecurringCycle = 'monthly' | 'weekly' | 'yearly';

export interface RecurringItem {
  id: string;
  kind: RecurringKind;
  title: string;
  amount: number;
  categoryId: string;
  nextDueDate: ISODate;
  enabled: boolean;
  // regular 전용
  cycle?: RecurringCycle;
  dayOfMonth?: number;
  // subscription 전용
  providerName?: string;
  billingCycle?: RecurringCycle;
  firstBillingDate?: ISODate;
  // installment 전용
  totalInstallments?: number;
  remainingInstallments?: number;
  startedAt?: ISODate;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
