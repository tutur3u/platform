import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

const SRC = new URL('.', import.meta.url).pathname;
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const ALLOWED = /^(?:\.\/[^/]+$|kysely$|@tuturuuu\/authz(?:\/scope)?$)/;

const sources = readdirSync(SRC).filter(
  (file) => file.endsWith('.ts') && !file.endsWith('.test.ts')
);

describe('@tuturuuu/data stays framework-free', () => {
  it('depends only on kysely and @tuturuuu/authz', () => {
    expect(Object.keys(packageJson.dependencies).sort()).toEqual([
      '@tuturuuu/authz',
      'kysely',
    ]);
  });

  it.each(sources)('%s imports only siblings, kysely and authz', (file) => {
    const text = readFileSync(join(SRC, file), 'utf8');
    for (const match of text.matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      expect(specifier, `${file} imports ${specifier}`).toMatch(ALLOWED);
    }
    expect(text).not.toMatch(
      /\bprocess\.env\b|\bglobalThis\.(fetch|caches)\b|\.prepare\s*\(|\.exec\s*\(/
    );
  });

  it('keeps the executor out of the public entry point', () => {
    const index = readFileSync(join(SRC, 'index.ts'), 'utf8');
    expect(index).not.toMatch(
      /internalsOf|createBuilder|guardedCompiler|assertScoped/
    );
  });
});
