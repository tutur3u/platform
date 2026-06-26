import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function resolveSourcePath(relativePath: string) {
  const candidates = [
    join(process.cwd(), 'apps/web', relativePath),
    join(process.cwd(), relativePath),
  ];
  const sourcePath = candidates.find((path) => existsSync(path));

  if (!sourcePath) {
    throw new Error(`Unable to locate ${relativePath}`);
  }

  return sourcePath;
}

const settingsDialogSource = readFileSync(
  resolveSourcePath('src/components/settings/settings-dialog.tsx'),
  { encoding: 'utf8' }
);
const settingsDialogRuntimeSource = settingsDialogSource.replace(
  /^\s*import\s+type\b[\s\S]*?\sfrom\s+['"][^'"]+['"];?/gmu,
  ''
);
const settingsDialogContentSource = readFileSync(
  resolveSourcePath('src/components/settings/settings-dialog-content.tsx'),
  { encoding: 'utf8' }
);
const settingsDialogContentRuntimeSource = settingsDialogContentSource.replace(
  /^\s*import\s+type\b[\s\S]*?\sfrom\s+['"][^'"]+['"];?/gmu,
  ''
);
const lazyPanelsSource = readFileSync(
  resolveSourcePath('src/components/settings/settings-dialog-lazy-panels.tsx'),
  { encoding: 'utf8' }
);
const lazyCalendarPanelsSource = readFileSync(
  resolveSourcePath(
    'src/components/settings/settings-dialog-lazy-calendar-panels.tsx'
  ),
  { encoding: 'utf8' }
);
const registrySource = [
  'src/components/settings/settings-dialog-nav-core.ts',
  'src/components/settings/settings-dialog-nav-domain.ts',
  'src/components/settings/settings-dialog-nav-infrastructure.ts',
  'src/components/settings/settings-dialog-nav-workspace.ts',
  'src/components/settings/settings-dialog-route-entries.ts',
]
  .map((relativePath) =>
    readFileSync(resolveSourcePath(relativePath), { encoding: 'utf8' })
  )
  .join('\n');

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

function navNamePattern(entryName: string) {
  return new RegExp(String.raw`name:\s*['"]${entryName}['"]`, 'u');
}

function routeHrefPattern(entryName: string) {
  return new RegExp(String.raw`['"]?${entryName}['"]?:\s*`, 'u');
}

describe('settings dialog compile graph', () => {
  it('keeps settings entry panels behind lazy imports', () => {
    for (const modulePath of [
      './account/account-management-settings',
      './account/notification-settings',
      './account/security-settings',
      './account/session-settings',
      './appearance-settings',
      './forms/forms-autosave-settings',
      './internal-projects-settings',
      './inventory/referral-settings',
      './keyboard-shortcuts-settings',
      './sidebar-settings',
      './workspace/billing-settings',
      './workspace/user-status-settings',
    ]) {
      expect(settingsDialogRuntimeSource).not.toMatch(
        staticImportPattern(modulePath)
      );
      expect(settingsDialogContentRuntimeSource).not.toMatch(
        staticImportPattern(modulePath)
      );
      expect(lazyPanelsSource).toMatch(dynamicImportPattern(modulePath));
    }

    for (const modulePath of [
      './settings-dialog-profile-panel',
      './settings-dialog-task-general-panel',
      './settings-dialog-workspace-panels',
      './settings-route-entry-panel',
    ]) {
      expect(settingsDialogRuntimeSource).not.toMatch(
        staticImportPattern(modulePath)
      );
      expect(settingsDialogContentRuntimeSource).not.toMatch(
        staticImportPattern(modulePath)
      );
      expect(lazyPanelsSource).toMatch(dynamicImportPattern(modulePath));
    }

    for (const modulePath of [
      '@tuturuuu/ui/calendar-app/components/calendar-connections-unified',
      '@tuturuuu/ui/custom/settings/lunar-calendar-settings',
      '@tuturuuu/ui/hooks/use-calendar-sync',
      './calendar/calendar-settings-content',
      './calendar/calendar-settings-layout',
      './calendar/calendar-settings-wrapper',
    ]) {
      expect(settingsDialogRuntimeSource).not.toMatch(
        staticImportPattern(modulePath)
      );
      expect(settingsDialogContentRuntimeSource).not.toMatch(
        staticImportPattern(modulePath)
      );
      expect(lazyCalendarPanelsSource).toMatch(
        dynamicImportPattern(modulePath)
      );
    }
  });

  it('keeps settings-level route entries in the dialog registry', () => {
    for (const entryName of [
      'workspace_reports',
      'usage',
      'integrations',
      'api_keys',
      'secrets',
      'migrations',
      'platform_roles',
      'platform_billing',
      'inquiries',
      'infrastructure_overview',
      'infrastructure_external_apps',
      'infrastructure_timezones',
      'infrastructure_monitoring_cron',
      'infrastructure_monitoring_rollouts',
      'infrastructure_monitoring_logs',
      'infrastructure_monitoring_analytics',
      'infrastructure_monitoring_observability',
      'infrastructure_monitoring_projects',
      'infrastructure_monitoring_requests',
      'infrastructure_monitoring_resources',
      'infrastructure_monitoring_stress_tests',
      'infrastructure_monitoring_watcher_logs',
    ]) {
      expect(registrySource).toMatch(navNamePattern(entryName));
      expect(registrySource).toMatch(routeHrefPattern(entryName));
    }
  });
});
