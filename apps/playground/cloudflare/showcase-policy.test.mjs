import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const app = fileURLToPath(new URL('../', import.meta.url));
const packages = resolve(app, '../../packages');
function resolveSource(file, specifier) {
  let base;
  if (specifier.startsWith('.')) base = resolve(dirname(file), specifier);
  else if (specifier.startsWith('@/'))
    base = join(app, 'src', specifier.slice(2));
  else if (specifier.startsWith('@tuturuuu/')) {
    const [name, ...parts] = specifier.slice(10).split('/');
    const manifest = JSON.parse(
      readFileSync(join(packages, name, 'package.json'), 'utf8')
    );
    const exported =
      manifest.exports?.[parts.length ? './' + parts.join('/') : '.'];
    base =
      typeof exported === 'string'
        ? join(packages, name, exported)
        : join(packages, name, 'src', ...parts);
  } else return null;
  return (
    [
      base,
      ...['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'].map(
        (x) => base + x
      ),
    ].find(
      (candidate) =>
        existsSync(candidate) && /\.(?:[cm]?[jt]sx?)$/.test(candidate)
    ) ?? null
  );
}
function sourceFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const name = join(path, entry.name);
    return entry.isDirectory()
      ? sourceFiles(name)
      : /\.[jt]sx?$/.test(name) && !name.includes('.test.')
        ? [name]
        : [];
  });
}
function problems(file, source) {
  const errors = [];
  if (
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|caches)\b/.test(
      source
    )
  )
    errors.push('network/storage');
  if (
    /\b(?:eval|Function)\s*\(|dangerouslySetInnerHTML|document\.cookie|navigator\.sendBeacon|serviceWorker/.test(
      source
    )
  )
    errors.push('unsafe capability');
  if (
    /['"][^'"]*(?:supabase|\/auth(?:\/|['"])|app-session|server-only|next\/headers)[^'"]*['"]/.test(
      source
    )
  )
    errors.push('auth/data import');
  return errors.map((error) => file + ': ' + error);
}
test('demo import graph has no network, storage, session or unsafe execution', () => {
  const pending = [
    ...sourceFiles(join(app, 'src/components/showcase')),
    ...sourceFiles(join(app, 'src/lib/showcase')),
  ];
  assert.ok(pending.length >= 6, 'Must inspect implemented demo sources');
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    assert.deepEqual(problems(file, source), []);
    for (const match of source.matchAll(
      /(?:from\s*|import\s*\(|export\s*\*\s*from\s*)['"]([^'"]+)['"]/g
    )) {
      const child = resolveSource(file, match[1]);
      if (child) pending.push(child);
    }
  }
  assert.ok(visited.size >= 6);
});
test('capability guard rejects representative forbidden code', () => {
  for (const source of [
    'fetch("/api")',
    'const send = fetch',
    'globalThis["fetch"]("/api")',
    'localStorage.getItem("web")',
    'new WebSocket("wss://example.invalid")',
    'new Function("return 1")',
    'document.cookie',
    'dangerouslySetInnerHTML',
    'import { createClient } from "@tuturuuu/supabase"',
  ])
    assert.ok(problems('mutation', source).length > 0, source);
});
