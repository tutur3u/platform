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
const structureSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/structure.tsx'),
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

  it('keeps workspace shell affordance icons on the deferred icon path', () => {
    expect(structureSource).not.toContain("from '@tuturuuu/icons/lucide'");
    expect(structureSource).not.toContain("from '@tuturuuu/icons'");
    expect(structureSource).toContain('name="Archive"');
    expect(structureSource).toContain('name="ArrowLeft"');
  });
});
