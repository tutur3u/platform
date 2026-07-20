import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const structureSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/structure.tsx'),
  {
    encoding: 'utf8',
  }
);
const structureImplSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/structure-impl.tsx'),
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
  it('keeps the route-level structure import as a thin post-hydration wrapper', () => {
    for (const modulePath of [
      '@tanstack/react-query',
      '@tuturuuu/ui/custom/structure',
      './nav',
      './navigation-icons',
      './sidebar-navigation-preferences',
      './structure-impl',
    ] as const) {
      expect(structureSource).not.toMatch(staticImportPattern(modulePath));
    }

    expect(structureSource).toContain("import('./structure-impl')");
    expect(structureSource).toContain('useStructureImplComponent');
  });

  it('keeps sidebar preference data helpers behind async split points', () => {
    expect(structureImplSource).not.toMatch(
      staticImportPattern('@/constants/common')
    );

    for (const modulePath of [
      '@tuturuuu/internal-api/users',
      '@tuturuuu/ui/sonner',
    ] as const) {
      expect(structureImplSource).not.toMatch(staticImportPattern(modulePath));
      expect(structureImplSource).toContain(`import('${modulePath}')`);
    }
  });

  it('does not pull the shared user-config hook into the workspace shell', () => {
    expect(structureImplSource).not.toMatch(
      staticImportPattern('@/hooks/use-user-config')
    );
  });

  it('wires the shared Apps launcher into the app-name header', () => {
    expect(structureImplSource).toMatch(
      staticImportPattern('@tuturuuu/satellite')
    );
    expect(structureImplSource).toContain('AppsLauncherDialog');
    expect(structureImplSource).toContain('FixedAppBrand');
    expect(structureImplSource).toContain('appId="platform"');
    expect(structureImplSource).toContain(
      "launcherLabel={t('command_launcher.apps')}"
    );
    expect(structureImplSource).toContain(
      'onAppClick={() => setAppsLauncherOpen(true)}'
    );
    expect(structureImplSource).not.toContain("id: 'apps-launcher'");
    expect(structureImplSource).not.toContain('navigationLinksWithLauncher');
    expect(structureImplSource).toContain(
      'currentWorkspace={currentWorkspace}'
    );
    expect(structureImplSource).toContain('WorkspaceSelectVisibilityToggle');
    expect(structureImplSource).toContain('grid-rows-[0fr]');
    expect(structureImplSource).toContain('pointer-events-none');
    expect(structureImplSource).toContain(
      'inert={showWorkspaceSelect ? undefined : true}'
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

    expect(structureImplSource).toContain("from './lazy-sidebar-components'");
    expect(structureImplSource).toContain('useRecentSidebarItemsComponent');
    expect(structureImplSource).toContain('useSidebarActiveTimerComponent');
  });
});
