// Regression lock: satellite proxies negotiate Accept-Language through the
// shared guarded helper. `@formatjs/intl-localematcher`'s `match` throws on
// `*` and malformed tags, which made unguarded copies answer 500.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..');
const MIGRATED = [
  'cms',
  'drive',
  'finance',
  'nova',
  'rewise',
  'tasks',
  'track',
];
const proxies = readdirSync(join(root, 'apps'))
  .map((app) => [app, join(root, 'apps', app, 'src', 'proxy.ts')])
  .filter(([, path]) => existsSync(path));

test('migrated satellites use the shared guarded helper', () => {
  for (const app of MIGRATED) {
    const source = readFileSync(
      join(root, 'apps', app, 'src', 'proxy.ts'),
      'utf8'
    );
    assert.match(
      source,
      /negotiateAcceptLanguage\(/u,
      `${app} must use negotiateAcceptLanguage`
    );
    assert.doesNotMatch(
      source,
      /from 'negotiator'/u,
      `${app} must not negotiate on its own`
    );
  }
});

test('no satellite proxy passes uncanonicalized Negotiator languages to match', () => {
  for (const [app, path] of proxies) {
    const source = readFileSync(path, 'utf8');
    if (!/new Negotiator\(/u.test(source)) continue;
    assert.ok(
      // Canonicalizing each range (inside try/catch) drops `*` and malformed tags.
      source.includes('getCanonicalLocales'),
      `${app}/src/proxy.ts negotiates Accept-Language without dropping '*' and malformed tags; use @tuturuuu/satellite/accept-language`
    );
  }
});
