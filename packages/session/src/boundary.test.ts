import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

const SOURCE_DIR = new URL('.', import.meta.url).pathname;
const runtimeFiles = readdirSync(SOURCE_DIR).filter(
  (file) =>
    file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'testing.ts'
);

describe('portable entry points', () => {
  it('keep the test issuer on its own test-only entry point', () => {
    const { './testing': testing, ...runtime } = packageJson.exports;
    expect(testing).toBe('./src/testing.ts');
    const targets = Object.values(runtime);
    for (const target of targets) {
      expect(runtimeFiles).toContain(target.replace('./src/', ''));
    }
  });

  it.each(runtimeFiles)(
    '%s imports only relative modules and type-only effect',
    (file) => {
      const source = readFileSync(join(SOURCE_DIR, file), 'utf8');
      const imports = [
        ...source.matchAll(
          /^\s*(import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm
        ),
      ];
      for (const [, , typeOnly, specifier = ''] of imports) {
        if (specifier.startsWith('./')) continue;
        expect({ file, specifier, typeOnly: Boolean(typeOnly) }).toEqual({
          file,
          specifier: 'effect',
          typeOnly: true,
        });
      }
      expect(source).not.toMatch(/\bimport\s*\(/);
    }
  );

  it.each(runtimeFiles)(
    '%s reads no request globals, network or signing material',
    (file) => {
      const source = readFileSync(join(SOURCE_DIR, file), 'utf8');
      for (const forbidden of [
        /\bfetch\s*\(/,
        /\bprocess\.env\b/,
        /\bglobalThis\b/,
        /\bcaches\b/,
        /\bnext\//,
        /cloudflare:/,
        /\bheaders\s*\(\s*\)/,
        /crypto\.subtle\.(sign|generateKey|importKey)\s*\(\s*\{\s*name:\s*'ECDSA'/,
      ]) {
        expect(source, `${file} matches ${forbidden}`).not.toMatch(forbidden);
      }
    }
  );
});
