import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const navigationSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/navigation.tsx'),
  {
    encoding: 'utf8',
  }
);

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

function asyncImportPattern(modulePath: string) {
  const escapedModulePath = modulePath.replace(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`
  );

  return new RegExp(String.raw`import\(\s*['"]${escapedModulePath}['"]\s*\)`);
}

describe('[wsId] navigation compile graph', () => {
  it('keeps broad server helpers behind async split points', () => {
    for (const modulePath of [
      '@tuturuuu/supabase/next/server',
      '@tuturuuu/internal-api/workspace-configs',
      '@tuturuuu/utils/workspace-helper',
      'next-intl/server',
    ] as const) {
      expect(navigationSource).not.toMatch(staticImportPattern(modulePath));
    }

    expect(navigationSource).toMatch(
      asyncImportPattern('@tuturuuu/supabase/next/server')
    );
    expect(navigationSource).toMatch(
      asyncImportPattern('@tuturuuu/utils/workspace-helper')
    );
    expect(navigationSource).toMatch(asyncImportPattern('next-intl/server'));
  });

  it('does not serialize users database default group filters into sidebar URLs', () => {
    expect(navigationSource).not.toContain(
      'DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID'
    );
    expect(navigationSource).not.toContain(
      'DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID'
    );
    expect(navigationSource).not.toContain(
      'deferredQueryParamsFromWorkspaceConfig'
    );
  });
});
