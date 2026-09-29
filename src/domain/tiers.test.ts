// tiers.test.ts — RESET Budget 티어 게이팅 및 코드 인증(서버) 단위 테스트
//
// ⚠️ 이 파일은 공개 저장소에 올라간다. 실제 인증 코드·관리자 비밀값을 절대 적지 말 것.
// 아래 값은 모두 테스트 전용 가짜 값이다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hasFeature } from './tiers';

declare const process: {
  env: Record<string, string | undefined>;
};

const FAKE_SUPPORTER = 'TEST-SUPPORTER-CODE';
const FAKE_ADMIN_SECRET = 'test-admin-secret-0123456789abcdef';

describe('티어 게이팅', () => {
  it('티어별 기능 사용 권한 게이팅 (Gating) 정상 작동 여부 검증', () => {
    // 1. free 티어: 핵심 기능 게이팅됨
    expect(hasFeature('free', 'record')).toBe(false);
    expect(hasFeature('free', 'settings_full')).toBe(false);
    expect(hasFeature('free', 'safety')).toBe(false);

    // 2. basic 티어: 기본 관리(예산/기록/설정)는 허용, 고급 진단(안전도/통계)은 불허
    expect(hasFeature('basic', 'record')).toBe(true);
    expect(hasFeature('basic', 'settings_full')).toBe(true);
    expect(hasFeature('basic', 'safety')).toBe(false);

    // 3. allinone / couple 티어: 전체 고급 기능 허용
    expect(hasFeature('allinone', 'record')).toBe(true);
    expect(hasFeature('allinone', 'safety')).toBe(true);
    expect(hasFeature('allinone', 'stats')).toBe(true);
    expect(hasFeature('allinone', 'debt')).toBe(true);
    expect(hasFeature('couple', 'safety')).toBe(true);
  });
});

import handler from '../../api/activate';

/** Upstash REST 형식의 인메모리 KV 목 — GET/SET/SCAN 지원 */
function installKvMock(store: Record<string, string>) {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const [command, key] = body;
    if (command === 'GET') {
      return { ok: true, json: async () => ({ result: store[key] ?? null }) } as any;
    }
    if (command === 'SET') {
      store[key] = body[2];
      return { ok: true, json: async () => ({ result: 'OK' }) } as any;
    }
    if (command === 'SCAN') {
      const keys = Object.keys(store).filter((k) => k.startsWith('sponsorship:'));
      return { ok: true, json: async () => ({ result: ['0', keys] }) } as any;
    }
    return { ok: false } as any;
  };
  return () => { globalThis.fetch = original; };
}

describe('Serverless API: /api/activate 중복 방지 및 한도 검증', () => {
  let mockReq: any;
  let mockRes: any;
  let responseStatus: number;
  let responseData: any;

  beforeEach(() => {
    responseStatus = 200;
    responseData = null;

    mockRes = {
      status: (code: number) => {
        responseStatus = code;
        return mockRes;
      },
      json: (data: any) => {
        responseData = data;
        return mockRes;
      },
      setHeader: () => mockRes,
      end: () => {},
    };

    // 환경 변수 설정 (테스트 간 오염 방지를 위해 매번 명시적으로 초기화)
    process.env.VITE_SUPPORTER_CODE = FAKE_SUPPORTER;
    process.env.VITE_ACCESS_CODES = JSON.stringify({
      'TEST-BSC': 'basic',
      'TEST-CPL': 'couple',
    });
    delete process.env.ACCESS_CODES;
    delete process.env.SUPPORTER_CODE;
    delete process.env.ADMIN_SECRET;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.REDIS_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.ACTIVATION_FAIL_CLOSED;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('올바르지 않은 메서드 요청 시 405 반환', async () => {
    mockReq = { method: 'GET' };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(405);
  });

  it('필수 파라미터(code, email) 누락 시 400 반환', async () => {
    mockReq = { method: 'POST', body: { email: 'a@b.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(400);

    mockReq = { method: 'POST', body: { code: 'TEST-BSC' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(400);
  });

  it('유효하지 않은 코드 입력 시 400 반환', async () => {
    mockReq = { method: 'POST', body: { code: 'TEST-INVALID', email: 'a@b.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(400);
    expect(responseData.error).toContain('유효하지 않은');
  });

  it('대표 서포터 코드는 대소문자·공백 무관하게 allinone 으로 인증', async () => {
    mockReq = { method: 'POST', body: { code: `  ${FAKE_SUPPORTER.toLowerCase()}  `, email: 'a@b.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(200);
    expect(responseData.tier).toBe('allinone');
  });

  it('KV 연동되지 않은 상태(로컬 등)에서는 오프라인 폴백 허용', async () => {
    mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'a@b.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(200);
    expect(responseData.success).toBe(true);
    expect(responseData.tier).toBe('basic');
  });

  it('ACCESS_CODES 가 설정되면 그것만 기준 — 옛 목록에서만 남은 코드는 폐기된다', async () => {
    // 옛 목록(VITE_ACCESS_CODES): TEST-BSC, TEST-CPL / 새 목록: TEST-BSC, TEST-AIO-NEW
    // → TEST-CPL 은 새 목록에서 빠졌으므로 무효여야 한다 (유출 코드 폐기 경로)
    process.env.ACCESS_CODES = JSON.stringify({ 'TEST-BSC': 'basic', 'TEST-AIO-NEW': 'allinone' });

    mockReq = { method: 'POST', body: { code: 'test-aio-new', email: 'a@b.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(200);
    expect(responseData.tier).toBe('allinone');

    mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'a@b.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(200);

    mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'a@b.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(400);
    expect(responseData.error).toContain('유효하지 않은');
  });

  it('ACCESS_CODES 의 JSON 이 깨졌으면 옛(유출) 목록으로 되돌아가지 않는다 (fail-closed)', async () => {
    // 되돌아가면 오타 하나로 폐기했던 유출 코드가 전부 되살아난다
    process.env.ACCESS_CODES = '{not valid json';
    mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'a@b.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(400);
    expect(responseData.error).toContain('유효하지 않은');
  });

  it('ACCESS_CODES 가 아예 없을 때만 옛 목록 사용 (이관 전 환경 호환)', async () => {
    process.env.ACCESS_CODES = '   ';
    mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'a@b.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(200);
    expect(responseData.tier).toBe('basic');
  });

  it('기본값(차단 꺼짐)이면 실서버에서도 DB 가 없을 때 인증을 막지 않는다 — 신규 인증 전면 중단 방지', async () => {
    process.env.VERCEL_ENV = 'production';
    try {
      mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'a@b.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(200);
      expect(responseData.tier).toBe('basic');
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });

  it('ACTIVATION_FAIL_CLOSED=1 이면 DB 에 연결할 수 없을 때 통과시키지 않는다 (fail-closed)', async () => {
    process.env.ACTIVATION_FAIL_CLOSED = '1';
    try {
      mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'a@b.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(503);
      expect(responseData.success).toBeUndefined();
    } finally {
      delete process.env.ACTIVATION_FAIL_CLOSED;
    }
  });

  it('ACTIVATION_FAIL_CLOSED=1 이면 계정 연결 기록(SET) 실패를 성공으로 처리하지 않는다', async () => {
    process.env.ACTIVATION_FAIL_CLOSED = '1';
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';
    const original = globalThis.fetch;
    globalThis.fetch = async (_u: any, init: any) => {
      const [command] = JSON.parse(init.body);
      if (command === 'GET') return { ok: true, json: async () => ({ result: null }) } as any;
      return { ok: false, json: async () => ({}) } as any; // SET 실패
    };
    try {
      mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'a@b.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(503);
    } finally {
      globalThis.fetch = original;
      delete process.env.ACTIVATION_FAIL_CLOSED;
    }
  });

  it('KV 연동 시 basic 팩(한도 1)에 대해 중복 활성화 감지 및 제한 검증', async () => {
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';
    const restore = installKvMock({});

    try {
      // 1. A 사용자 활성화 시도 -> 성공
      mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'userA@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(200);
      expect(responseData.success).toBe(true);

      // 2. A 사용자 재활성화 시도 (기기 재로그인 등) -> 성공
      mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'userA@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(200);

      // 3. 다른 B 사용자 활성화 시도 -> 1대 초과로 실패
      mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'userB@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(400);
      expect(responseData.error).toContain('초과');
    } finally {
      restore();
    }
  });

  it('KV 연동 시 couple 팩(한도 2)에 대해 중복 활성화 감지 및 제한 검증', async () => {
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';
    const restore = installKvMock({});

    try {
      // 1. A 사용자 활성화 시도 -> 성공
      mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'userA@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(200);

      // 2. B 사용자 활성화 시도 -> 성공 (한도가 2이므로 성공해야 함)
      mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'userB@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(200);

      // 3. C 사용자 활성화 시도 -> 2대 초과로 실패
      mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'userC@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(400);
      expect(responseData.error).toContain('초과');

      // 4. A 사용자가 다른 기기에서 재로그인 -> 기등록된 상태이므로 성공
      mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'userA@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(200);
    } finally {
      restore();
    }
  });

  it('placeholder 이메일(@example.com)로 등록 시도 시 400 거부 (DB 오염 방지)', async () => {
    mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'unknown@example.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(400);
    expect(responseData.error).toContain('구글 계정 정보');

    mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'test_verify@example.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(400);
  });

  it('기존 DB의 placeholder 이메일은 자리 계산에서 제외되어 실제 사용자가 인증 가능', async () => {
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';

    // 커플팩에 실사용자 1명 + placeholder 1명이 이미 등록된 상태를 재현
    const store: Record<string, string> = {
      'sponsorship:TEST-CPL': JSON.stringify(['reala@gmail.com', 'test_verify@example.com']),
    };
    const restore = installKvMock(store);

    try {
      // 1. 신규 실사용자 B 인증 -> placeholder 자리가 회수되어 성공해야 함
      mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'realB@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(200);
      expect(responseData.success).toBe(true);

      // 2. DB에는 placeholder가 제거되고 실사용자 2명만 남아야 함
      const stored = JSON.parse(store['sponsorship:TEST-CPL']);
      expect(stored).toEqual(['reala@gmail.com', 'realb@gmail.com']);

      // 3. 기존 사용자 A 재인증 -> 여전히 성공
      mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'realA@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(200);

      // 4. 제3의 사용자 C 인증 -> 실사용자 2명이 찼으므로 거부
      mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'realC@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(400);
      expect(responseData.error).toContain('초과');
    } finally {
      restore();
    }
  });
});

describe('관리자 기능 보안 (ADMIN_SECRET 전용)', () => {
  let mockRes: any;
  let status: number;
  let data: any;

  beforeEach(() => {
    status = 200;
    data = null;
    mockRes = {
      status: (c: number) => { status = c; return mockRes; },
      json: (d: any) => { data = d; return mockRes; },
      setHeader: () => mockRes,
      end: () => {},
    };
    process.env.VITE_SUPPORTER_CODE = FAKE_SUPPORTER;
    process.env.VITE_ACCESS_CODES = JSON.stringify({ 'TEST-BSC': 'basic', 'TEST-CPL': 'couple' });
    delete process.env.ACCESS_CODES;
    delete process.env.SUPPORTER_CODE;
    delete process.env.ADMIN_SECRET;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.REDIS_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.ACTIVATION_FAIL_CLOSED;
  });

  it('서포터 코드로는 전체 초기화(ADMIN_RESET)를 호출할 수 없다', async () => {
    process.env.ADMIN_SECRET = FAKE_ADMIN_SECRET;
    // 예전 방식: code 에 서포터 코드를 넣어 호출
    await handler({ method: 'POST', body: { action: 'ADMIN_RESET', code: FAKE_SUPPORTER } }, mockRes);
    expect(status).toBe(403);
    // secret 자리에 서포터 코드를 넣어도 거부
    await handler({ method: 'POST', body: { action: 'ADMIN_RESET', secret: FAKE_SUPPORTER } }, mockRes);
    expect(status).toBe(403);
  });

  it('ADMIN_SECRET 이 설정되지 않으면 관리자 기능 자체가 비활성화된다', async () => {
    await handler({ method: 'POST', body: { action: 'ADMIN_RESET', secret: '' } }, mockRes);
    expect(status).toBe(403);
    await handler({ method: 'POST', body: { action: 'ADMIN_CODE_STATUS', secret: 'anything' } }, mockRes);
    expect(status).toBe(403);
  });

  it('너무 짧은 ADMIN_SECRET 은 설정돼 있어도 거부한다 (약한 비밀값 방지)', async () => {
    process.env.ADMIN_SECRET = 'short';
    await handler({ method: 'POST', body: { action: 'ADMIN_CODE_STATUS', secret: 'short' } }, mockRes);
    expect(status).toBe(403);
  });

  it('틀린 비밀값으로는 코드 현황을 조회할 수 없다', async () => {
    process.env.ADMIN_SECRET = FAKE_ADMIN_SECRET;
    await handler({ method: 'POST', body: { action: 'ADMIN_CODE_STATUS', secret: FAKE_ADMIN_SECRET + 'x' } }, mockRes);
    expect(status).toBe(403);
  });

  it('환경변수 끝에 줄바꿈이 붙어 있어도 올바른 비밀값을 인정한다', async () => {
    process.env.ADMIN_SECRET = FAKE_ADMIN_SECRET + '\n';
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';
    const restore = installKvMock({});
    try {
      await handler({ method: 'POST', body: { action: 'ADMIN_CODE_STATUS', secret: FAKE_ADMIN_SECRET } }, mockRes);
      expect(status).toBe(200);
    } finally {
      restore();
    }
  });

  it('DB 에 연결할 수 없어도 코드 목록과 DB 오류를 반환한다 (코드를 써보지 않고 등록 확인)', async () => {
    process.env.ADMIN_SECRET = FAKE_ADMIN_SECRET;
    process.env.ACCESS_CODES = JSON.stringify({ 'TEST-AIO-NEW': 'allinone' });
    // KV·Redis 모두 미설정 → DB 조회 불가
    await handler({ method: 'POST', body: { action: 'ADMIN_CODE_STATUS', secret: FAKE_ADMIN_SECRET } }, mockRes);
    expect(status).toBe(200);
    expect(data.db.connected).toBe(false);
    expect(data.db.error).toBeTruthy();
    const row = data.rows.find((r: any) => r.code === 'TEST-AIO-NEW');
    expect(row).toBeTruthy();
    expect(row.tier).toBe('allinone');
    expect(row.used).toBeNull(); // 알 수 없음 — 0(미사용)으로 오해하지 않도록
    expect(data.summary.allinone.used).toBeNull();
  });

  it('올바른 비밀값으로 코드별 사용 현황을 조회한다 (이메일은 마스킹)', async () => {
    process.env.ADMIN_SECRET = FAKE_ADMIN_SECRET;
    process.env.ACCESS_CODES = JSON.stringify({
      'TEST-BSC': 'basic', 'TEST-CPL': 'couple', 'TEST-AIO-NEW': 'allinone',
    });
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';
    const restore = installKvMock({
      'sponsorship:TEST-BSC': JSON.stringify(['someone@gmail.com']),
      'sponsorship:TEST-CPL': JSON.stringify(['a1@gmail.com', 'placeholder@example.com']),
    });
    try {
      await handler({ method: 'POST', body: { action: 'ADMIN_CODE_STATUS', secret: FAKE_ADMIN_SECRET } }, mockRes);
      expect(status).toBe(200);

      const byCode = Object.fromEntries(data.rows.map((r: any) => [r.code, r]));
      expect(byCode['TEST-BSC'].used).toBe(1);
      expect(byCode['TEST-BSC'].accounts[0]).not.toContain('someone'); // 마스킹 확인
      expect(byCode['TEST-CPL'].used).toBe(1);                         // placeholder 는 제외
      expect(byCode['TEST-CPL'].max).toBe(2);
      expect(byCode['TEST-AIO-NEW'].used).toBe(0);                     // 신규 코드 = 미사용
      expect(byCode[FAKE_SUPPORTER].isSupporterCode).toBe(true);

      expect(data.summary.allinone.unused).toBeGreaterThanOrEqual(1);
      expect(data.summary.basic).toEqual({ total: 1, used: 1, unused: 0 });
    } finally {
      restore();
    }
  });
});
