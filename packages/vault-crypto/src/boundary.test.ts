import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ALLOWED = new Set([
  '@hpke/core',
  '@hpke/dhkem-x25519',
  '@noble/curves/ed25519.js',
  '@noble/hashes/hmac.js',
  '@noble/hashes/sha2.js',
  'cborg',
]);

describe('portable entrypoint', () => {
  it('imports only the pinned crypto libraries and local modules', () => {
    const dir = __dirname;
    const sources = readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
    );
    for (const file of sources) {
      const text = readFileSync(join(dir, file), 'utf8');
      for (const [, spec] of text.matchAll(/from '([^']+)'/g)) {
        if (spec === undefined || spec.startsWith('./')) continue;
        expect(ALLOWED, `${file} imports ${spec}`).toContain(spec);
      }
      expect(text).not.toMatch(
        /\b(process\.env|window\.|document\.|localStorage)\b/
      );
    }
  });
});
