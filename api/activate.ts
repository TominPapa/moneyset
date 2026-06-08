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

// 환경변수 VITE_ACCESS_CODES 를 파싱해 코드 → 티어 매핑 반환
function loadCodeMap(): Record<string, UserTier> {
  try {
    let raw = process.env.VITE_ACCESS_CODES;
    if (!raw) return {};

    raw = raw.trim();
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
      raw = raw.slice(1, -1).trim();
    }

    const parsed = JSON.parse(raw);
    const map: Record<string, UserTier> = {};

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
    return map;
  } catch (err) {
    console.error('Error parsing VITE_ACCESS_CODES in API:', err);
    return {};
  }
}

// 후원 코드가 유효한 경우 해당 티어를 반환, 아니면 null
function parseTierFromCode(code: string): UserTier | null {
  const normalised = code.trim().toUpperCase();

  // 1. 단일 서포터 코드 검증
  const envSupporterCode = (process.env.VITE_SUPPORTER_CODE || '').trim().toUpperCase();
  if (envSupporterCode && normalised === envSupporterCode) {
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS 처리 (필요시)
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

  const { code, email } = req.body || {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: '인증 코드를 입력해 주세요.' });
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: '올바른 구글 이메일 계정이 필요합니다.' });
  }

  const normalisedCode = code.trim().toUpperCase();
  const normalisedEmail = email.trim().toLowerCase();

  // 1. 코드 유효성 및 티어 판별
  const tier = parseTierFromCode(normalisedCode);
  if (!tier) {
    return res.status(400).json({ error: '유효하지 않은 인증 코드입니다.' });
  }

  // 2. 티어에 따른 최대 기기(계정) 등록 수 제한
  // basic, allinone -> 1대 / couple -> 2대
  const maxAllowed = tier === 'couple' ? 2 : 1;

  // Vercel KV 연동 여부 확인 및 REDIS_URL 자동 파싱 폴백
  let kvUrl = process.env.KV_REST_API_URL;
  let kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        // 형식: redis://default:token@host:port
        const match = redisUrl.match(/^rediss?:\/\/(?:([^:]+):)?([^@]+)@([^:]+):(\d+)$/);
        if (match) {
          const password = match[2];
          const host = match[3];
          kvUrl = `https://${host}`;
          kvToken = password;
          console.log('Successfully parsed KV REST API configuration from REDIS_URL.');
        }
      } catch (err) {
        console.error('Failed to parse REDIS_URL for KV fallback:', err);
      }
    }
  }

  if (!kvUrl || !kvToken) {
    console.warn('Vercel KV environment variables are not set. Falling back to offline authentication.');
    // KV 데이터베이스 정보가 없는 로컬 등 오프라인 상태일 때는 중복 검사 없이 티어를 허용함 (Fallback)
    return res.status(200).json({
      success: true,
      tier,
      message: 'Offline verification successful (Database configuration missing).',
    });
  }

  try {
    const key = `sponsorship:${normalisedCode}`;

    // Redis GET 요청
    const getRes = await fetch(kvUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', key]),
    });

    if (!getRes.ok) {
      throw new Error(`Failed to query KV store: ${getRes.statusText}`);
    }

    const getData = await getRes.json();
    let emails: string[] = [];

    if (getData.result) {
      try {
        const parsed = JSON.parse(getData.result);
        if (Array.isArray(parsed)) {
          emails = parsed.map((e: string) => e.trim().toLowerCase());
        }
      } catch (err) {
        console.error('Failed to parse active emails from KV:', err);
      }
    }

    // 이미 등록된 구글 계정이면 통과 (기기 기동 시 재로그인 혹은 중복 등록 허용)
    if (emails.includes(normalisedEmail)) {
      return res.status(200).json({
        success: true,
        tier,
        message: '기기 재인증 성공',
      });
    }

    // 허용 수량 제한 체크
    if (emails.length >= maxAllowed) {
      return res.status(400).json({
        error: '이미 다른 구글 계정에서 사용 중이거나, 해당 코드의 활성화 허용 대수(제한)를 초과했습니다.',
        limitExceeded: true,
      });
    }

    // 신규 등록 가능하므로 배열에 추가 후 Redis에 업데이트
    emails.push(normalisedEmail);

    const setRes = await fetch(kvUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', key, JSON.stringify(emails)]),
    });

    if (!setRes.ok) {
      throw new Error(`Failed to update KV store: ${setRes.statusText}`);
    }

    return res.status(200).json({
      success: true,
      tier,
      message: '인증 완료 및 기기 등록 성공',
    });

  } catch (error) {
    console.error('Database verification error:', error);
    // 데이터베이스 조회 시 네트워크 장애 등 발생 시, 사용자 사용성을 극대화하기 위해 오프라인 활성화 성공으로 Fallback 처리
    return res.status(200).json({
      success: true,
      tier,
      message: '인증 완료 (Database fallback activated)',
    });
  }
}
