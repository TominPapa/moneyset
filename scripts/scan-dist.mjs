// scan-dist.mjs — 빌드 결과물(dist)에 인증 코드·비밀값이 들어갔는지 검사한다.
//
// 소스 검사(secretLeak.test.ts)는 코드 참조 경로만 막는다. vite.config 의 define,
// index.html 치환, 다른 파일 형식 등 어떤 경로로 들어갔든 최종 산출물에서 잡아내는
// 마지막 방어선이다. 발견하면 빌드를 실패시켜 배포 자체를 막는다.
// 값은 절대 출력하지 않는다 (빌드 로그도 노출될 수 있으므로).

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

function readLocalEnv() {
  // 로컬 빌드에서는 .env 값을, Vercel 빌드에서는 프로젝트 환경변수를 기준으로 삼는다
  const out = {};
  if (!existsSync('.env')) return out;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...readLocalEnv(), ...process.env };

function codeKeys(raw) {
  if (!raw) return [];
  try {
    let s = raw.trim();
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) s = s.slice(1, -1);
    const p = JSON.parse(s);
    return Array.isArray(p) ? p.map((x) => String(x.code)) : Object.keys(p);
  } catch { return []; }
}

// ACCESS_CODES 가 설정돼 있는데 코드가 하나도 파싱되지 않으면 오타다.
// 서버는 이 경우 모든 코드 인증을 거부하므로(fail-closed), 배포 전에 여기서 막는다.
if ((env.ACCESS_CODES || '').trim() && codeKeys(env.ACCESS_CODES).length === 0) {
  console.error('');
  console.error('[scan-dist] ✖ ACCESS_CODES 가 설정돼 있지만 JSON 을 해석할 수 없습니다. 배포를 중단합니다.');
  console.error('            형식: {"MS-AIO-XXXXX-XXXXX":"allinone", ...}');
  console.error('');
  process.exit(1);
}

const secrets = [
  ...codeKeys(env.ACCESS_CODES),
  ...codeKeys(env.VITE_ACCESS_CODES),
  env.SUPPORTER_CODE, env.VITE_SUPPORTER_CODE, env.ADMIN_SECRET,
]
  .filter((v) => typeof v === 'string' && v.trim().length >= 6)
  .map((v) => v.trim().toUpperCase());

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

if (!existsSync(DIST)) {
  console.error('[scan-dist] dist 폴더가 없습니다. vite build 이후에 실행하세요.');
  process.exit(1);
}

const CODE_PATTERN = /MS-(AIO|BSC|CPL)-[A-Z0-9][A-Z0-9-]{4,}/g;
let patternHits = 0;
let valueHits = 0;
const hitFiles = new Set();

for (const f of files(DIST)) {
  if (!/\.(js|mjs|css|html|json|map|txt|svg)$/i.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  const upper = text.toUpperCase();
  // 입력창 예시(MS-AIO-XXXXXX 처럼 X 로만 된 자리표시)는 제외한다.
  // 실제 코드는 아래 값 대조 검사가 별도로 잡으므로 이 예외로 누락되지 않는다.
  const m = (text.match(CODE_PATTERN) || []).filter((s) => !/^MS-(AIO|BSC|CPL)-[X-]+$/.test(s));
  if (m.length) { patternHits += m.length; hitFiles.add(f); }
  for (const s of secrets) {
    if (upper.includes(s)) { valueHits++; hitFiles.add(f); }
  }
}

if (patternHits || valueHits) {
  console.error('');
  console.error('[scan-dist] ✖ 빌드 결과물에 인증 코드 또는 비밀값이 포함되어 있습니다. 배포를 중단합니다.');
  console.error(`            코드 형식 일치 ${patternHits}건, 비밀값 일치 ${valueHits}건`);
  console.error(`            파일: ${[...hitFiles].join(', ')}`);
  console.error('            클라이언트 코드가 import.meta.env.VITE_* 로 비밀값을 참조하는지 확인하세요.');
  console.error('');
  process.exit(1);
}

console.log(`[scan-dist] ✓ 비밀값 노출 없음 (검사한 비밀값 ${secrets.length}개)`);
