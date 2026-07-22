import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('satellite workspace settings panels', () => {
  it('uses the shell header once and presents live billing context', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/components/workspace-settings/workspace-settings-panels.tsx'
      ),
      'utf8'
    );

    expect(source).not.toContain('<PanelIntro');
    expect(source).toContain('getWorkspaceAiCreditStatus');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('billing_current_plan');
    expect(source).toContain('billing_ai_credits');
  });

  it('disables guest access and omits invitation tools in personal workspaces', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/components/workspace-settings/workspace-settings-panels.tsx'
      ),
      'utf8'
    );

    expect(source).toContain(
      'disabled={workspace.personal || !canManageMembers}'
    );
    expect(source).toContain('{!workspace.personal ? (');
    expect(source).toContain('disableInvite={invitationsDisabled}');
  });

  it('keeps the active workspace switcher in every satellite settings breadcrumb', () => {
    const apps = [
      'calendar',
      'cms',
      'contacts',
      'drive',
      'finance',
      'forms',
      'inventory',
      'rewise',
      'tasks',
      'track',
    ];

    for (const app of apps) {
      const source = readFileSync(
        resolve(
          process.cwd(),
          `../../apps/${app}/src/components/settings/settings-dialog.tsx`
        ),
        'utf8'
      );

      expect(source, app).toContain('<SettingsWorkspaceBreadcrumb');
      expect(source, app).toContain('activeGroupBreadcrumb=');
    }

    const breadcrumbSource = readFileSync(
      join(
        process.cwd(),
        'src/components/workspace-settings/settings-workspace-breadcrumb.tsx'
      ),
      'utf8'
    );
    expect(breadcrumbSource).toContain('popoverModal');
    expect(breadcrumbSource).toContain('settingsDialog=open');
  });
});
