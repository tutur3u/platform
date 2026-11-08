import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = join(__dirname, '..', '..');
const SRC_ROOT = join(APP_ROOT, 'src');
const APP_DIR = join(SRC_ROOT, 'app');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function toPosix(path: string) {
  return path.split(sep).join('/');
}

const sourceFiles = walk(SRC_ROOT)
  .filter((path) => /\.(?:ts|tsx|js|jsx|mjs)$/.test(path))
  .filter((path) => !/\.test\.tsx?$/.test(path));

function routePath(file: string) {
  const dir = toPosix(relative(APP_DIR, file)).split('/').slice(0, -1);
  return `/${dir.join('/')}`;
}

describe('playground route surface', () => {
  it('serves exactly the inventoried pages', () => {
    const pages = walk(APP_DIR)
      .filter((path) => /\/page\.(?:tsx|ts|jsx|js)$/.test(toPosix(path)))
      .map(routePath)
      .sort();

    expect(pages).toEqual(['/', '/tool-calling']);
  });

  it('serves exactly the inventoried local route handlers', () => {
    const handlers = walk(APP_DIR)
      .filter((path) => /\/route\.(?:ts|js)$/.test(toPosix(path)))
      .map(routePath)
      .sort();

    expect(handlers).toEqual([
      '/api/ai/object-generation',
      '/api/ai/tool-calling',
      '/api/build-info',
    ]);
  });

  it('keeps one root layout and the shared error boundaries', () => {
    const special = walk(APP_DIR)
      .map((path) => toPosix(relative(APP_DIR, path)))
      .filter((path) =>
        /(?:^|\/)(?:layout|error|global-error|not-found|loading|template|default)\.tsx?$/.test(
          path
        )
      )
      .sort();

    expect(special).toEqual(['error.tsx', 'global-error.tsx', 'layout.tsx']);
  });

  it('has no catch-all or dynamic segments that could shadow proxied /api paths', () => {
    const dynamicSegments = walk(APP_DIR)
      .map((path) => toPosix(relative(APP_DIR, path)))
      .filter((path) => path.includes('['));

    expect(dynamicSegments).toEqual([]);
  });

  it('declares no server actions', () => {
    const withServerActions = sourceFiles.filter((path) =>
      /^\s*['"]use server['"]/m.test(readFileSync(path, 'utf8'))
    );

    expect(withServerActions).toEqual([]);
  });
});

/**
 * The playground evaluates no user-supplied code. Any of these primitives
 * would introduce an execution or cross-origin trust boundary that must be
 * designed and contract-tested before it ships, on either framework.
 */
const EXECUTION_PRIMITIVES: Array<[string, RegExp]> = [
  ['iframe element', /<iframe\b/i],
  ['srcdoc attribute', /\bsrcDoc\b|\bsrcdoc\b/],
  ['postMessage', /\bpostMessage\s*\(/],
  ['message event listener', /addEventListener\(\s*['"]message['"]/],
  ['onmessage handler', /\bonmessage\b/],
  ['web or shared worker', /\bnew\s+(?:Shared)?Worker\s*\(/],
  ['service worker registration', /serviceWorker\s*\.\s*register/],
  ['eval', /(?<![\w.])eval\s*\(/],
  ['Function constructor', /\bnew\s+Function\s*\(/],
  ['string timer', /\bset(?:Timeout|Interval)\s*\(\s*['"`]/],
  ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
  ['node child_process', /['"](?:node:)?child_process['"]/],
  ['node vm', /['"](?:node:)?vm['"]/],
  ['window.open', /\bwindow\s*\.\s*open\s*\(/],
  ['document.domain', /document\s*\.\s*domain/],
];

describe('playground isolation: no execution surface', () => {
  it.each(EXECUTION_PRIMITIVES)('does not use %s', (_name, pattern) => {
    const offenders = sourceFiles
      .filter((path) => pattern.test(readFileSync(path, 'utf8')))
      .map((path) => toPosix(relative(APP_ROOT, path)));

    expect(offenders).toEqual([]);
  });

  it('only fetches same-origin relative /api paths from client code', () => {
    const clientFiles = sourceFiles.filter((path) =>
      /^\s*['"]use client['"]/m.test(readFileSync(path, 'utf8'))
    );
    const fetchTargets = clientFiles.flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/\bfetch\(\s*([^,)]+)/g)].map(
        (match) => match[1]?.trim()
      )
    );

    expect(fetchTargets.sort()).toEqual([
      "'/api/ai/object-generation'",
      "'/api/ai/tool-calling'",
    ]);
  });

  it('reads no server secrets from client code', () => {
    const clientEnvReads = sourceFiles
      .filter((path) =>
        /^\s*['"]use client['"]/m.test(readFileSync(path, 'utf8'))
      )
      .flatMap((path) =>
        [...readFileSync(path, 'utf8').matchAll(/process\.env\.(\w+)/g)].map(
          (match) => match[1]
        )
      )
      .filter((name) => !name?.startsWith('NEXT_PUBLIC_'));

    expect(clientEnvReads).toEqual([]);
  });
});
