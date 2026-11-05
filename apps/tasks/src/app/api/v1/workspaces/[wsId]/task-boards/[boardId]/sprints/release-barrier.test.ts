import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SprintRouteParams } from './_lib';

const mocks = vi.hoisted(() => ({
  requireBoardAccess: vi.fn(),
  from: vi.fn(() => {
    throw new Error('Release barrier must prevent database queries');
  }),
  rpc: vi.fn(() => {
    throw new Error('Release barrier must prevent RPC calls');
  }),
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_TARGET_APP: 'platform',
}));
vi.mock('../lists/access', () => ({
  requireBoardAccess: (...args: unknown[]) => mocks.requireBoardAccess(...args),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    <T>(
      handler: (
        request: NextRequest,
        auth: { supabase: { from: typeof mocks.from }; user: { id: string } },
        params: T
      ) => Promise<Response> | Response
    ) =>
    async (
      request: NextRequest,
      context: { params: Promise<T> | T }
    ) =>
      handler(
        request,
        {
          supabase: { from: mocks.from },
          user: { id: 'synthetic-user' },
        },
        await context.params
      ),
}));

import { POST as END } from './[sprintId]/end/route';
import { DELETE, PATCH } from './[sprintId]/route';
import { POST as START } from './[sprintId]/start/route';
import { POST as MOVE } from './[sprintId]/tasks/route';
import { GET, POST as ADD, PUT } from './route';
import { POST as UNPLAN } from './unplanned/route';

const params: SprintRouteParams = {
  wsId: '00000000-0000-4000-8000-000000000001',
  boardId: '00000000-0000-4000-8000-000000000002',
  sprintId: '00000000-0000-4000-8000-000000000003',
};
const TASK_ID = '00000000-0000-4000-8000-000000000004';
const gate = {
  code: 'BOARD_CYCLES_NOT_ENABLED',
  error: 'Board cycles are not enabled for this workspace',
};
const cases = [
  {
    name: 'set length',
    method: 'PUT',
    handler: PUT,
    body: { sprint_length_weeks: 1 },
  },
  {
    name: 'clear length',
    method: 'PUT',
    handler: PUT,
    body: { sprint_length_weeks: null },
  },
  {
    name: 'add',
    method: 'POST',
    handler: ADD,
    body: {},
  },
  {
    name: 'edit',
    method: 'PATCH',
    handler: PATCH,
    body: { goal: 'Synthetic goal' },
  },
  {
    name: 'remove',
    method: 'DELETE',
    handler: DELETE,
    body: undefined,
  },
  {
    name: 'start',
    method: 'POST',
    handler: START,
    body: {},
  },
  {
    name: 'end',
    method: 'POST',
    handler: END,
    body: { decisions: {}, goal_result: 'met' },
  },
  {
    name: 'move',
    method: 'POST',
    handler: MOVE,
    body: { task_ids: [TASK_ID] },
  },
  {
    name: 'unplan',
    method: 'POST',
    handler: UNPLAN,
    body: { task_ids: [TASK_ID] },
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

for (const mode of ['member', 'guest'] as const) {
  describe(`disabled release for ${mode}`, () => {
    beforeEach(() => {
      mocks.requireBoardAccess.mockResolvedValue({
        access: { mode, permission: 'edit' },
        boardId: params.boardId,
        wsId: params.wsId,
        sbAdmin: { from: mocks.from, rpc: mocks.rpc },
        supabase: { from: mocks.from },
        user: { id: 'synthetic-user' },
      });
    });

    for (const testCase of cases) {
      it(`refuses ${testCase.name} before database access`, async () => {
        const request = new NextRequest('http://localhost/api/sprints', {
          method: testCase.method,
          headers: { 'Content-Type': 'application/json' },
          body: testCase.body === undefined ? undefined : JSON.stringify(testCase.body),
        });
        const response = await testCase.handler(request, { params: Promise.resolve(params) });
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual(gate);
        expect(mocks.requireBoardAccess).toHaveBeenCalledOnce();
        expect(mocks.from).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
      });
    }

    it('reads the unavailable shape without querying the excluded schema', async () => {
      const response = await GET(new NextRequest('http://localhost/api/sprints'), {
        params: Promise.resolve(params),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        cyclesEnabled: false,
        schemaAvailable: false,
        sprintLengthWeeks: null,
        sprints: [],
        unplannedTaskIds: [],
      });
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });
}
