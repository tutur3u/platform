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
const nativeRoutePanelsSource = [
  'src/components/settings/settings-dialog-native-route-panels.tsx',
  'src/components/settings/settings-dialog-native-admin-panels.tsx',
  'src/components/settings/settings-dialog-native-infrastructure-panels.tsx',
]
  .map((relativePath) =>
    readFileSync(resolveSourcePath(relativePath), { encoding: 'utf8' })
  )
  .join('\n');
const registrySource = [
  'src/components/settings/settings-dialog-nav-core.ts',
  'src/components/settings/settings-dialog-nav-domain.ts',
  'src/components/settings/settings-dialog-nav-infrastructure.ts',
  'src/components/settings/settings-dialog-nav-workspace.ts',
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

const formerRouteOnlyEntries = [
  'api_keys',
  'infrastructure_abuse_events',
  'infrastructure_abuse_intelligence',
  'infrastructure_ai_agents',
  'infrastructure_ai_credits',
  'infrastructure_ai_whitelisted_domains',
  'infrastructure_ai_whitelisted_emails',
  'infrastructure_app_coordination',
  'infrastructure_blocked_ips',
  'infrastructure_calendar_sync',
  'infrastructure_changelog',
  'infrastructure_cron_whitelisted_domains',
  'infrastructure_devboxes',
  'infrastructure_email_audit',
  'infrastructure_email_blacklist',
  'infrastructure_email_templates',
  'infrastructure_entity_creation_limits',
  'infrastructure_external_apps',
  'infrastructure_github_bot',
  'infrastructure_mobile_deployment',
  'infrastructure_mobile_versions',
  'infrastructure_monitoring',
  'infrastructure_monitoring_analytics',
  'infrastructure_monitoring_cron',
  'infrastructure_monitoring_logs',
  'infrastructure_monitoring_observability',
  'infrastructure_monitoring_projects',
  'infrastructure_monitoring_requests',
  'infrastructure_monitoring_resources',
  'infrastructure_monitoring_rollouts',
  'infrastructure_monitoring_stress_tests',
  'infrastructure_monitoring_watcher_logs',
  'infrastructure_otp_limits',
  'infrastructure_overview',
  'infrastructure_post_email_queue',
  'infrastructure_push_notifications',
  'infrastructure_rate_limit_appeals',
  'infrastructure_rate_limits',
  'infrastructure_realtime',
  'infrastructure_timezones',
  'infrastructure_translations',
  'infrastructure_users',
  'infrastructure_workspaces',
  'inquiries',
  'integrations',
  'migrations',
  'platform_billing',
  'platform_roles',
  'secrets',
  'usage',
  'workspace_reports',
] as const;

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
      './settings-dialog-native-route-panels',
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

  it('keeps former route-only entries wired to native dialog panels', () => {
    for (const entryName of formerRouteOnlyEntries) {
      expect(registrySource).toMatch(navNamePattern(entryName));
      expect(nativeRoutePanelsSource).toContain(`'${entryName}'`);
    }
  });

  it('does not compile the route-entry fallback panel', () => {
    expect(
      existsSync(
        resolveSourcePath(
          'src/components/settings/settings-dialog.tsx'
        ).replace('settings-dialog.tsx', 'settings-route-entry-panel.tsx')
      )
    ).toBe(false);
    expect(
      existsSync(
        resolveSourcePath(
          'src/components/settings/settings-dialog.tsx'
        ).replace('settings-dialog.tsx', 'settings-dialog-route-entries.ts')
      )
    ).toBe(false);
    expect(settingsDialogRuntimeSource).not.toContain(
      'getSettingsRoutePanelHrefs'
    );
    expect(settingsDialogContentRuntimeSource).not.toContain(
      'SettingsRouteEntryPanel'
    );
    expect(lazyPanelsSource).not.toContain('settings-route-entry-panel');
    expect(nativeRoutePanelsSource).not.toContain('StaticInfrastructurePanel');
    expect(nativeRoutePanelsSource).not.toContain("status: 'native'");
  });
});
