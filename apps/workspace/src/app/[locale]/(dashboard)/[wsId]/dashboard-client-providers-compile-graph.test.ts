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
const taskDialogManagerLoaderSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/task-dialog-manager-loader.ts'
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

function dynamicImportPattern(modulePath: string) {
  const escapedModulePath = modulePath.replace(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`
  );

  return new RegExp(
    String.raw`import\(\s*['"]${escapedModulePath}['"]\s*\)`,
    'u'
  );
}

describe('[wsId] dashboard client providers compile graph', () => {
  it('keeps realtime and task provider modules behind a workspace-provider split point', () => {
    expect(dashboardClientProvidersSource).not.toMatch(
      staticImportPattern('next/dynamic')
    );

    for (const modulePath of [
      '@tuturuuu/supabase/next/realtime-log-provider',
      '@tuturuuu/tasks-ui/tu-do/providers/task-dialog-provider',
      '@tuturuuu/tasks-ui/tu-do/providers/workspace-presence-provider',
      '@tuturuuu/tasks-ui/tu-do/shared/task-dialog-manager',
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
      /const\s+FadeSettingInitializer\s*=\s*dynamic\(\s*\(\)\s*=>[\s\S]*?import\(['"]@tuturuuu\/tasks-ui\/tu-do\/shared\/fade-setting-initializer['"]\)/u
    );
    expect(dashboardClientProvidersSource).toMatch(
      dynamicImportPattern(
        '@tuturuuu/tasks-ui/tu-do/shared/fade-setting-initializer'
      )
    );
    expect(dashboardClientProvidersSource).toContain(
      'useFadeSettingInitializerComponent'
    );
  });

  it('loads task sound effects setup after hydration instead of preloading it through next/dynamic', () => {
    expect(dashboardClientProvidersSource).not.toMatch(
      /const\s+TaskSoundEffectsInitializer\s*=\s*dynamic\(\s*\(\)\s*=>[\s\S]*?import\(['"]@tuturuuu\/tasks-ui\/tu-do\/shared\/task-sound-effects['"]\)/u
    );
    expect(dashboardClientProvidersSource).toMatch(
      dynamicImportPattern('@tuturuuu/tasks-ui/tu-do/shared/task-sound-effects')
    );
    expect(dashboardClientProvidersSource).toContain(
      'useTaskSoundEffectsInitializerComponent'
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
      staticImportPattern('@tuturuuu/tasks-ui/tu-do/shared/task-dialog-manager')
    );
    expect(dashboardWorkspaceProvidersSource).toContain(
      "import('./personal-workspace-collaboration-banner')"
    );
    expect(dashboardWorkspaceProvidersSource).toMatch(
      staticImportPattern('./task-dialog-manager-loader')
    );
    expect(dashboardWorkspaceProvidersSource).toContain(
      'useLazyClientComponent(preloadTaskDialogManager)'
    );
    expect(taskDialogManagerLoaderSource).not.toMatch(
      staticImportPattern('@tuturuuu/tasks-ui/tu-do/shared/task-dialog-manager')
    );
    expect(taskDialogManagerLoaderSource).toMatch(
      dynamicImportPattern(
        '@tuturuuu/tasks-ui/tu-do/shared/task-dialog-manager'
      )
    );
    expect(taskDialogManagerLoaderSource).toContain('taskDialogManagerPromise');
  });
});
