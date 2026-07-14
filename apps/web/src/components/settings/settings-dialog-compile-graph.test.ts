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
]
  .map((relativePath) =>
    readFileSync(resolveSourcePath(relativePath), { encoding: 'utf8' })
  )
  .join('\n');
const registrySource = [
  'src/components/settings/settings-dialog-nav-core.ts',
  'src/components/settings/settings-dialog-nav-developer.ts',
  'src/components/settings/settings-dialog-nav-domain.ts',
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
  'inquiries',
  'integrations',
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
    expect(nativeRoutePanelsSource).not.toContain(
      'settings-dialog-native-infrastructure-panels'
    );
    expect(registrySource).not.toMatch(navNamePattern('internal_projects'));
    expect(registrySource).not.toMatch(navNamePattern('platform_billing'));
    expect(registrySource).not.toMatch(navNamePattern('platform_roles'));
  });
});
