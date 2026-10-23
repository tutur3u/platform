import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  dependencies?: Record<string, string>;
};

describe('desktop certificate parser dependency policy', () => {
  it('keeps the documented supply-chain exception pinned exactly', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    ) as PackageManifest;

    expect(
      manifest.dependencies?.['@blamejs/pki'],
      'See the @blamejs/pki supply-chain exception in the security architecture documentation.'
    ).toBe('0.9.7');
  });
});
