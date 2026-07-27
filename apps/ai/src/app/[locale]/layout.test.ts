import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AI locale layout', () => {
  it('uses the shared satellite provider stack and URL state adapter', () => {
    const source = readFileSync(
      new URL('./layout.tsx', import.meta.url),
      'utf8'
    );

    expect(source).toContain(
      "import { Providers } from '@tuturuuu/satellite/providers'"
    );
    expect(source).toContain(
      "import { NuqsAdapter } from 'nuqs/adapters/next/app'"
    );
    expect(source).toContain('<Providers appName="AI Studio" currentApp="ai">');
    expect(source).toContain('<NuqsAdapter>');
  });
});
