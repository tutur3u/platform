import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dashboardClientProvidersSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/dashboard-client-providers.tsx'
  ),
  {
    encoding: 'utf8',
  }
);
const dashboardWorkspaceProvidersSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/dashboard-workspace-providers.tsx'
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

describe('[wsId] dashboard client providers compile graph', () => {
  it('keeps realtime and task provider modules behind a workspace-provider split point', () => {
    expect(dashboardClientProvidersSource).not.toMatch(
      staticImportPattern('next/dynamic')
    );

    for (const modulePath of [
      '@tuturuuu/supabase/next/realtime-log-provider',
      '@tuturuuu/ui/tu-do/providers/task-dialog-provider',
      '@tuturuuu/ui/tu-do/providers/workspace-presence-provider',
      '@tuturuuu/ui/tu-do/shared/task-dialog-manager',
      './personal-workspace-collaboration-banner',
    ] as const) {
      expect(dashboardClientProvidersSource).not.toMatch(
        staticImportPattern(modulePath)
      );
    }

    expect(dashboardClientProvidersSource).toContain(
      "import('./dashboard-workspace-providers')"
    );
  });

  it('loads fade setting setup after hydration instead of preloading it through next/dynamic', () => {
    expect(dashboardClientProvidersSource).not.toMatch(
      /const\s+FadeSettingInitializer\s*=\s*dynamic\(\s*\(\)\s*=>[\s\S]*?import\(['"]@tuturuuu\/ui\/tu-do\/shared\/fade-setting-initializer['"]\)/u
    );
    expect(dashboardClientProvidersSource).toContain(
      "import('@tuturuuu/ui/tu-do/shared/fade-setting-initializer')"
    );
    expect(dashboardClientProvidersSource).toContain(
      'useFadeSettingInitializerComponent'
    );
  });

  it('loads optional workspace provider children after hydration instead of through next/dynamic', () => {
    expect(dashboardWorkspaceProvidersSource).not.toMatch(
      staticImportPattern('next/dynamic')
    );
    expect(dashboardWorkspaceProvidersSource).not.toMatch(
      staticImportPattern('./personal-workspace-collaboration-banner')
    );
    expect(dashboardWorkspaceProvidersSource).not.toMatch(
      staticImportPattern('@tuturuuu/ui/tu-do/shared/task-dialog-manager')
    );
    expect(dashboardWorkspaceProvidersSource).toContain(
      "import('./personal-workspace-collaboration-banner')"
    );
    expect(dashboardWorkspaceProvidersSource).toContain(
      "import('@tuturuuu/ui/tu-do/shared/task-dialog-manager')"
    );
  });
});
