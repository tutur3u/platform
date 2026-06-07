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
  it('keeps icon modules behind an async registry loader', () => {
    expect(navigationIconsSource).not.toContain("from '@tuturuuu/icons'");
    expect(navigationIconsSource).not.toContain(
      "from '@tuturuuu/icons/lucide'"
    );
    expect(navigationIconsSource).not.toContain("from '@tuturuuu/icons/lab'");
    expect(navigationIconsSource).toContain("import('@tuturuuu/icons/lucide')");
    expect(navigationIconsSource).toContain("import('@tuturuuu/icons/lab')");
    expect(navigationIconsSource).toContain('loadNavigationIconRegistry');
  });
});
