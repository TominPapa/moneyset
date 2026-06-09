import { Redis } from 'ioredis';

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

const HARDCODED_ACCESS_CODES: Record<string, UserTier> = {
  "MS-BSC-AYFUZ2": "basic",
  "MS-BSC-ESVTDT": "basic",
  "MS-BSC-IDBDR9": "basic",
  "MS-BSC-MK81JL": "basic",
  "MS-BSC-MQRAOY": "basic",
  "MS-BSC-QGMBCW": "basic",
  "MS-BSC-Y0MVTU": "basic",
  "MS-BSC-Y0WCKJ": "basic",
  "MS-BSC-YT8683": "basic",
  "MS-BSC-YVUQYT": "basic",
  "MS-AIO-01BDMJ": "allinone",
  "MS-AIO-0OWL74": "allinone",
  "MS-AIO-0Y3QZ6": "allinone",
  "MS-AIO-1F1JGE": "allinone",
  "MS-AIO-1IFNE7": "allinone",
  "MS-AIO-2FXXQM": "allinone",
  "MS-AIO-2IZIXZ": "allinone",
  "MS-AIO-2UVAU5": "allinone",
  "MS-AIO-3NLVSI": "allinone",
  "MS-AIO-3UJ7TV": "allinone",
  "MS-AIO-4ICB45": "allinone",
  "MS-AIO-4L4S2Y": "allinone",
  "MS-AIO-5AKK7B": "allinone",
  "MS-AIO-5BBHD4": "allinone",
  "MS-AIO-5J4FNE": "allinone",
  "MS-AIO-5NLM46": "allinone",
  "MS-AIO-5UTUFQ": "allinone",
  "MS-AIO-5XNSTE": "allinone",
  "MS-AIO-6LM1YF": "allinone",
  "MS-AIO-746OXR": "allinone",
  "MS-AIO-7LPBEJ": "allinone",
  "MS-AIO-7NOA4Q": "allinone",
  "MS-AIO-7YWJZM": "allinone",
  "MS-AIO-8BRJTA": "allinone",
  "MS-AIO-8CWDKN": "allinone",
  "MS-AIO-8HODRP": "allinone",
  "MS-AIO-8IZTZO": "allinone",
  "MS-AIO-93D8BD": "allinone",
  "MS-AIO-9GA9AK": "allinone",
  "MS-AIO-9S86BW": "allinone",
  "MS-AIO-ABOOE4": "allinone",
  "MS-AIO-B02WOB": "allinone",
  "MS-AIO-BLN2AL": "allinone",
  "MS-AIO-DF9OFJ": "allinone",
  "MS-AIO-E3TX82": "allinone",
  "MS-AIO-EL9BYE": "allinone",
  "MS-AIO-EX7SBQ": "allinone",
  "MS-AIO-F2GO5Y": "allinone",
  "MS-AIO-FC82TT": "allinone",
  "MS-AIO-FFG6OE": "allinone",
  "MS-AIO-G5GAR8": "allinone",
  "MS-AIO-G74J7H": "allinone",
  "MS-AIO-GJC1FS": "allinone",
  "MS-AIO-GP2TGE": "allinone",
  "MS-AIO-GQL441": "allinone",
  "MS-AIO-H9P1ZK": "allinone",
  "MS-AIO-I0MGXV": "allinone",
  "MS-AIO-ILU131": "allinone",
  "MS-AIO-INAURT": "allinone",
  "MS-AIO-IO75O0": "allinone",
  "MS-AIO-JENCZC": "allinone",
  "MS-AIO-K24LRX": "allinone",
  "MS-AIO-K5DCT4": "allinone",
  "MS-AIO-KVCJ6M": "allinone",
  "MS-AIO-LKWINJ": "allinone",
  "MS-AIO-LMDZUK": "allinone",
  "MS-AIO-MRDZ9S": "allinone",
  "MS-AIO-N42NU8": "allinone",
  "MS-AIO-N7JVB7": "allinone",
  "MS-AIO-NGHB9J": "allinone",
  "MS-AIO-NJWTIL": "allinone",
  "MS-AIO-NQW06V": "allinone",
  "MS-AIO-NVZIXD": "allinone",
  "MS-AIO-O7R57Y": "allinone",
  "MS-AIO-OCR4X5": "allinone",
  "MS-AIO-OJDD18": "allinone",
  "MS-AIO-OM3X8R": "allinone",
  "MS-AIO-OOARGL": "allinone",
  "MS-AIO-P1L5IF": "allinone",
  "MS-AIO-P4D4EH": "allinone",
  "MS-AIO-P7RK4P": "allinone",
  "MS-AIO-PCPWA4": "allinone",
  "MS-AIO-PNNRZU": "allinone",
  "MS-AIO-R9BZG8": "allinone",
  "MS-AIO-S58P7O": "allinone",
  "MS-AIO-TE6XB9": "allinone",
  "MS-AIO-TEJXLP": "allinone",
  "MS-AIO-TH8K2W": "allinone",
  "MS-AIO-UDOARG": "allinone",
  "MS-AIO-VIOEA6": "allinone",
  "MS-AIO-VXJQHL": "allinone",
  "MS-AIO-W4F7OC": "allinone",
  "MS-AIO-WJRSVU": "allinone",
  "MS-AIO-WNEDJD": "allinone",
  "MS-AIO-X2TVUY": "allinone",
  "MS-AIO-XGN0DN": "allinone",
  "MS-AIO-Y1Y4CS": "allinone",
  "MS-AIO-YMKIA5": "allinone",
  "MS-AIO-YSG5UG": "allinone",
  "MS-AIO-Z5LH1B": "allinone",
  "MS-CPL-3C59PH": "couple",
  "MS-CPL-AA0VVT": "couple",
  "MS-CPL-AZQ7EZ": "couple",
  "MS-CPL-DMXH76": "couple",
  "MS-CPL-E8T0TC": "couple",
  "MS-CPL-I07UBD": "couple",
  "MS-CPL-L5145J": "couple",
  "MS-CPL-SRQBG5": "couple",
  "MS-CPL-VYEJ5X": "couple",
  "MS-CPL-WLFR3Y": "couple"
};

function loadCodeMap(): Record<string, UserTier> {
  const map: Record<string, UserTier> = { ...HARDCODED_ACCESS_CODES };

  try {
    let raw = process.env.VITE_ACCESS_CODES;
    if (raw) {
      raw = raw.trim();
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
    }
  } catch (err) {
    console.error('Error parsing VITE_ACCESS_CODES in API:', err);
  }

  return map;
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

  // 어드민 리셋 기능 (테스트 데이터 전체 초기화)
  if (req.body && req.body.action === 'ADMIN_RESET') {
    const adminCode = (req.body.code || '').trim().toUpperCase();
    const envSupporterCode = (process.env.VITE_SUPPORTER_CODE || '').trim().toUpperCase();
    if (!envSupporterCode || adminCode !== envSupporterCode) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const client = new Redis(redisUrl, { connectTimeout: 5000, maxRetriesPerRequest: 1 });
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
      redisClient = new Redis(redisUrl, {
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
      });
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

  // C. DB에 연결할 수 없는 경우 (로컬 개발 환경 혹은 장애) 오프라인 폴백 허용
  if (!isDbSuccess) {
    console.warn('All database connections failed or not configured. Falling back to offline check.');
    return res.status(200).json({
      success: true,
      tier,
      message: '인증 완료 (Database offline fallback activated)',
    });
  }

  // 4. 인증 논리 판단
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
    // 업데이트가 정상 수행되지 않았을 경우도 사용자 가용성을 우선해 성공으로 폴백
    console.warn('Failed to update DB, falling back to successful activation.');
  }

  return res.status(200).json({
    success: true,
    tier,
    message: '인증 완료 및 기기 등록 성공',
  });
}
