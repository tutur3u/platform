import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;

    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

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

  // Every surface reading `['workspace-settings-permissions', wsId]` shares one
  // cache entry, so whichever loads first decides what the others see. A
  // hand-rolled fetch typed to a subset writes a partial object into that entry
  // and reproduces the read-only bug through the cache, with no route involved.
  it('fetches the permissions summary through the typed client everywhere', () => {
    const offenders: string[] = [];

    for (const app of [...SATELLITE_APPS, 'web']) {
      const appDir = resolve(process.cwd(), `../../apps/${app}/src`);
      if (!existsSync(appDir)) continue;

      for (const file of collectSourceFiles(appDir)) {
        const source = readFileSync(file, 'utf8');

        // Route handlers produce this payload rather than consuming it, and
        // tests name the endpoint on purpose.
        if (file.includes(`${sep}api${sep}`) || file.includes('.test.')) {
          continue;
        }

        // Building the URL by hand is the regression itself: it bypasses the
        // shared type, so the response can be narrowed to whatever the caller
        // declares. Reaching the endpoint any other way than the client is an
        // offence on its own, not merely when the client is absent.
        const buildsUrlByHand = source.includes('/settings/permissions`');
        const usesSharedKey = source.includes(
          "'workspace-settings-permissions'"
        );
        const usesClient = source.includes(
          'getWorkspacePermissionsSummary(wsId'
        );

        if (buildsUrlByHand || (usesSharedKey && !usesClient)) {
          offenders.push(file.slice(file.indexOf(`apps${sep}${app}`)));
        }
      }
    }

    expect(
      offenders,
      'these read the permissions summary without the typed client'
    ).toEqual([]);
  });

  // apps/web owns this endpoint for every app, and its response is typed
  // against the shared contract so dropping a field is a compile error instead
  // of a settings dialog that quietly renders as read-only.
  it('keeps web the single first-class producer of the summary', () => {
    const firstClass = resolve(
      process.cwd(),
      '../../apps/web/src/app/api/v1/workspaces/[wsId]/settings/permissions/route.ts'
    );
    const legacy = resolve(
      process.cwd(),
      '../../apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/settings/permissions/route.ts'
    );

    expect(existsSync(firstClass)).toBe(true);
    expect(existsSync(legacy)).toBe(false);

    const source = readFileSync(firstClass, 'utf8');
    expect(source).not.toContain('@generated');
    expect(source).toContain('const summary: WorkspacePermissionsSummary = {');
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
