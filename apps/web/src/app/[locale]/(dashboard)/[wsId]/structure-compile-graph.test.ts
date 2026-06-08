import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const structureSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/structure.tsx'),
  {
    encoding: 'utf8',
  }
);
const lazySidebarComponentsSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/lazy-sidebar-components.ts'
  ),
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

describe('[wsId] structure compile graph', () => {
  it('keeps sidebar preference data helpers behind async split points', () => {
    for (const modulePath of [
      '@tuturuuu/internal-api/users',
      '@tuturuuu/ui/sonner',
    ] as const) {
      expect(structureSource).not.toMatch(staticImportPattern(modulePath));
      expect(structureSource).toContain(`import('${modulePath}')`);
    }
  });

  it('does not pull the shared user-config hook into the workspace shell', () => {
    expect(structureSource).not.toMatch(
      staticImportPattern('@/hooks/use-user-config')
    );
  });

  it('loads optional sidebar helpers after hydration instead of preloading them through next/dynamic', () => {
    for (const [componentName, modulePath] of [
      ['RecentSidebarItems', './recent-sidebar-items'],
      ['SidebarActiveTimer', './sidebar-active-timer'],
    ] as const) {
      expect(structureSource).not.toMatch(
        new RegExp(
          String.raw`const\s+${componentName}\s*=\s*dynamic\(\s*\(\)\s*=>[\s\S]*?import\(['"]${modulePath.replace(
            /[.*+?^${}()|[\]\\]/gu,
            String.raw`\$&`
          )}['"]\)`,
          'u'
        )
      );
      expect(lazySidebarComponentsSource).toContain(`import('${modulePath}')`);
    }

    expect(structureSource).toContain("from './lazy-sidebar-components'");
    expect(structureSource).toContain('useRecentSidebarItemsComponent');
    expect(structureSource).toContain('useSidebarActiveTimerComponent');
  });
});
