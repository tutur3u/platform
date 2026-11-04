import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Pinned Void 1.1.12 findLegacyEnvFiles filename predicate; not SDK execution.
const rejected = (name: string) =>
  name.startsWith('.env.') ||
  name === '.env.example' ||
  name === '.dev.vars' ||
  name.startsWith('.dev.vars.');
describe('Mail supported env template filename', () => {
  it('keeps the byte-preserved template outside the actual SDK rejection condition', () => {
    const root = resolve(__dirname, '../..');
    expect(existsSync(resolve(root, '.env.example'))).toBe(false);
    expect(existsSync(resolve(root, 'env.example'))).toBe(true);
    expect(rejected('.env.example')).toBe(true);
    expect(rejected('env.example')).toBe(false);
    expect(readdirSync(root).filter((name) => name === '.env.example')).toEqual(
      []
    );
    expect(
      createHash('sha256')
        .update(readFileSync(resolve(root, 'env.example')))
        .digest('hex')
    ).toBe('f6e30fde90ef6448bfbed00c11a4c1703f07c6447cf1848a02dee39343672c4d');
  });
});
