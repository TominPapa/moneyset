// seedData.ts — RESET Budget 개발용 시드 데이터
// SettingsPage > 데이터 탭에서 "시드 데이터 삽입" 버튼으로 호출

import type {
  Transaction,
  AppConfig,
  Account,
  Liability,
  SharedExpense,
  RecurringItem,
  BudgetPlan,
  FixedExpenseRule,
  Counterparty,
} from '../domain/types';
import { localCache } from '../storage/localCacheImpl';
import { saveRecurringItems, saveBudgetPlan } from '../storage/localPlanStore';
import { defaultCategories, defaultPaymentMethods, defaultSafetyThresholds } from '../domain/fixtures';

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function uuid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function isoNow() { return new Date().toISOString(); }
function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function ym(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function tx(
  ledgerMonth: string,
  date: string,
  entryKind: 'expense' | 'income',
  title: string,
  amount: number,
  categoryId: string,
  opts: Partial<Transaction> = {},
): Transaction {
  const now = isoNow();
  return {
    id: uuid('tx'),
    ledgerMonth,
    date,
    entryKind,
    title,
    amount,
    categoryId,
    paymentMethodId: entryKind === 'expense' ? 'pm_credit' : undefined,
    isShared: false,
    createdAt: now,
    updatedAt: now,
    ...opts,
  };
}

// ─── 현재 연월 기준으로 시드 생성 ─────────────────────────────────────────────

export async function insertSeedData(): Promise<void> {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1; // 1-based

  // 이전 달 계산
  function prevMonth(offset: number): { y: number; m: number } {
    let m = curM - offset;
    let y = curY;
    while (m <= 0) { m += 12; y -= 1; }
    return { y, m };
  }

  const pm1 = prevMonth(1); // 1개월 전
  const pm2 = prevMonth(2); // 2개월 전
  const pm3 = prevMonth(3); // 3개월 전

  // ─── AppConfig 업데이트 ────────────────────────────────────────────────────

  const counterparty: Counterparty = { id: 'cp_seed_1', name: '파트너', isDefault: true };

  const fixedExpenses: FixedExpenseRule[] = [
    { id: 'fe_1', name: '월세',   amount: 550_000,  dueDay: 1,  categoryId: 'cat_rent',        isActive: true },
    { id: 'fe_2', name: '통신비', amount: 69_000,   dueDay: 15, categoryId: 'cat_telecom',     isActive: true },
    { id: 'fe_3', name: '보험료', amount: 120_000,  dueDay: 20, categoryId: 'cat_insurance',   isActive: true },
    { id: 'fe_4', name: '대출상환', amount: 250_000, dueDay: 5, categoryId: 'cat_loan',        isActive: true },
    { id: 'fe_5', name: '공과금', amount: 45_000,   dueDay: 25, categoryId: 'cat_utility',     isActive: true },
  ];

  const config: AppConfig = {
    currency: 'KRW',
    monthMode: 'calendar',
    payday: 25,
    weekStartDay: 1,
    expectedNetIncomeDefault: 3_200_000,
    savingsTargetDefault: 400_000,
    includeExpectedSettlementReceivableInSafety: false,
    resetThresholdDays: 4,
    fixedExpenses,
    plannedRequiredExpenses: [],
    safetyThresholds: defaultSafetyThresholds,
    defaultSplitMode: 'equal',
    categories: defaultCategories,
    paymentMethods: defaultPaymentMethods,
    counterparties: [counterparty],
    themeMode: 'noir_black',
    onboardingCompleted: true,
  };
  await localCache.setConfig(config);

  // ─── 자산 / 부채 ──────────────────────────────────────────────────────────

  const accounts: Account[] = [
    {
      id: 'acc_seed_1',
      name: '카카오뱅크 입출금',
      kind: 'checking',
      institution: '카카오뱅크',
      balance: 2_145_000,
      isActive: true,
      sortOrder: 1,
      lastUpdatedAt: isoNow(),
      createdAt: isoNow(),
    },
    {
      id: 'acc_seed_2',
      name: 'KB국민 적금',
      kind: 'savings',
      institution: 'KB국민은행',
      balance: 8_500_000,
      isActive: true,
      sortOrder: 2,
      lastUpdatedAt: isoNow(),
      createdAt: isoNow(),
    },
    {
      id: 'acc_seed_3',
      name: '삼성증권 투자',
      kind: 'investment',
      institution: '삼성증권',
      balance: 5_230_000,
      isActive: true,
      sortOrder: 3,
      lastUpdatedAt: isoNow(),
      createdAt: isoNow(),
    },
  ];

  const liabilities: Liability[] = [
    {
      id: 'liab_seed_1',
      name: '전세보증금 대출',
      kind: 'loan',
      monthlyAmount: 250_000,
      dueDay: 5,
      categoryId: 'cat_loan',
      totalBalance: 18_000_000,
      isActive: true,
      autoFixedExpense: true,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    {
      id: 'liab_seed_2',
      name: '신용카드 할부 (노트북)',
      kind: 'installment',
      monthlyAmount: 95_000,
      dueDay: 14,
      categoryId: 'cat_card_bill',
      remainingMonths: 8,
      isActive: true,
      autoFixedExpense: false,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
  ];

  await localCache.setAccounts(accounts);
  await localCache.setLiabilities(liabilities);

  // ─── 거래 내역 생성 헬퍼 ──────────────────────────────────────────────────

  async function insertMonthTransactions(y: number, m: number, opts: {
    incomeScale?: number;
    expenseScale?: number;
    maxDay?: number; // 이 날짜 이후 거래는 삽입 안 함 (현재 달 미래 날짜 제외용)
  } = {}) {
    const lm = ym(y, m);
    const scale = opts.expenseScale ?? 1;
    const iScale = opts.incomeScale ?? 1;
    const lastDay = new Date(y, m, 0).getDate();
    const maxDay = opts.maxDay ?? lastDay;
    const pad = (d: number) => isoDate(y, m, Math.min(d, lastDay));

    const txList: Transaction[] = [
      // 수입
      tx(lm, pad(10), 'income', '월급', Math.round(3_200_000 * iScale), 'cat_salary',
         { paymentMethodId: 'pm_check', memo: '세후 실수령액' }),
      tx(lm, pad(15), 'income', '부업 수입', Math.round(250_000 * iScale), 'cat_income_etc',
         { paymentMethodId: 'pm_check' }),

      // 고정지출
      tx(lm, pad(1),  'expense', '월세',         Math.round(550_000 * scale), 'cat_rent',         { paymentMethodId: 'pm_check' }),
      tx(lm, pad(5),  'expense', '대출 상환',     Math.round(250_000 * scale), 'cat_loan',         { paymentMethodId: 'pm_check' }),
      tx(lm, pad(14), 'expense', '노트북 할부',   Math.round(95_000 * scale),  'cat_card_bill',    { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(15), 'expense', '통신비',        Math.round(69_000 * scale),  'cat_telecom',      { paymentMethodId: 'pm_check' }),
      tx(lm, pad(20), 'expense', '보험료',        Math.round(120_000 * scale), 'cat_insurance',    { paymentMethodId: 'pm_check' }),
      tx(lm, pad(25), 'expense', '공과금',        Math.round(45_000 * scale),  'cat_utility',      { paymentMethodId: 'pm_check' }),

      // 식비
      tx(lm, pad(2),  'expense', '점심 - 편의점',   8_500 * scale | 0,  'cat_food', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(3),  'expense', '저녁 - 치킨',     28_000 * scale | 0, 'cat_food', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(4),  'expense', '마트 장보기',      67_300 * scale | 0, 'cat_food', { paymentMethodId: 'pm_credit', memo: '이마트' }),
      tx(lm, pad(6),  'expense', '점심 - 국밥',     10_000 * scale | 0, 'cat_food', { paymentMethodId: 'pm_cash' }),
      tx(lm, pad(7),  'expense', '저녁 - 삼겹살',   35_000 * scale | 0, 'cat_food', { paymentMethodId: 'pm_credit', memo: '친구 모임' }),
      tx(lm, pad(9),  'expense', '점심 - 편의점',    8_200 * scale | 0, 'cat_food', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(10), 'expense', '배달 - 피자',      26_000 * scale | 0, 'cat_food', { paymentMethodId: 'pm_simple', memo: '도미노' }),
      tx(lm, pad(12), 'expense', '마트 장보기',       45_800 * scale | 0, 'cat_food', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(13), 'expense', '점심 - 김밥천국',   7_500 * scale | 0, 'cat_food', { paymentMethodId: 'pm_cash' }),
      tx(lm, pad(16), 'expense', '저녁 - 파스타',   32_000 * scale | 0, 'cat_food', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(18), 'expense', '배달 - 중국집',    22_000 * scale | 0, 'cat_food', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(19), 'expense', '점심 - 도시락',     9_800 * scale | 0, 'cat_food', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(17), 'expense', '저녁 - 초밥',     48_000 * scale | 0, 'cat_food', { paymentMethodId: 'pm_credit', memo: '기념일' }),
      tx(lm, pad(19), 'expense', '마트 장보기',       52_100 * scale | 0, 'cat_food', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(21), 'expense', '점심 - 편의점',    8_900 * scale | 0, 'cat_food', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(26), 'expense', '배달 - 버거',     18_500 * scale | 0, 'cat_food', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(28), 'expense', '마트 장보기',       38_700 * scale | 0, 'cat_food', { paymentMethodId: 'pm_credit' }),

      // 카페
      tx(lm, pad(2),  'expense', '스타벅스',  6_500 * scale | 0, 'cat_cafe', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(5),  'expense', '할리스',    5_500 * scale | 0, 'cat_cafe', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(8),  'expense', '메가커피',  2_500 * scale | 0, 'cat_cafe', { paymentMethodId: 'pm_cash' }),
      tx(lm, pad(11), 'expense', '스타벅스',  7_000 * scale | 0, 'cat_cafe', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(14), 'expense', '투썸플레이스', 6_800 * scale | 0, 'cat_cafe', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(17), 'expense', '이디야',    3_800 * scale | 0, 'cat_cafe', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(20), 'expense', '스타벅스',  6_500 * scale | 0, 'cat_cafe', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(23), 'expense', '메가커피',  2_500 * scale | 0, 'cat_cafe', { paymentMethodId: 'pm_cash' }),
      tx(lm, pad(27), 'expense', '할리스',    5_500 * scale | 0, 'cat_cafe', { paymentMethodId: 'pm_simple' }),

      // 교통
      tx(lm, pad(2),  'expense', '지하철 충전',  20_000 * scale | 0, 'cat_transport', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(8),  'expense', '택시',          13_500 * scale | 0, 'cat_transport', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(15), 'expense', '지하철 충전',   20_000 * scale | 0, 'cat_transport', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(12), 'expense', 'KTX 서울-부산', 59_800 * scale | 0, 'cat_transport', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(21), 'expense', '택시',           9_800 * scale | 0, 'cat_transport', { paymentMethodId: 'pm_simple' }),

      // 구독
      tx(lm, pad(3),  'expense', '넷플릭스',   17_000 * scale | 0, 'cat_subscription', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(3),  'expense', '유튜브 프리미엄', 14_900 * scale | 0, 'cat_subscription', { paymentMethodId: 'pm_simple' }),
      tx(lm, pad(10), 'expense', '노션 Pro',   12_000 * scale | 0, 'cat_subscription', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(15), 'expense', '애플 뮤직',  10_900 * scale | 0, 'cat_subscription', { paymentMethodId: 'pm_simple' }),

      // 쇼핑
      tx(lm, pad(4),  'expense', '쿠팡 - 생필품',  43_500 * scale | 0, 'cat_shopping', { paymentMethodId: 'pm_credit', memo: '화장지, 세제 등' }),
      tx(lm, pad(9),  'expense', '무신사 - 옷',    89_000 * scale | 0, 'cat_shopping', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(16), 'expense', '올리브영',        27_800 * scale | 0, 'cat_shopping', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(18), 'expense', '쿠팡 - 가전',    125_000 * scale | 0, 'cat_shopping', { paymentMethodId: 'pm_credit', memo: '청소기 필터' }),

      // 여가
      tx(lm, pad(6),  'expense', '영화 - CGV',    14_000 * scale | 0, 'cat_leisure', { paymentMethodId: 'pm_credit' }),
      tx(lm, pad(13), 'expense', '헬스장 월회비', 75_000 * scale | 0, 'cat_leisure', { paymentMethodId: 'pm_check' }),
      tx(lm, pad(20), 'expense', '보드게임 카페', 22_000 * scale | 0, 'cat_leisure', { paymentMethodId: 'pm_cash' }),
      tx(lm, pad(27), 'expense', '온라인 게임 아이템', 15_000 * scale | 0, 'cat_leisure', { paymentMethodId: 'pm_simple' }),

      // 기타
      tx(lm, pad(11), 'expense', '약국',           12_500 * scale | 0, 'cat_living_etc', { paymentMethodId: 'pm_cash' }),
      tx(lm, pad(18), 'expense', '세탁소',           8_000 * scale | 0, 'cat_living_etc', { paymentMethodId: 'pm_cash' }),
      tx(lm, pad(25), 'expense', '이발소',          14_000 * scale | 0, 'cat_living_etc', { paymentMethodId: 'pm_cash' }),
    ];

    // maxDay 초과 거래 제외 (현재 달의 미래 날짜 거래 방지)
    const filtered = txList.filter((t) => {
      const day = Number(t.date.split('-')[2]);
      return day <= maxDay;
    });

    for (const t of filtered) {
      await localCache.upsertTransaction(lm, t);
    }

    return filtered;
  }

  // ─── 이번 달 (약간 더 현실적으로) ────────────────────────────────────────────

  await insertMonthTransactions(curY, curM, { incomeScale: 1, maxDay: now.getDate() });

  // 이번 달 공동지출 추가
  const sharedTxId = uuid('tx');
  const sharedTx: Transaction = {
    id: sharedTxId,
    ledgerMonth: ym(curY, curM),
    date: isoDate(curY, curM, 8),
    entryKind: 'expense',
    title: '저녁 식사 - 이자카야',
    amount: 86_000,
    categoryId: 'cat_food',
    paymentMethodId: 'pm_credit',
    isShared: true,
    sharedExpenseId: 'se_seed_1',
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  await localCache.upsertTransaction(ym(curY, curM), sharedTx);

  const sharedExp: SharedExpense = {
    id: 'se_seed_1',
    transactionId: sharedTxId,
    counterpartyId: 'cp_seed_1',
    paidBy: 'me',
    splitMode: 'equal',
    myShareAmount: 43_000,
    counterpartyShareAmount: 43_000,
    settledInAmount: 0,
    settledOutAmount: 0,
    status: 'open',
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  await localCache.upsertSharedExpense(ym(curY, curM), sharedExp);

  // 정산된 공동지출
  const sharedTxId2 = uuid('tx');
  const sharedTx2: Transaction = {
    id: sharedTxId2,
    ledgerMonth: ym(curY, curM),
    date: isoDate(curY, curM, 3),
    entryKind: 'expense',
    title: '영화 + 팝콘',
    amount: 42_000,
    categoryId: 'cat_leisure',
    paymentMethodId: 'pm_credit',
    isShared: true,
    sharedExpenseId: 'se_seed_2',
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  await localCache.upsertTransaction(ym(curY, curM), sharedTx2);

  const sharedExp2: SharedExpense = {
    id: 'se_seed_2',
    transactionId: sharedTxId2,
    counterpartyId: 'cp_seed_1',
    paidBy: 'counterparty',
    splitMode: 'equal',
    myShareAmount: 21_000,
    counterpartyShareAmount: 21_000,
    settledInAmount: 0,
    settledOutAmount: 21_000,
    status: 'settled',
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  await localCache.upsertSharedExpense(ym(curY, curM), sharedExp2);

  // ─── 이전 달 데이터 ───────────────────────────────────────────────────────

  await insertMonthTransactions(pm1.y, pm1.m, { expenseScale: 0.80, incomeScale: 1 });
  await insertMonthTransactions(pm2.y, pm2.m, { expenseScale: 0.90, incomeScale: 1 });
  await insertMonthTransactions(pm3.y, pm3.m, { expenseScale: 0.74, incomeScale: 1 });

  // ─── 예산 계획 ────────────────────────────────────────────────────────────
  // 현재 달(4월 20일 기준) 예상 소비율:
  //   식비   ~434k / 500k ≈ 87% ↑ 주의
  //   카페    ~39k /  80k ≈ 49% ✓
  //   교통   ~113k / 120k ≈ 94% ↑ 위험
  //   쇼핑   ~285k / 260k ≈ 110% ● 초과!
  //   여가   ~153k / 160k ≈ 96% ↑ 위험
  //   기타    ~21k /  80k ≈ 26% ✓

  function makeBudgetItems() {
    return [
      { id: uuid('bi'), categoryId: 'cat_food',      budgetAmount: 500_000 },
      { id: uuid('bi'), categoryId: 'cat_cafe',       budgetAmount: 80_000  },
      { id: uuid('bi'), categoryId: 'cat_transport',  budgetAmount: 120_000 },
      { id: uuid('bi'), categoryId: 'cat_shopping',   budgetAmount: 260_000 },
      { id: uuid('bi'), categoryId: 'cat_leisure',    budgetAmount: 160_000 },
      { id: uuid('bi'), categoryId: 'cat_living_etc', budgetAmount: 80_000  },
    ];
  }

  const budgetPlan: BudgetPlan = {
    id: 'bp_seed_1',
    targetMonth: ym(curY, curM),
    totalBudgetAmount: 1_200_000,
    items: makeBudgetItems(),
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  saveBudgetPlan(budgetPlan);

  // 이전 달 예산 계획 추가 (네비게이션 시 미설정 없도록)
  // pm1(scale 0.80): 식비 74%, 교통 82%, 쇼핑 88% — 전월 대비 양호
  // pm2(scale 0.90): 식비 85%, 교통 93%, 쇼핑 99% — 빡빡했던 달
  // pm3(scale 0.74): 전반적으로 안정적
  saveBudgetPlan({
    id: 'bp_seed_pm1',
    targetMonth: ym(pm1.y, pm1.m),
    totalBudgetAmount: 1_200_000,
    items: makeBudgetItems(),
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });
  saveBudgetPlan({
    id: 'bp_seed_pm2',
    targetMonth: ym(pm2.y, pm2.m),
    totalBudgetAmount: 1_200_000,
    items: makeBudgetItems(),
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });
  saveBudgetPlan({
    id: 'bp_seed_pm3',
    targetMonth: ym(pm3.y, pm3.m),
    totalBudgetAmount: 1_200_000,
    items: makeBudgetItems(),
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });

  // ─── 정기 지출 / 구독 / 할부 ─────────────────────────────────────────────

  const today = new Date();
  const todayStr = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const nextMonth1 = isoDate(
    today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear(),
    today.getMonth() === 11 ? 1 : today.getMonth() + 2,
    1,
  );
  const nextMonth15 = isoDate(
    today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear(),
    today.getMonth() === 11 ? 1 : today.getMonth() + 2,
    15,
  );

  const recurringItems: RecurringItem[] = [
    // 정기지출
    {
      id: 'ri_seed_1',
      kind: 'regular',
      title: '월세',
      amount: 550_000,
      categoryId: 'cat_rent',
      nextDueDate: isoDate(today.getFullYear(), today.getMonth() + 1 > 12 ? 1 : today.getMonth() + 1, 1) > todayStr
        ? isoDate(today.getFullYear(), today.getMonth() + 1, 1)
        : nextMonth1,
      enabled: true,
      cycle: 'monthly',
      dayOfMonth: 1,
      providerName: '',
      billingCycle: 'monthly',
      firstBillingDate: '2024-01-01',
      totalInstallments: 12,
      remainingInstallments: 12,
      startedAt: '2024-01-01',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    {
      id: 'ri_seed_2',
      kind: 'regular',
      title: '헬스장 월회비',
      amount: 75_000,
      categoryId: 'cat_leisure',
      nextDueDate: nextMonth1,
      enabled: true,
      cycle: 'monthly',
      dayOfMonth: 1,
      providerName: '',
      billingCycle: 'monthly',
      firstBillingDate: '2024-01-01',
      totalInstallments: 12,
      remainingInstallments: 12,
      startedAt: '2024-01-01',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    {
      id: 'ri_seed_3',
      kind: 'regular',
      title: '보험료',
      amount: 120_000,
      categoryId: 'cat_insurance',
      nextDueDate: isoDate(today.getFullYear(), today.getMonth() + 1, 20) > todayStr
        ? isoDate(today.getFullYear(), today.getMonth() + 1, 20)
        : isoDate(today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear(),
                  today.getMonth() === 11 ? 1 : today.getMonth() + 2, 20),
      enabled: true,
      cycle: 'monthly',
      dayOfMonth: 20,
      providerName: '',
      billingCycle: 'monthly',
      firstBillingDate: '2023-06-20',
      totalInstallments: 12,
      remainingInstallments: 12,
      startedAt: '2023-06-20',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },

    // 구독
    {
      id: 'ri_seed_4',
      kind: 'subscription',
      title: '넷플릭스',
      amount: 17_000,
      categoryId: 'cat_subscription',
      nextDueDate: nextMonth1,
      enabled: true,
      cycle: 'monthly',
      dayOfMonth: 3,
      providerName: 'Netflix',
      billingCycle: 'monthly',
      firstBillingDate: '2022-03-03',
      totalInstallments: 12,
      remainingInstallments: 12,
      startedAt: '2022-03-03',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    {
      id: 'ri_seed_5',
      kind: 'subscription',
      title: '유튜브 프리미엄',
      amount: 14_900,
      categoryId: 'cat_subscription',
      nextDueDate: nextMonth1,
      enabled: true,
      cycle: 'monthly',
      dayOfMonth: 3,
      providerName: 'YouTube',
      billingCycle: 'monthly',
      firstBillingDate: '2021-05-03',
      totalInstallments: 12,
      remainingInstallments: 12,
      startedAt: '2021-05-03',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    {
      id: 'ri_seed_6',
      kind: 'subscription',
      title: '애플 뮤직',
      amount: 10_900,
      categoryId: 'cat_subscription',
      nextDueDate: nextMonth15,
      enabled: true,
      cycle: 'monthly',
      dayOfMonth: 15,
      providerName: 'Apple Music',
      billingCycle: 'monthly',
      firstBillingDate: '2023-11-15',
      totalInstallments: 12,
      remainingInstallments: 12,
      startedAt: '2023-11-15',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    {
      id: 'ri_seed_7',
      kind: 'subscription',
      title: '노션 Pro',
      amount: 12_000,
      categoryId: 'cat_subscription',
      nextDueDate: nextMonth1,
      enabled: false, // 비활성 예시
      cycle: 'monthly',
      dayOfMonth: 10,
      providerName: 'Notion',
      billingCycle: 'monthly',
      firstBillingDate: '2024-02-10',
      totalInstallments: 12,
      remainingInstallments: 12,
      startedAt: '2024-02-10',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },

    // 할부
    {
      id: 'ri_seed_8',
      kind: 'installment',
      title: '노트북 할부 (맥북 M3)',
      amount: 95_000,
      categoryId: 'cat_card_bill',
      nextDueDate: nextMonth1,
      enabled: true,
      cycle: 'monthly',
      dayOfMonth: 14,
      providerName: '',
      billingCycle: 'monthly',
      firstBillingDate: '2025-08-14',
      totalInstallments: 24,
      remainingInstallments: 8,
      startedAt: '2025-08-14',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
    {
      id: 'ri_seed_9',
      kind: 'installment',
      title: '에어컨 할부',
      amount: 42_000,
      categoryId: 'cat_card_bill',
      nextDueDate: nextMonth15,
      enabled: true,
      cycle: 'monthly',
      dayOfMonth: 15,
      providerName: '',
      billingCycle: 'monthly',
      firstBillingDate: '2025-07-15',
      totalInstallments: 12,
      remainingInstallments: 3,
      startedAt: '2025-07-15',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    },
  ];

  saveRecurringItems(recurringItems);

  // ─── AppState 업데이트 (onboarding 완료로) ────────────────────────────────

  await localCache.setAppState({
    currentLedgerRootFolderId: 'seed-folder-id',
    onboardingCompleted: true,
    lastOpenedRoute: '/home',
    localCacheVersion: 1,
    lastSyncAt: isoNow(),
    installId: 'seed-install-id',
  });

  console.log('[SeedData] 시드 데이터 삽입 완료!');
}

// ─── 시드 데이터 삭제 ─────────────────────────────────────────────────────────

export async function clearSeedData(): Promise<void> {
  await localCache.clear();

  // localStorage 정리
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('reset-budget:')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  console.log('[SeedData] 시드 데이터 전체 삭제 완료.');
}
