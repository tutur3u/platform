import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/layout.tsx'),
  {
    encoding: 'utf8',
  }
);
const layoutDataSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/layout-data.ts'),
  {
    encoding: 'utf8',
  }
);
const navigationSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/navigation.tsx'),
  {
    encoding: 'utf8',
  }
);

const forbiddenStaticImports = [
  '@tuturuuu/supabase/next/server',
  '@tuturuuu/utils/user-helper',
  '@tuturuuu/utils/workspace-helper',
  '../../navbar-actions',
  '../../user-nav',
  './dashboard-client-providers',
  './dashboard-settings-dialog-host',
  './navigation',
  './navigation-visibility',
  './structure',
] as const;

function staticImportPattern(modulePath: string) {
  const escapedModulePath = modulePath.replace(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`
  );

  return new RegExp(
    String.raw`^\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+['"]${escapedModulePath}['"];`,
    'mu'
  );
}

describe('[wsId] layout compile graph', () => {
  it('keeps heavy dashboard shell modules out of static layout imports', () => {
    expect(layoutSource).not.toMatch(staticImportPattern('next/dynamic'));

    for (const modulePath of forbiddenStaticImports) {
      expect(layoutSource).not.toMatch(staticImportPattern(modulePath));
    }
  });

  it('loads dashboard navigation through an async split point', () => {
    expect(layoutSource).toContain("import('./dashboard-shell-client')");
    expect(layoutSource).toContain("import('./navigation')");
    expect(layoutSource).toContain("import('./navigation-visibility')");
  });

  it('keeps broad server helpers behind route-local split points', () => {
    expect(layoutSource).toContain("import('@tuturuuu/supabase/next/server')");
    expect(layoutSource).toContain(
      "import('@tuturuuu/utils/workspace-helper')"
    );
  });

  it('keeps Supabase server helpers out of static layout data imports', () => {
    expect(layoutDataSource).not.toMatch(
      staticImportPattern('@tuturuuu/supabase/next/server')
    );
    expect(layoutDataSource).toContain(
      "import('@tuturuuu/supabase/next/server')"
    );
  });

  it('keeps habits runtime access helpers out of dashboard navigation imports', () => {
    expect(navigationSource).not.toMatch(
      staticImportPattern('@/lib/habits/access')
    );
    expect(navigationSource).toMatch(
      staticImportPattern('@/lib/habits/constants')
    );
  });
});
