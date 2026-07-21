import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const storefrontRoot = process.cwd().endsWith('/apps/storefront')
  ? process.cwd()
  : join(process.cwd(), 'apps/storefront');

describe('Storefront root layout', () => {
  it('does not register a service worker that the satellite does not serve', () => {
    const source = readFileSync(
      join(storefrontRoot, 'src/app/[locale]/layout.tsx'),
      'utf8'
    );

    expect(source).toContain('<SerwistProvider register={false}>');
  });
});
