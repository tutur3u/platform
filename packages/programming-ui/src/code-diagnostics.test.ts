import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import { expect, it } from 'vitest';
import {
  CHECK_LIMITS,
  checkSize,
  checkHash,
  checkRefusal,
  diagnosticsProvider,
  MARKER_SEVERITY,
  markersByPath,
  toCheckMarker,
  withinCheckLimits,
} from './code-diagnostics';

it('has a Monaco tokenizer registered under every runtime id the editor passes', () => {
  const entry = createRequire(import.meta.url).resolve('monaco-editor');
  const root = entry.slice(
    0,
    entry.lastIndexOf('monaco-editor') + 'monaco-editor'.length
  );
  const definitions = path.join(root, 'esm/vs/languages/definitions');
  const ids = new Set(
    readdirSync(definitions, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const source = readFileSync(
          path.join(definitions, entry.name, 'register.js'),
          'utf8'
        );
        return [...source.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
      })
  );
  for (const language of PLAYGROUND_LANGUAGES) expect(ids).toContain(language);
});

it('picks the browser worker for scripts and the room checker for compiled languages', () => {
  expect(diagnosticsProvider('typescript', false)).toBe('script');
  expect(diagnosticsProvider('javascript', true)).toBe('script');
  for (const language of ['c', 'cpp', 'java'] as const) {
    expect(diagnosticsProvider(language, true)).toBe('remote');
    expect(diagnosticsProvider(language, false)).toBeNull();
  }
  expect(diagnosticsProvider('python', true)).toBeNull();
  expect(diagnosticsProvider(undefined, true)).toBeNull();
});

it('hashes the language, paths and contents, and nothing else', () => {
  const files = [{ path: 'main.c', content: 'int main(){}' }];
  expect(checkHash('c', files)).toBe(checkHash('c', [{ ...files[0]! }]));
  expect(checkHash('c', files)).not.toBe(checkHash('cpp', files));
  expect(checkHash('c', files)).not.toBe(
    checkHash('c', [{ path: 'main.c', content: 'int main(){ }' }])
  );
  expect(checkHash('c', [{ path: 'ab', content: 'c' }])).not.toBe(
    checkHash('c', [{ path: 'a', content: 'bc' }])
  );
});

it('keeps checks within the file count and size limits', () => {
  const file = (content: string, index = 0) => ({
    path: `f${index}.c`,
    content,
  });
  expect(withinCheckLimits([file('x')])).toBe(true);
  expect(withinCheckLimits([])).toBe(false);
  expect(checkSize([])).toBe('empty');
  expect(checkSize([file('x')])).toBe('ok');
  expect(
    checkSize([{ path: 'p'.repeat(CHECK_LIMITS.pathLength + 1), content: 'x' }])
  ).toBe('large');
  expect(
    checkSize([{ path: 'p'.repeat(CHECK_LIMITS.pathLength), content: 'x' }])
  ).toBe('ok');
  expect(
    withinCheckLimits(
      Array.from({ length: CHECK_LIMITS.files + 1 }, (_, i) => file('x', i))
    )
  ).toBe(false);
  expect(
    withinCheckLimits([file('x'.repeat(CHECK_LIMITS.fileBytes + 1))])
  ).toBe(false);
  const half = 'x'.repeat(110 * 1024);
  expect(withinCheckLimits([file(half, 0), file(half, 1)])).toBe(false);
});

it('maps 1-based compiler positions straight onto Monaco positions', () => {
  expect(
    toCheckMarker({
      path: 'main.c',
      line: 3,
      column: 5,
      endLine: 3,
      endColumn: 9,
      severity: 'error',
      message: "expected ';'",
      code: 'E1',
      source: 'gcc',
    })
  ).toEqual({
    startLineNumber: 3,
    startColumn: 5,
    endLineNumber: 3,
    endColumn: 9,
    severity: MARKER_SEVERITY.error,
    message: "expected ';'",
    code: 'E1',
    source: 'gcc',
  });
  // No end: Monaco widens the empty range to the word. Bad values clamp to the start.
  expect(
    toCheckMarker({
      path: 'Main.java',
      line: 0,
      column: 2,
      endLine: 0,
      endColumn: 1,
      severity: 'warning',
      message: 'unchecked',
      source: 'javac',
    })
  ).toMatchObject({
    startLineNumber: 1,
    startColumn: 2,
    endLineNumber: 1,
    endColumn: 2,
    severity: MARKER_SEVERITY.warning,
  });
});

it('groups markers per checked file and clears files without problems', () => {
  const byPath = markersByPath(
    [
      { path: 'a.cpp', content: '' },
      { path: 'b.cpp', content: '' },
    ],
    [
      {
        path: 'a.cpp',
        line: 1,
        column: 1,
        severity: 'info',
        message: 'note',
        source: 'g++',
      },
      {
        path: 'gone.cpp',
        line: 1,
        column: 1,
        severity: 'error',
        message: 'x',
        source: 'g++',
      },
    ]
  );
  expect([...byPath.keys()]).toEqual(['a.cpp', 'b.cpp']);
  expect(byPath.get('a.cpp')).toHaveLength(1);
  expect(byPath.get('b.cpp')).toEqual([]);
});

it('reads the check refusal envelope and treats a missing endpoint as unsupported', () => {
  const refused = (status: number, code?: string, retryAfter?: number) =>
    Object.assign(new Error('api'), { status, code, retryAfter });
  expect(checkRefusal(refused(503, 'PLAYGROUND_WARMING', 2))).toEqual({
    kind: 'warming',
    retryAfterSeconds: 2,
  });
  expect(checkRefusal(refused(429, 'PLAYGROUND_BUSY', 4))).toEqual({
    kind: 'busy',
    retryAfterSeconds: 4,
  });
  expect(checkRefusal(refused(429, 'PLAYGROUND_QUOTA', 120))).toEqual({
    kind: 'quota',
    retryAfterSeconds: 120,
  });
  expect(checkRefusal(refused(503, 'PLAYGROUND_UNAVAILABLE')).kind).toBe(
    'unavailable'
  );
  expect(checkRefusal(refused(409, 'PLAYGROUND_SUPERSEDED')).kind).toBe(
    'superseded'
  );
  expect(checkRefusal(refused(409, 'PLAYGROUND_REQUEST_CONFLICT')).kind).toBe(
    'conflict'
  );
  for (const status of [404, 405])
    expect(checkRefusal(refused(status)).kind).toBe('unsupported');
  // Only a 400 that names the language is unsupported; any other is transient.
  expect(checkRefusal(refused(400)).kind).toBe('failed');
  expect(
    checkRefusal(
      Object.assign(new Error('Unsupported language'), { status: 400 })
    ).kind
  ).toBe('unsupported');
  expect(checkRefusal(new DOMException('stopped', 'AbortError')).kind).toBe(
    'aborted'
  );
  expect(checkRefusal(refused(500)).kind).toBe('failed');
});
