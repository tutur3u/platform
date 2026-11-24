import { afterEach, describe, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from '../platform';
import { WorkspaceRolesAdminClient } from '../platform-workspace-roles';
import { runWorkspaceRolesCommand } from './workspace-roles';

const ROOT = '00000000-0000-0000-0000-000000000000';
const ROLE = '33333333-4444-4555-8666-777777777777';
const USER = '11111111-2222-4333-8444-555555555555';
const base = `https://tuturuuu.com/api/v1/workspaces/${ROOT}/roles`;
const qaRole = {
  id: ROLE,
  name: 'QA operator',
  permissions: [{ id: 'manage_qa_test_users', enabled: true }],
};

afterEach(() => {
  process.exitCode = undefined;
});

type Route = (url: string, method: string, body: unknown) => Response;
function fixture(route: Route) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (input, init) =>
      route(
        String(input),
        init?.method ?? 'GET',
        init?.body ? JSON.parse(String(init.body)) : undefined
      )
    );
  const user = new TuturuuuUserClient({
    accessToken: 'cli-token',
    baseUrl: 'https://tuturuuu.com',
    fetch,
  });
  const out: string[] = [];
  const run = (
    positionals: string[],
    flags: Record<string, string | boolean>
  ) =>
    runWorkspaceRolesCommand({
      client: () => new WorkspaceRolesAdminClient(user.getClientOptions()),
      flags: { workspace: ROOT, ...flags },
      json: true,
      positionals,
      write: (text) => out.push(text),
    });
  const mutations = () =>
    fetch.mock.calls.filter(([, init]) => (init?.method ?? 'GET') !== 'GET');
  return { fetch, out, run, mutations };
}

describe('ttr workspaces roles', () => {
  it('create requires an explicit permission list', async () => {
    const { fetch, run } = fixture(() => Response.json({}));
    await expect(
      run(['roles', 'create'], { name: 'QA operator' })
    ).rejects.toThrow(/explicitly/);
    await expect(
      run(['roles', 'create'], { name: 'QA operator', permission: 'Bad-Id' })
    ).rejects.toThrow(/snake_case/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('create dry-run only reads and prints the exact request', async () => {
    const { out, run, mutations } = fixture((url) => {
      expect(url).toContain(`${base}?`);
      return Response.json({ data: [], count: 0 });
    });
    await run(['roles', 'create'], {
      name: 'QA operator',
      permission: 'manage_qa_test_users',
      'dry-run': true,
    });
    expect(mutations()).toEqual([]);
    expect(JSON.parse(out.join(''))).toEqual({
      dryRun: true,
      request: {
        method: 'POST',
        path: `/api/v1/workspaces/${ROOT}/roles`,
        body: {
          name: 'QA operator',
          permissions: [{ id: 'manage_qa_test_users', enabled: true }],
        },
      },
    });
  });

  it('create posts only the requested permission and prints the stored set', async () => {
    const { out, run, mutations } = fixture((url, method, body) => {
      if (method === 'POST') {
        expect(url).toBe(base);
        expect(body).toEqual({
          name: 'QA operator',
          permissions: [{ id: 'manage_qa_test_users', enabled: true }],
        });
        return Response.json({ id: ROLE, message: 'success' });
      }
      if (url === `${base}/${ROLE}`) return Response.json(qaRole);
      return Response.json({ data: [], count: 0 });
    });
    await run(['roles', 'create'], {
      name: 'QA operator',
      permission: 'manage_qa_test_users',
    });
    expect(mutations()).toHaveLength(1);
    expect(JSON.parse(out.join(''))).toEqual({
      status: 'created',
      role: {
        id: ROLE,
        name: 'QA operator',
        permissions: ['manage_qa_test_users'],
      },
      requested: ['manage_qa_test_users'],
    });
  });

  it('create refuses when the name lookup is truncated', async () => {
    const { run, mutations } = fixture(() =>
      Response.json({ data: [], count: 250 })
    );
    await expect(
      run(['roles', 'create'], {
        name: 'QA',
        permission: 'manage_qa_test_users',
      })
    ).rejects.toThrow(/too many/);
    expect(mutations()).toEqual([]);
  });

  it('create reports an existing role and never modifies it', async () => {
    const { out, run, mutations } = fixture(() =>
      Response.json({
        data: [
          {
            ...qaRole,
            permissions: [
              ...qaRole.permissions,
              { id: 'admin', enabled: true },
            ],
          },
        ],
        count: 1,
      })
    );
    await run(['roles', 'create'], {
      name: 'QA operator',
      permission: 'manage_qa_test_users',
    });
    expect(mutations()).toEqual([]);
    expect(JSON.parse(out.join(''))).toMatchObject({
      status: 'mismatch',
      role: { permissions: ['admin', 'manage_qa_test_users'] },
    });
    expect(process.exitCode).toBe(1);
  });

  it('assign, unassign and delete need the exact --confirm target', async () => {
    const { fetch, run } = fixture(() => Response.json({}));
    await expect(
      run(['roles', 'assign'], { role: ROLE, user: USER })
    ).rejects.toThrow(/--confirm/);
    await expect(
      run(['roles', 'unassign'], { role: ROLE, user: USER, confirm: ROLE })
    ).rejects.toThrow(/--confirm/);
    await expect(
      run(['roles', 'delete'], { role: ROLE, confirm: USER })
    ).rejects.toThrow(/--confirm/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('assign posts memberIds; its dry-run and the rollback dry-runs only read', async () => {
    let members: unknown[] = [];
    const { out, run, mutations } = fixture((url, method, body) => {
      if (method === 'POST') {
        expect(url).toBe(`${base}/${ROLE}/members`);
        expect(body).toEqual({ memberIds: [USER] });
        members = [{ id: USER, email: 'qa-operator@tuturuuu.com' }];
        return Response.json({ message: 'success' });
      }
      if (method === 'DELETE') return Response.json({ message: 'success' });
      if (url.endsWith('/members'))
        return Response.json({ data: members, count: members.length });
      return Response.json(qaRole);
    });
    const target = { role: ROLE, user: USER, confirm: USER };
    await run(['roles', 'assign'], { ...target, 'dry-run': true });
    expect(mutations()).toEqual([]);
    await run(['roles', 'assign'], target);
    expect(mutations()).toHaveLength(1);
    await run(['roles', 'assign'], target);
    expect(mutations()).toHaveLength(1);
    await run(['roles', 'unassign'], { ...target, 'dry-run': true });
    await run(['roles', 'delete'], {
      role: ROLE,
      confirm: ROLE,
      'dry-run': true,
    });
    expect(mutations()).toHaveLength(1);
    const results = out.map((text) => JSON.parse(text));
    expect(results.map((r) => r.status ?? 'dry-run')).toEqual([
      'dry-run',
      'assigned',
      'already_assigned',
      'dry-run',
      'dry-run',
    ]);
    expect(results[3].request).toEqual({
      method: 'DELETE',
      path: `/api/v1/workspaces/${ROOT}/roles/${ROLE}/members/${USER}`,
    });
    expect(results[4].request).toEqual({
      method: 'DELETE',
      path: `/api/v1/workspaces/${ROOT}/roles/${ROLE}`,
    });
  });

  it('invite sends the email with the role and its dry-run sends nothing', async () => {
    const { out, run, mutations } = fixture((url, method, body) => {
      if (method === 'POST') {
        expect(url).toBe(
          `https://tuturuuu.com/api/workspaces/${ROOT}/members/invite`
        );
        expect(body).toEqual({
          email: 'qa-operator@tuturuuu.com',
          roleIds: [ROLE],
        });
        return Response.json({ message: 'success' });
      }
      return Response.json(qaRole);
    });
    await expect(
      run(['members', 'invite'], {
        email: 'qa-operator@tuturuuu.com',
        role: ROLE,
      })
    ).rejects.toThrow(/--confirm/);
    expect(mutations()).toEqual([]);
    const flags = {
      email: 'qa-operator@tuturuuu.com',
      role: ROLE,
      confirm: ROLE,
    };
    await run(['members', 'invite'], { ...flags, 'dry-run': true });
    expect(mutations()).toEqual([]);
    await run(['members', 'invite'], flags);
    expect(mutations()).toHaveLength(1);
    expect(JSON.parse(out[1]!)).toMatchObject({
      status: 'invited',
      role: { permissions: ['manage_qa_test_users'] },
    });
  });

  it('requires an explicit workspace UUID', async () => {
    const { fetch } = fixture(() => Response.json({}));
    await expect(
      runWorkspaceRolesCommand({
        client: () => {
          throw new Error('unused');
        },
        flags: {},
        json: true,
        positionals: ['roles', 'list'],
      })
    ).rejects.toThrow(/--workspace/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
