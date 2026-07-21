import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Forms root layout', () => {
  it('provides the Next.js nuqs adapter for query-state consumers', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/[locale]/layout.tsx'),
      'utf8'
    );

    expect(source).toContain(
      "import { NuqsAdapter } from 'nuqs/adapters/next/app';"
    );
    expect(source).toMatch(
      /<NuqsAdapter>[\s\S]*{children}[\s\S]*<\/NuqsAdapter>/
    );
  });
});
