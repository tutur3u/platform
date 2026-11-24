import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

const SRC = new URL('.', import.meta.url).pathname;
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const sources = readdirSync(SRC).filter(
  (file) => file.endsWith('.ts') && !file.endsWith('.test.ts')
);

describe('@tuturuuu/authz stays framework-free', () => {
  it('has no runtime dependencies', () => {
    expect(
      (packageJson as { dependencies?: Record<string, string> }).dependencies
    ).toBeUndefined();
  });

  it.each(sources)('%s imports only sibling modules', (file) => {
    const text = readFileSync(join(SRC, file), 'utf8');
    for (const match of text.matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\//);
    }
    expect(text).not.toMatch(/\bprocess\.env\b|\bglobalThis\.(fetch|caches)\b/);
  });
});
