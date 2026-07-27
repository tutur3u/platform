import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SATELLITE_APPS = [
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

  // Regression: apps/contacts served this route itself and returned only
  // `manage_workspace_settings`. A satellite's `/api/:path*` rewrite is a
  // fallback, so a local route shadows web's full summary, and this panel reads
  // the absent member/role flags as `?? false` — every user saw "Read-only
  // access" with the Roles, Member defaults and Guest defaults tabs disabled,
  // whatever their real permissions were.
  it('lets web answer the workspace permissions summary for every satellite', () => {
    for (const app of SATELLITE_APPS) {
      const localRoute = resolve(
        process.cwd(),
        `../../apps/${app}/src/app/api/v1/workspaces/[wsId]/settings/permissions/route.ts`
      );

      expect(
        existsSync(localRoute),
        `apps/${app} shadows the workspace permissions summary with a local route`
      ).toBe(false);
    }
  });

  // The dialog and the contacts approvals tab share one query-cache entry, so
  // both must write the whole summary into it. A hand-rolled fetch that narrows
  // the response reintroduces the read-only bug through the cache instead.
  it('fetches the shared permissions summary through the typed client', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        '../../apps/contacts/src/components/settings/approvals-settings.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('getWorkspacePermissionsSummary');
    expect(source).toContain("queryKey: ['workspace-settings-permissions'");
    expect(source).not.toContain('/settings/permissions`');
  });

  it('keeps the active workspace switcher in every satellite settings breadcrumb', () => {
    for (const app of SATELLITE_APPS) {
      const source = readFileSync(
        resolve(
          process.cwd(),
          `../../apps/${app}/src/components/settings/settings-dialog.tsx`
        ),
        'utf8'
      );

      expect(source, app).toContain('<SettingsWorkspaceBreadcrumb');
      expect(source, app).toContain(`appId="${app}"`);
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
    expect(breadcrumbSource).toContain('resolveSatelliteSettingsWorkspacePath');
  });
});
