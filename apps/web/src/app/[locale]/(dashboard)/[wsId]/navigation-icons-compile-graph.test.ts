import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const navigationIconsSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/navigation-icons.tsx'
  ),
  {
    encoding: 'utf8',
  }
);

describe('[wsId] navigation icons compile graph', () => {
  it('uses narrow icon subpath imports instead of the package barrel', () => {
    expect(navigationIconsSource).not.toContain("from '@tuturuuu/icons'");
    expect(navigationIconsSource).toContain("from '@tuturuuu/icons/lucide'");
    expect(navigationIconsSource).toContain("from '@tuturuuu/icons/lab'");
  });
});
