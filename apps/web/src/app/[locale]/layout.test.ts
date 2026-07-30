import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Web root layout', () => {
  it('renders the theme provider outside suspense so saved themes apply before paint', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/[locale]/layout.tsx'),
      'utf8'
    );

    expect(source).toMatch(
      /<Providers>\s*<Suspense>\s*<NuqsAdapter>\{children\}<\/NuqsAdapter>\s*<\/Suspense>\s*<\/Providers>/
    );
  });
});
