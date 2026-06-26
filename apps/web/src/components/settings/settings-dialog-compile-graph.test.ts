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
const lazyPanelsSource = readFileSync(
  resolveSourcePath('src/components/settings/settings-dialog-lazy-panels.tsx'),
  { encoding: 'utf8' }
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

describe('settings dialog compile graph', () => {
  it('keeps settings entry panels behind lazy imports', () => {
    for (const modulePath of [
      './account/account-management-settings',
      './account/notification-settings',
      './account/security-settings',
      './account/session-settings',
      './appearance-settings',
      './forms/forms-autosave-settings',
      './inventory/referral-settings',
      './keyboard-shortcuts-settings',
      './sidebar-settings',
      './workspace/billing-settings',
      './workspace/user-status-settings',
    ]) {
      expect(settingsDialogRuntimeSource).not.toMatch(
        staticImportPattern(modulePath)
      );
      expect(lazyPanelsSource).toContain(`import('${modulePath}')`);
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
      expect(lazyPanelsSource).toContain(`import('${modulePath}')`);
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
    ]) {
      expect(settingsDialogSource).toContain(`name: '${entryName}'`);
      expect(settingsDialogSource).toContain(`${entryName}: `);
    }
  });
});
