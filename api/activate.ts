import { Redis } from 'ioredis';
import { createHash, timingSafeEqual } from 'node:crypto';

declare const process: {
  env: Record<string, string | undefined>;
};

// Vercel Serverless Function Types
interface VercelRequest {
  method?: string;
  body?: any;
}
interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: any) => VercelResponse;
  setHeader: (name: string, value: string) => VercelResponse;
  end: () => void;
}

// UserTier 타입 정의
type UserTier = 'free' | 'basic' | 'allinone' | 'couple' | 'supporter';

interface AccessCodeItem {
  index: number;
  code: string;
  tier: UserTier;
}

// ─── 환경변수 ────────────────────────────────────────────────────────────────
//
// ⚠️ 인증코드·관리자 비밀값은 반드시 서버 전용(VITE_ 접두사 없는) 변수로 관리한다.
// VITE_ 접두사 변수를 클라이언트 코드에서 참조하면 Vite 가 값을 공개 JS 번들에 그대로
// 박아 넣어, 누구나 브라우저 개발자도구로 전체 코드를 읽을 수 있게 된다.
// (실제로 이 경로로 노출된 사고가 있었다)
//
//   ACCESS_CODES   — 신규 코드 목록 (JSON {code: tier})
//   SUPPORTER_CODE — 대표 서포터 코드
//   ADMIN_SECRET   — 관리자 기능 전용 비밀값. 인증코드와 절대 공유하지 않는다.
//
// ACCESS_CODES 가 설정돼 있으면 그것만 기준으로 삼는다 — 유출된 코드를 폐기하려면
// ACCESS_CODES 에서 빼기만 하면 되도록. (병합하면 옛 변수에 남은 코드가 계속 살아 폐기 불가)
// ACCESS_CODES 가 아예 없을 때만 옛 VITE_ACCESS_CODES 로 폴백한다.
// 서포터 코드도 SUPPORTER_CODE 우선, 없으면 옛 VITE_SUPPORTER_CODE.

function parseCodeJson(rawInput: string | undefined, label: string): Record<string, UserTier> {
  const map: Record<string, UserTier> = {};
  if (!rawInput) return map;
  try {
    let raw = rawInput.trim();
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
      raw = raw.slice(1, -1).trim();
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed as AccessCodeItem[]) {
        if (item && item.code && item.tier) {
          map[item.code.trim().toUpperCase()] = item.tier;
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const [code, tier] of Object.entries(parsed)) {
        map[code.trim().toUpperCase()] = tier as UserTier;
      }
    }
  } catch (err) {
    console.error(`Error parsing ${label}:`, err);
  }
  return map;
}

function loadCodeMap(): Record<string, UserTier> {
  const rawCurrent = (process.env.ACCESS_CODES || '').trim();
  if (rawCurrent) {
    // 설정돼 있으면 파싱 결과가 비어도 옛 목록으로 돌아가지 않는다(fail-closed).
    // 돌아가면 JSON 오타 하나로 폐기했던 코드가 조용히 되살아난다.
    // 오타는 빌드 단계(scripts/scan-dist.mjs)에서 먼저 잡아 배포를 막는다.
    const current = parseCodeJson(rawCurrent, 'ACCESS_CODES');
    if (Object.keys(current).length === 0) {
      console.error('ACCESS_CODES is set but contains no valid codes — all code activations will fail.');
    }
    return current;
  }

  // ACCESS_CODES 가 아예 없을 때만 옛 목록 사용 (이관 전 환경 호환)
  const legacy = parseCodeJson(process.env.VITE_ACCESS_CODES, 'VITE_ACCESS_CODES');
  if (Object.keys(legacy).length === 0) {
    console.warn('No access codes configured (ACCESS_CODES / VITE_ACCESS_CODES are empty).');
  }
  return legacy;
}

/** DB 장애 시 인증을 계정 등록 없이 통과시킬지(fail-open) 여부.
 *
 *  ACTIVATION_FAIL_CLOSED=1 이면 장애 시 503 으로 거부한다(fail-closed).
 *  코드가 외부에 알려진 경우, 장애 중에 제한 없이 통과시키면
 *  누구나 몇 명이든 유료 등급을 얻을 수 있으므로 DB 가 정상일 때는 켜 두는 것이 맞다.
 *
 *  ⚠️ 기본값은 꺼짐(fail-open). 2026-09-29 배포 직후 실서버에서 Redis 연결이 전혀 되지
 *  않는 것이 드러났다 — 이 상태에서 기본값을 fail-closed 로 두면 모든 신규 인증이 막힌다.
 *  Redis 연결을 복구·확인한 뒤(ADMIN_CODE_STATUS 로 조회 성공) 이 값을 켤 것. */
function allowDbFallback(): boolean {
  return process.env.ACTIVATION_FAIL_CLOSED !== '1';
}

/** Redis 연결 — 실패하면 진짜 원인(ECONNREFUSED, ENOTFOUND, TLS, AUTH 등)이 담긴 에러를 던진다.
 *  lazyConnect 없이 바로 명령을 보내면 "max retries per request" 같은 뭉뚱그린 에러만 남아
 *  원인을 알 수 없다. */
/** 진단용 — 비밀번호 없이 접속 방식·제공업체·포트만 보여준다 */
function describeRedisUrl(url: string): string {
  try {
    const u = new URL(url);
    const provider = u.hostname.split('.').slice(-2).join('.');
    return `${u.protocol}//…${provider}:${u.port || '기본포트'}`;
  } catch {
    return 'URL 형식 오류';
  }
}

/** 마지막으로 성공한 접속 방식 (관리자 조회에 표시) */
let lastRedisTransport = '';

async function tryConnect(url: string, useTls: boolean): Promise<Redis> {
  let lastEvent: any = null;
  const opts: any = {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy: () => null, // 서버리스에서는 재연결을 반복하지 않는다
  };
  if (useTls) opts.tls = { servername: new URL(url).hostname };
  const client = new Redis(url, opts);
  // connect() 는 "Connection is closed" 처럼 뭉뚱그린 에러만 던지므로, 진짜 원인은
  // error 이벤트에서 따로 붙잡아 둔다
  client.on('error', (e) => { lastEvent = e; });
  try {
    await client.connect();
    return client;
  } catch (err: any) {
    try { client.disconnect(); } catch {}
    const main = [err?.code, err?.message].filter(Boolean).join(' ') || String(err);
    const cause = lastEvent && lastEvent !== err
      ? ` / 원인: ${[lastEvent.code, lastEvent.message].filter(Boolean).join(' ')}`
      : '';
    throw new Error(`${main}${cause}`);
  }
}

async function connectRedis(url: string): Promise<Redis> {
  const isPlain = url.startsWith('redis://');
  try {
    const c = await tryConnect(url, false);
    lastRedisTransport = isPlain ? '평문' : 'TLS(URL 지정)';
    return c;
  } catch (plainErr: any) {
    // 서버가 TLS 를 요구하는데 URL 이 redis:// 인 경우, 연결 직후 서버가 끊어버린다.
    // 평문이 실패하면 TLS 로 한 번 더 시도한다 (지원하지 않는 서버라도 추가 피해 없음).
    if (isPlain) {
      try {
        const c = await tryConnect(url, true);
        lastRedisTransport = 'TLS(자동 전환)';
        return c;
      } catch (tlsErr: any) {
        throw new Error(
          `Redis 연결 실패 [${describeRedisUrl(url)}] 평문: ${plainErr.message} | TLS: ${tlsErr.message}`,
        );
      }
    }
    throw new Error(`Redis 연결 실패 [${describeRedisUrl(url)}] ${plainErr.message}`);
  }
}

function supporterCode(): string {
  return (process.env.SUPPORTER_CODE || process.env.VITE_SUPPORTER_CODE || '').trim().toUpperCase();
}

// 후원 코드가 유효한 경우 해당 티어를 반환, 아니면 null
function parseTierFromCode(code: string): UserTier | null {
  const normalised = code.trim().toUpperCase();

  // 1. 단일 서포터 코드 검증
  const sup = supporterCode();
  if (sup && normalised === sup) {
    return 'allinone';
  }

  // 2. 다중 액세스 코드 맵 검증
  const map = loadCodeMap();
  const tier = map[normalised];
  if (tier === 'basic' || tier === 'allinone' || tier === 'couple' || tier === 'supporter') {
    return tier === 'supporter' ? 'allinone' : tier;
  }

  return null;
}

// ─── 관리자 인증 ────────────────────────────────────────────────────────────

/** 관리자 비밀값 검증 — 타이밍 공격을 막기 위해 해시 후 고정 시간 비교.
 *  ADMIN_SECRET 이 설정되지 않았으면 관리자 기능 자체를 비활성화한다.
 *  (예전에는 서포터 코드로 전체 초기화가 가능했다 — 인증 코드와 관리자 권한은 분리한다) */
function isAdmin(provided: unknown): boolean {
  // 환경변수 등록 시 끝에 줄바꿈이 붙는 경우가 있어 앞뒤 공백을 제거한다
  const secret = (process.env.ADMIN_SECRET || '').trim();
  if (secret.length < 24) return false;
  if (typeof provided !== 'string' || provided.trim().length === 0) return false;
  const a = createHash('sha256').update(provided.trim()).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}${'*'.repeat(Math.max(1, Math.min(user.length - head.length, 5)))}@${domain}`;
}

// ─── DB 헬퍼 (REST 우선, 없으면 TCP) ────────────────────────────────────────

async function kvCommand(args: (string | number)[]): Promise<any> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const res = await fetch(kvUrl as string, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`KV ${args[0]} 실패 (${res.status})`);
  return (await res.json()).result;
}

/** 관리자 조회용: sponsorship:* 전체를 { code: emails[] } 로 읽는다 (읽기 전용) */
async function readAllBindings(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const parse = (v: unknown): string[] => {
    try {
      const p = typeof v === 'string' ? JSON.parse(v) : v;
      return Array.isArray(p) ? p.map((e: string) => String(e).trim().toLowerCase()) : [];
    } catch { return []; }
  };

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    let cursor = '0';
    do {
      const [next, keys] = await kvCommand(['SCAN', cursor, 'MATCH', 'sponsorship:*', 'COUNT', 200]);
      cursor = String(next);
      for (const k of keys as string[]) {
        out[k.replace(/^sponsorship:/, '')] = parse(await kvCommand(['GET', k]));
      }
    } while (cursor !== '0');
    return out;
  }

  if (process.env.REDIS_URL) {
    const client = await connectRedis(process.env.REDIS_URL);
    try {
      let cursor = '0';
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', 'sponsorship:*', 'COUNT', 200);
        cursor = next;
        for (const k of keys) {
          out[k.replace(/^sponsorship:/, '')] = parse(await client.get(k));
        }
      } while (cursor !== '0');
    } finally {
      try { await client.quit(); } catch {}
    }
    return out;
  }

  throw new Error('연결된 DB가 없습니다.');
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS 처리
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ─── 관리자: 코드별 사용 현황 조회 (읽기 전용) ────────────────────────────
  if (req.body && req.body.action === 'ADMIN_CODE_STATUS') {
    if (!isAdmin(req.body.secret)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    try {
      const codes = loadCodeMap();
      const sup = supporterCode();
      if (sup) codes[sup] = 'allinone';

      // DB 에 연결할 수 없어도 코드 목록·DB 상태는 보여준다.
      // (코드를 직접 써보지 않고도 서버 등록 여부를 확인할 수 있어야 한다 — 올인원은 1계정뿐이라
      //  시험 삼아 인증하면 구매자 몫을 써버린다)
      let bindings: Record<string, string[]> = {};
      let dbError: string | null = null;
      try {
        bindings = await readAllBindings();
      } catch (e: any) {
        dbError = e?.message || String(e);
      }

      const rows = Object.entries(codes).map(([code, tier]) => {
        const emails = (bindings[code] ?? []).filter((e) => !e.endsWith('@example.com'));
        const effective = tier === 'supporter' ? 'allinone' : tier;
        return {
          code,
          tier: effective,
          used: dbError ? null : emails.length, // null = DB 불가로 알 수 없음
          max: effective === 'couple' ? 2 : 1,
          accounts: emails.map(maskEmail),
          isSupporterCode: code === sup,
        };
      }).sort((a, b) => a.code.localeCompare(b.code));

      const summary: Record<string, { total: number; used: number | null; unused: number | null }> = {};
      for (const r of rows) {
        summary[r.tier] ??= { total: 0, used: dbError ? null : 0, unused: dbError ? null : 0 };
        summary[r.tier].total++;
        if (!dbError) {
          if ((r.used ?? 0) > 0) summary[r.tier].used!++; else summary[r.tier].unused!++;
        }
      }
      const unknownKeys = Object.keys(bindings).filter((c) => !codes[c]);

      return res.status(200).json({
        success: true,
        summary,
        rows,
        unknownKeys,
        db: {
          connected: !dbError,
          error: dbError,
          transport: dbError ? null : (lastRedisTransport || (process.env.KV_REST_API_URL ? 'KV REST' : '알 수 없음')),
          failClosed: !allowDbFallback(),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: `조회 실패: ${err.message}` });
    }
  }

  // ─── 관리자: 코드-계정 연결 전체 초기화 ──────────────────────────────────
  // 사용자에게 나눠주는 인증 코드와 관리자 권한을 분리해, 전용 비밀값(ADMIN_SECRET)으로만 허용한다.
  if (req.body && req.body.action === 'ADMIN_RESET') {
    if (!isAdmin(req.body.secret)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const client = await connectRedis(redisUrl);
        const keys = await client.keys('sponsorship:*');
        if (keys.length > 0) {
          await client.del(...keys);
        }
        await client.quit();
        return res.status(200).json({ success: true, message: `초기화 완료: ${keys.length}개 키 삭제됨` });
      } catch (err: any) {
        return res.status(500).json({ error: `초기화 실패: ${err.message}` });
      }
    }
    return res.status(400).json({ error: '연결된 Redis DB가 없습니다.' });
  }

  const { code, email } = req.body || {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: '인증 코드를 입력해 주세요.' });
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: '올바른 구글 이메일 계정이 필요합니다.' });
  }

  const normalisedCode = code.trim().toUpperCase();
  const normalisedEmail = email.trim().toLowerCase();

  // placeholder 이메일(구버전 클라이언트가 프로필 로드 전에 보낸 값)은 등록 거부
  // → 실제 사용자의 인증 자리를 가짜 이메일이 차지하는 문제 방지
  if (normalisedEmail.endsWith('@example.com')) {
    return res.status(400).json({
      error: '구글 계정 정보를 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 인증해 주세요.',
    });
  }

  // 1. 코드 유효성 및 티어 판별
  const tier = parseTierFromCode(normalisedCode);
  if (!tier) {
    return res.status(400).json({ error: '유효하지 않은 인증 코드입니다.' });
  }

  // 2. 티어에 따른 최대 기기(계정) 등록 수 제한
  const maxAllowed = tier === 'couple' ? 2 : 1;

  // 3. 데이터베이스 연동 및 중복 체크 (REST API 우선, 없으면 TCP REDIS_URL 사용)
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const redisUrl = process.env.REDIS_URL;

  const key = `sponsorship:${normalisedCode}`;
  let emails: string[] = [];
  let isDbSuccess = false;
  let redisClient: Redis | null = null;

  // A. REST API (Upstash) 모드로 시도
  if (kvUrl && kvToken) {
    try {
      const getRes = await fetch(kvUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['GET', key]),
      });

      if (getRes.ok) {
        const getData = await getRes.json();
        if (getData.result) {
          const parsed = JSON.parse(getData.result);
          if (Array.isArray(parsed)) {
            emails = parsed.map((e: string) => e.trim().toLowerCase());
          }
        }
        isDbSuccess = true;
      }
    } catch (err) {
      console.error('KV REST GET error, will try fallback:', err);
    }
  }

  // B. TCP Redis 모드로 시도 (Official Redis for Vercel)
  if (!isDbSuccess && redisUrl) {
    try {
      redisClient = await connectRedis(redisUrl);
      const rawData = await redisClient.get(key);
      if (rawData) {
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
          emails = parsed.map((e: string) => e.trim().toLowerCase());
        }
      }
      isDbSuccess = true;
    } catch (err) {
      console.error('Redis TCP GET error:', err);
      if (redisClient) {
        try { await redisClient.quit(); } catch {}
        redisClient = null;
      }
    }
  }

  // C. DB에 연결할 수 없는 경우
  //    실서버: 계정 등록 없이 통과시키면 1코드 1계정 제한이 무력화되므로 차단(fail-closed)
  //    로컬 개발: DB 가 없으므로 오프라인 폴백 허용
  if (!isDbSuccess) {
    if (!allowDbFallback()) {
      console.error('Database unavailable in production — rejecting activation (fail-closed).');
      return res.status(503).json({
        error: '인증 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
    console.warn('All database connections failed or not configured. Falling back to offline check.');
    return res.status(200).json({
      success: true,
      tier,
      message: '인증 완료 (Database offline fallback activated)',
    });
  }

  // 4. 인증 논리 판단
  // 기존에 잘못 등록된 placeholder 이메일(unknown@example.com 등)은 자리 계산에서 제외
  // → 실제 사용자가 인증하면 placeholder 자리가 자동으로 회수됨
  emails = emails.filter((e) => !e.endsWith('@example.com'));

  // 이미 등록된 구글 계정이면 성공 반환
  if (emails.includes(normalisedEmail)) {
    if (redisClient) {
      try { await redisClient.quit(); } catch {}
    }
    return res.status(200).json({
      success: true,
      tier,
      message: '기기 재인증 성공',
    });
  }

  // 허용 수량 제한 체크
  if (emails.length >= maxAllowed) {
    if (redisClient) {
      try { await redisClient.quit(); } catch {}
    }
    return res.status(400).json({
      error: '이미 다른 구글 계정에서 사용 중이거나, 해당 코드의 활성화 허용 대수(제한)를 초과했습니다.',
      limitExceeded: true,
    });
  }

  // 신규 등록 가능하므로 이메일 추가 및 DB 업데이트
  emails.push(normalisedEmail);

  let isUpdateSuccess = false;

  // A. REST API (Upstash) 업데이트 시도
  if (kvUrl && kvToken && !redisClient) {
    try {
      const setRes = await fetch(kvUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SET', key, JSON.stringify(emails)]),
      });
      if (setRes.ok) {
        isUpdateSuccess = true;
      }
    } catch (err) {
      console.error('KV REST SET error:', err);
    }
  }

  // B. TCP Redis 업데이트 시도
  if (!isUpdateSuccess && redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(emails));
      isUpdateSuccess = true;
    } catch (err) {
      console.error('Redis TCP SET error:', err);
    } finally {
      try { await redisClient.quit(); } catch {}
    }
  }

  if (!isUpdateSuccess) {
    // 계정 연결을 기록하지 못했다 → 성공으로 처리하면 그 코드의 자리가 계속 비어 있어
    // 다른 계정이 또 쓸 수 있다. 실서버에서는 실패로 돌려 재시도하게 한다.
    if (!allowDbFallback()) {
      console.error('Failed to record activation in production — rejecting (fail-closed).');
      return res.status(503).json({
        error: '인증 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
    console.warn('Failed to update DB, falling back to successful activation.');
  }

  return res.status(200).json({
    success: true,
    tier,
    message: '인증 완료 및 기기 등록 성공',
  });
}
