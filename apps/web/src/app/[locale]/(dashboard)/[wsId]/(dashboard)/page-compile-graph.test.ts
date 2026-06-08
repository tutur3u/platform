import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/(dashboard)/page.tsx'
  ),
  {
    encoding: 'utf8',
  }
);
const quickActionsSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/(dashboard)/user-groups/quick-actions.tsx'
  ),
  {
    encoding: 'utf8',
  }
);

const forbiddenStaticImports = [
  '@tuturuuu/utils/user-helper',
  '@tuturuuu/utils/workspace-helper',
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

describe('[wsId] dashboard page compile graph', () => {
  it('imports only the thin Mira client wrapper at the route entry', () => {
    expect(pageSource).not.toMatch(staticImportPattern('next/dynamic'));
    expect(pageSource).not.toMatch(
      staticImportPattern('@/components/loading-statistic-card')
    );
    expect(pageSource).toMatch(
      staticImportPattern('./components/mira-dashboard-client')
    );
  });

  it('keeps auth and workspace helper modules behind async split points', () => {
    for (const modulePath of forbiddenStaticImports) {
      expect(pageSource).not.toMatch(staticImportPattern(modulePath));
    }
  });

  it('loads the dashboard access helpers through async imports', () => {
    expect(pageSource).toContain("import('@tuturuuu/utils/user-helper')");
    expect(pageSource).toContain("import('@tuturuuu/utils/workspace-helper')");
  });

  it('keeps optional user-group quick action UI behind its feature flag', () => {
    for (const modulePath of [
      '@tuturuuu/icons/lucide',
      '@tuturuuu/ui/separator',
      '@tuturuuu/utils/format',
      '@tuturuuu/utils/workspace-helper',
      'next-intl/server',
      './quick-actions-content',
    ] as const) {
      expect(quickActionsSource).not.toMatch(staticImportPattern(modulePath));
    }

    expect(quickActionsSource).toMatch(
      /import\(\s*['"]@tuturuuu\/supabase\/next\/server['"]\s*\)/u
    );
    expect(quickActionsSource).toMatch(
      /import\(\s*['"]\.\/quick-actions-content['"]\s*\)/u
    );
  });
});
