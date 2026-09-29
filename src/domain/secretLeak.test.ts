// secretLeak.test.ts — 클라이언트 번들로 비밀값이 새는 것을 막는 회귀 방지 테스트
//
// 배경: Vite 는 클라이언트 코드에서 참조한 import.meta.env.VITE_* 값을 공개 JS 번들에
// 문자열 그대로 박아 넣는다. 2026-06-09 에 인증 코드 검증을 서버 전용으로 옮겼으나,
// 이후 클라이언트 코드에 다시 들어가면서 인증 코드가 누구나 읽을 수 있는 번들에 노출됐다.
// 같은 실수가 반복되지 않도록 이 테스트가 막는다.
//
// 검사 방식: 주석·문자열에 걸리지 않도록 TypeScript AST 로 실제 코드 참조만 찾는다.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

/** 클라이언트에서 참조해도 되는 환경변수 — 공개돼도 안전한 값만 둔다.
 *  새 변수를 추가하려면 "번들에 공개돼도 괜찮은가?"를 먼저 판단할 것. */
const ALLOWED_CLIENT_ENV = new Set([
  'VITE_GOOGLE_CLIENT_ID', // OAuth 클라이언트 ID — 설계상 공개 값
  'DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR', // Vite 내장
]);

function listClientSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listClientSources(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function isImportMetaEnv(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'env' &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

interface Finding { file: string; line: number; detail: string }

function scan(file: string): Finding[] {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const visit = (node: ts.Node) => {
    if (isImportMetaEnv(node)) {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
        // import.meta.env.NAME
        const name = parent.name.text;
        if (!ALLOWED_CLIENT_ENV.has(name)) {
          findings.push({ file, line: at(parent), detail: `import.meta.env.${name}` });
        }
      } else if (ts.isElementAccessExpression(parent) && parent.expression === node) {
        // import.meta.env['NAME'] 또는 동적 키 — 어떤 값이 번들에 들어갈지 정적으로 알 수 없다
        findings.push({ file, line: at(parent), detail: `import.meta.env[${parent.argumentExpression.getText(sf)}]` });
      } else {
        // import.meta.env 를 객체째 사용 → 모든 VITE_* 값이 번들에 포함된다
        findings.push({ file, line: at(node), detail: 'import.meta.env 를 객체째 사용' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

describe('클라이언트 번들 비밀값 유출 방지', () => {
  const files = listClientSources(SRC_DIR);

  it('검사 대상 클라이언트 소스를 찾는다', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('클라이언트 코드는 허용 목록 밖의 환경변수를 참조하지 않는다', () => {
    const findings = files.flatMap(scan);
    const report = findings.map((f) => `${relative(SRC_DIR, f.file)}:${f.line}  ${f.detail}`);
    expect(
      report,
      '클라이언트에서 참조한 환경변수는 공개 JS 번들에 그대로 노출된다. ' +
      '인증 코드·관리자 비밀값은 서버(api/) 에서만 읽을 것.',
    ).toEqual([]);
  });

  it('탐지기 자체 검증 — 금지된 참조를 실제로 잡아낸다', () => {
    const tmp = ts.createSourceFile(
      'probe.ts',
      [
        '// 주석 속 import.meta.env.VITE_ACCESS_CODES 는 무시',
        "const s = 'import.meta.env.VITE_SUPPORTER_CODE'; // 문자열도 무시",
        'const a = import.meta.env.VITE_ACCESS_CODES;',
        "const b = import.meta.env['ADMIN_SECRET'];",
        'const c = { ...import.meta.env };',
        'const ok = import.meta.env.VITE_GOOGLE_CLIENT_ID;',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
    );
    const found: string[] = [];
    const visit = (n: ts.Node) => {
      if (isImportMetaEnv(n)) {
        const p = n.parent;
        if (ts.isPropertyAccessExpression(p) && p.expression === n) {
          if (!ALLOWED_CLIENT_ENV.has(p.name.text)) found.push(p.name.text);
        } else if (ts.isElementAccessExpression(p) && p.expression === n) {
          found.push('element');
        } else {
          found.push('object');
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(tmp);
    expect(found).toEqual(['VITE_ACCESS_CODES', 'element', 'object']);
  });
});
