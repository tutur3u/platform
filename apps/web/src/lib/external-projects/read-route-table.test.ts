import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { describe, expect, it, vi } from 'vitest';
import { hasWorkspaceExternalProjectPermission } from './access-mode';

const legacy = resolve(
  import.meta.dirname,
  '../../legacy-api-routes/v1/workspaces/[wsId]/external-projects'
);
const native = resolve(
  import.meta.dirname,
  '../../app/api/v1/workspaces/[wsId]/external-projects'
);

// route → method → required permission → returned data. Paths are relative to
// /api/v1/workspaces/[wsId]/external-projects. Admin rows include former reads.
const routes = [
  [
    '?view=content',
    'GET',
    'read',
    'Studio content and own binding; no import or publish audit records',
  ],
  [
    '',
    'GET',
    'manage',
    'Full Studio, binding, import jobs and publish audit events',
  ],
  [
    'summary',
    'GET',
    'manage',
    'Content counts, queues and recent import/publish audit events',
  ],
  ['assets', 'GET', 'read', 'Workspace content assets'],
  ['assets/[assetId]', 'GET', 'read', 'Authorized asset bytes or redirect'],
  [
    'assets/[assetId]/webgl/[...assetPath]',
    'GET',
    'read',
    'Authorized WebGL package file',
  ],
  ['collections', 'GET', 'read', 'Workspace content collections'],
  ['entries', 'GET', 'read', 'Workspace content entries'],
  ['field-definitions', 'GET', 'read', 'Content field schema'],
  ['relation-definitions', 'GET', 'read', 'Content relation schema'],
  [
    'storage',
    'GET',
    'read',
    'Bound project directory or short-lived signed content URL',
  ],
  ['members', 'GET', 'manage', 'Workspace member list'],
  ['members/enhanced', 'GET', 'manage', 'Member details and invitations'],
  ['members/roles', 'GET', 'manage', 'Workspace roles'],
  ['members/roles/default', 'GET', 'manage', 'Default role permissions'],
  ['members/roles/[roleId]', 'GET', 'manage', 'Role details and permissions'],
  ['members/roles/[roleId]/members', 'GET', 'manage', 'Role membership'],
] as const;

vi.mock('./access', async () => {
  const { hasWorkspaceExternalProjectPermission: permits } =
    await import('./access-mode');
  return {
    hasRootExternalProjectsAdminPermission: () => false,
    requireWorkspaceExternalProjectAccess: vi.fn(async ({ mode }) => {
      const permissions: PermissionsResult = {
        membershipType: 'MEMBER',
        permissions: ['edit_external_projects'],
        wsId: 'workspace',
        withoutPermission: (permission) =>
          permission !== 'edit_external_projects',
        containsPermission: (permission: string) =>
          permission === 'edit_external_projects',
      };
      if (!permits(permissions, mode)) {
        return {
          ok: false,
          response: new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
          }),
        };
      }
      return {
        ok: true,
        normalizedWorkspaceId: 'workspace',
        admin: {},
        binding: {},
        workspacePermissions: permissions,
      };
    }),
  };
});
vi.mock('./store', () => ({
  getWorkspaceExternalProjectStudioData: async () => ({
    collections: [],
    fieldDefinitions: [],
    importJobs: [],
    publishEvents: [{ id: 'audit' }],
  }),
  getWorkspaceExternalProjectSummary: async () => ({
    recentActivity: { publishEvents: [{ id: 'audit' }] },
  }),
}));
vi.mock('./cms-capabilities', () => ({
  getExternalProjectCmsEditorCapabilities: () => ({}),
}));

function sourceFor(route: string) {
  const suffix =
    route && !route.startsWith('?') ? `${route}/route.ts` : 'route.ts';
  return readFileSync(
    resolve(route === 'assets/[assetId]' ? native : legacy, suffix),
    'utf8'
  );
}

function readRoutes(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return readRoutes(path);
    if (entry.name !== 'route.ts') return [];
    const source = readFileSync(path, 'utf8');
    return /mode:.*'read'/.test(source) ? [path] : [];
  });
}

describe('external-project read route inventory', () => {
  it('enumerates every direct read-mode route in both implementations', () => {
    const actual = [...readRoutes(legacy), ...readRoutes(native)];
    const expected = routes
      .filter((row) => row[2] === 'read')
      .map(([route]) => {
        const suffix = route.startsWith('?') ? 'route.ts' : `${route}/route.ts`;
        return route === 'assets/[assetId]'
          ? resolve(native, suffix)
          : resolve(legacy, suffix);
      });
    expect(actual.sort()).toEqual(expected.sort());
  });

  it.each(routes)('%s %s requires %s for %s', (route, method, permission) => {
    const source = sourceFor(route);
    expect(source).toContain(`export async function ${method}`);
    if (route.startsWith('members')) {
      expect(source).toContain(
        'requireExternalProjectTeamAccess({ request, wsId })'
      );
    } else {
      if (route === '' || route.startsWith('?')) {
        expect(source).toContain("mode: contentOnly ? 'read' : 'manage'");
      } else expect(source).toContain(`mode: '${permission}'`);
    }
    const editor: PermissionsResult = {
      membershipType: 'MEMBER',
      permissions: ['edit_external_projects'],
      wsId: 'workspace',
      withoutPermission: (permission) =>
        permission !== 'edit_external_projects',
      containsPermission: (grant: string) => grant === 'edit_external_projects',
    };
    expect(hasWorkspaceExternalProjectPermission(editor, permission)).toBe(
      permission === 'read'
    );
  });

  it('keeps editor content reads free of audit records', async () => {
    const { GET } =
      await import('../../legacy-api-routes/v1/workspaces/[wsId]/external-projects/route');
    const response = await GET(
      new Request('https://example.com/?view=content'),
      { params: Promise.resolve({ wsId: 'workspace' }) }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      importJobs: [],
      publishEvents: [],
    });
  });

  it.each(routes.filter((row) => row[2] === 'manage'))(
    'returns editor 403: %s %s (%s; %s)',
    async (route) => {
      const path = resolve(legacy, route, 'route.ts');
      const { GET } = await import(path);
      const response = await GET(new Request(`https://example.com/${route}`), {
        params: Promise.resolve({ wsId: 'workspace', roleId: 'role' }),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
    }
  );
});
