/** @vitest-environment node */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ resolve: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: NextRequest, auth: unknown) => Promise<Response>) =>
    async (request: NextRequest) =>
      handler(request, await session.resolve()),
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: async (id: string) => id,
}));
vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: session.resolve,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: session.client,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import { GET as readMiraTasks } from '../app/api/v1/mira/tasks/route';
import { GET as readDashboard } from '../app/api/v1/users/me/tasks/route';

// Resolve the SDK from its owning workspace without adding an app dependency.
const sdk: {
  createClient: (
    url: string,
    key: string,
    options: {
      auth: {
        autoRefreshToken: boolean;
        persistSession: boolean;
        detectSessionInUrl: boolean;
      };
    }
  ) => TypedSupabaseClient;
} = createRequire(
  new URL('../../../../packages/supabase/package.json', import.meta.url)
)('@supabase/supabase-js');
const { createClient } = sdk;

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && anonKey && serviceKey);

describe.skipIf(!enabled)(
  'task RPC admission through real user-client callers',
  () => {
    let admin: TypedSupabaseClient;
    let client: TypedSupabaseClient;
    let anonymous: TypedSupabaseClient;
    let user: SupabaseUser | undefined;
    let wsId: string;
    let taskId: string;
    beforeAll(async () => {
      if (
        !url ||
        !anonKey ||
        !serviceKey ||
        !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
      ) {
        throw new Error('Disposable loopback Supabase is required');
      }
      const options = {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      };
      admin = createClient(url, serviceKey, options);
      client = createClient(url, anonKey, options);
      anonymous = createClient(url, anonKey, options);
      const email = `rpc-${randomUUID()}@example.test`;
      const password = `Synthetic-${randomUUID()}`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user)
        throw new Error('Synthetic user setup failed');
      user = created.data.user;
      const signedIn = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (signedIn.error) throw new Error('Synthetic user login failed');
      wsId = randomUUID();
      const boardId = randomUUID();
      const listId = randomUUID();
      taskId = randomUUID();
      for (const result of [
        await admin.from('workspaces').insert({
          id: wsId,
          name: 'Synthetic RPC workspace',
          creator_id: user.id,
        }),
        await admin.from('workspace_boards').insert({
          id: boardId,
          ws_id: wsId,
          name: 'Synthetic RPC board',
          creator_id: user.id,
        }),
        await admin.from('task_lists').insert({
          id: listId,
          board_id: boardId,
          name: 'Synthetic RPC list',
          creator_id: user.id,
        }),
        await admin.from('tasks').insert({
          id: taskId,
          list_id: listId,
          name: 'Synthetic caller task',
          creator_id: user.id,
        }),
        await admin
          .from('task_assignees')
          .insert({ task_id: taskId, user_id: user.id }),
      ])
        if (result.error) throw new Error('Synthetic task setup failed');
      session.resolve.mockImplementation(async () => ({
        user,
        supabase: client,
        authError: null,
      }));
      session.client.mockResolvedValue(client);
    });
    afterAll(async () => {
      if (!admin || !user) return;
      const workspaces = await admin.from('workspaces').delete().eq('id', wsId);
      const removed = await admin.auth.admin.deleteUser(user.id);
      if (workspaces.error || removed.error)
        throw new Error(
          `Synthetic fixture cleanup failed: ${workspaces.error?.code ?? ''} ${workspaces.error?.message ?? ''}; ${removed.error?.code ?? ''} ${removed.error?.message ?? ''}`
        );
    });
    it('keeps the Tasks dashboard caller on authenticated self', async () => {
      const response = await readDashboard(
        new NextRequest(`http://localhost/tasks?wsId=${wsId}`)
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.totalActiveTasks).toBe(1);
      expect([...body.overdue, ...body.today, ...body.upcoming]).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: taskId })])
      );
    });
    it('keeps the Mira Tasks caller on authenticated self', async () => {
      const rpc = vi.spyOn(client, 'rpc');
      const response = await readMiraTasks(
        new Request(`http://localhost/tasks?wsId=${wsId}`)
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('stats');
      expect(rpc).toHaveBeenCalledWith(
        'get_user_accessible_tasks',
        expect.objectContaining({ p_user_id: user?.id, p_ws_id: wsId })
      );
      expect(await rpc.mock.results[0]?.value).toMatchObject({
        error: null,
        data: expect.arrayContaining([
          expect.objectContaining({ task_id: taskId }),
        ]),
      });
      rpc.mockRestore();
    });
    it.each([
      'get_user_accessible_tasks',
      'get_user_tasks_with_relations',
    ] as const)(
      '%s denies anon and a different subject through PostgREST',
      async (name) => {
        const args = { p_user_id: randomUUID(), p_ws_id: wsId };
        const anon = await anonymous.rpc(name, args);
        const other = await client.rpc(name, args);
        expect([anon.error?.code, other.error?.code]).toEqual([
          '42501',
          '42501',
        ]);
      }
    );
  }
);
