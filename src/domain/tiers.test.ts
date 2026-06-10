// tiers.test.ts — RESET Budget 티어 및 코드 인증 단위 테스트

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseTierFromCode, hasFeature } from './tiers';

declare const process: {
  env: Record<string, string | undefined>;
};

describe('티어 및 후원 코드 인증 검증', () => {
  it('유효한 후원 코드 입력 시 대소문자/공백에 무관하게 올바른 티어를 반환하는지 검증', () => {
    // .env 에 등록된 대표 후원 코드 MONEYSET2025
    expect(parseTierFromCode('MONEYSET2025')).toBe('allinone');
    expect(parseTierFromCode('moneyset2025')).toBe('allinone'); // 소문자 처리
    expect(parseTierFromCode('  MONEYSET2025  ')).toBe('allinone'); // 앞뒤 공백 제거
  });

  it('유효하지 않은 코드 입력 시 null을 반환하는지 검증', () => {
    expect(parseTierFromCode('INVALID-CODE')).toBeNull();
    expect(parseTierFromCode('')).toBeNull();
  });

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

  it('중앙 DB 중복 검크 로직 유무 검증 (중복 사용 차단 불가 아키텍처 실증)', () => {
    // 이 테스트는 A 사용자와 B 사용자가 물리적으로 분리된 환경에서 동일한 코드를 입력해도
    // 로컬 클라이언트에서 별도의 중복 여부 확인 없이 성공 처리됨을 실증합니다.
    const sharedCode = 'MONEYSET2025';

    // 1. A 사용자 세션에서 코드 활성화 시도 -> 성공
    const tierForUserA = parseTierFromCode(sharedCode);
    expect(tierForUserA).toBe('allinone');

    // 2. B 사용자 세션에서 동일한 코드 활성화 시도 -> 성공 (중복 체크 API가 부재함)
    const tierForUserB = parseTierFromCode(sharedCode);
    expect(tierForUserB).toBe('allinone');

    // 3. 중앙 DB 연동 없이 로컬 코드 맵 매칭만 수행되므로, 동일 코드가 무제한 중복 사용될 수 있는 구조입니다.
    expect(tierForUserA).toBe(tierForUserB);
  });
});

import handler from '../../api/activate';

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

    // 환경 변수 설정
    process.env.VITE_SUPPORTER_CODE = 'MONEYSET2025';
    process.env.VITE_ACCESS_CODES = JSON.stringify({
      'TEST-BSC': 'basic',
      'TEST-CPL': 'couple',
    });
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

  it('KV 연동되지 않은 상태(로컬 등)에서는 오프라인 폴백 허용', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    mockReq = { method: 'POST', body: { code: 'TEST-BSC', email: 'a@b.com' } };
    await handler(mockReq, mockRes);
    expect(responseStatus).toBe(200);
    expect(responseData.success).toBe(true);
    expect(responseData.tier).toBe('basic');
  });

  it('KV 연동 시 basic 팩(한도 1)에 대해 중복 활성화 감지 및 제한 검증', async () => {
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';

    const kvStore: Record<string, string> = {};

    // fetch mock
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      const command = body[0];
      const key = body[1];

      if (command === 'GET') {
        return {
          ok: true,
          json: async () => ({ result: kvStore[key] || null }),
        } as any;
      } else if (command === 'SET') {
        const val = body[2];
        kvStore[key] = val;
        return {
          ok: true,
          json: async () => ({ result: 'OK' }),
        } as any;
      }
      return { ok: false } as any;
    };

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
      globalThis.fetch = originalFetch;
    }
  });

  it('KV 연동 시 couple 팩(한도 2)에 대해 중복 활성화 감지 및 제한 검증', async () => {
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';

    const kvStore: Record<string, string> = {};

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      const command = body[0];
      const key = body[1];

      if (command === 'GET') {
        return {
          ok: true,
          json: async () => ({ result: kvStore[key] || null }),
        } as any;
      } else if (command === 'SET') {
        const val = body[2];
        kvStore[key] = val;
        return {
          ok: true,
          json: async () => ({ result: 'OK' }),
        } as any;
      }
      return { ok: false } as any;
    };

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
      globalThis.fetch = originalFetch;
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
    const kvStore: Record<string, string> = {
      'sponsorship:TEST-CPL': JSON.stringify(['reala@gmail.com', 'test_verify@example.com']),
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      const command = body[0];
      const key = body[1];

      if (command === 'GET') {
        return {
          ok: true,
          json: async () => ({ result: kvStore[key] || null }),
        } as any;
      } else if (command === 'SET') {
        kvStore[key] = body[2];
        return {
          ok: true,
          json: async () => ({ result: 'OK' }),
        } as any;
      }
      return { ok: false } as any;
    };

    try {
      // 1. 신규 실사용자 B 인증 -> placeholder 자리가 회수되어 성공해야 함
      mockReq = { method: 'POST', body: { code: 'TEST-CPL', email: 'realB@gmail.com' } };
      await handler(mockReq, mockRes);
      expect(responseStatus).toBe(200);
      expect(responseData.success).toBe(true);

      // 2. DB에는 placeholder가 제거되고 실사용자 2명만 남아야 함
      const stored = JSON.parse(kvStore['sponsorship:TEST-CPL']);
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
      globalThis.fetch = originalFetch;
    }
  });
});
