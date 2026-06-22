import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dashboardShellClientSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/dashboard-shell-client.tsx'
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

describe('[wsId] dashboard shell client compile graph', () => {
  it('keeps heavy dashboard shell children behind async split points', () => {
    expect(dashboardShellClientSource).not.toMatch(
      staticImportPattern('next/dynamic')
    );

    for (const modulePath of [
      '@/lib/calendar-preferences-provider',
      './dashboard-client-providers',
      './dashboard-settings-dialog-host',
      './structure',
    ] as const) {
      expect(dashboardShellClientSource).not.toMatch(
        staticImportPattern(modulePath)
      );
      expect(dashboardShellClientSource).toContain(`import('${modulePath}')`);
    }
  });

  it('loads the dashboard settings host after hydration instead of preloading it through next/dynamic', () => {
    expect(dashboardShellClientSource).not.toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\(['"]\.\/dashboard-settings-dialog-host['"]\)/u
    );
    expect(dashboardShellClientSource).toMatch(
      /import\(['"]\.\/dashboard-settings-dialog-host['"]\)/u
    );
    expect(dashboardShellClientSource).toContain(
      'useDashboardSettingsDialogHost'
    );
    expect(dashboardShellClientSource).toContain(
      'DashboardSettingsDialogSkeletonGate'
    );
    expect(dashboardShellClientSource).toContain(
      'SettingsDialogFullscreenSkeleton'
    );
  });
});
