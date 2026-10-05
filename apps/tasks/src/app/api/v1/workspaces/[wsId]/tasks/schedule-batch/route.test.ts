import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  read: vi.fn(),
  options: {} as Record<string, unknown>,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown, options: Record<string, unknown>) => {
    mocks.options = options;
    return handler;
  },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@/lib/calendar/task-schedule-batch', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readTaskScheduleBatch: mocks.read,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => {},
}));

import { GET } from './route';

const workspace = '00000000-0000-4000-8000-000000000001';
const task = '00000000-0000-4000-8000-000000000002';
const call = (query: string, wsId = workspace) =>
  (
    GET as unknown as (
      request: Request,
      auth: unknown,
      params: unknown
    ) => Promise<Response>
  )(
    new Request(`https://tasks.test/api?${query}`),
    { user: { id: 'verified' }, supabase: 'session' },
    { wsId }
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue('admin');
  mocks.read.mockResolvedValue({ minutesByTaskId: {}, settingsByTaskId: {} });
});
describe('schedule batch API contract', () => {
  it('passes server-verified actor and deduplicated IDs to the service', async () => {
    const response = await call(`taskIds=${task},${task}&personal=true`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.read).toHaveBeenCalledWith({
      supabase: 'session',
      admin: 'admin',
      actorId: 'verified',
      wsId: workspace,
      taskIds: [task],
      personal: true,
    });
    expect(mocks.options).toEqual({
      allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] },
    });
  });
  it.each([
    ['missing', ''],
    ['invalid task', 'taskIds=bad'],
    ['oversized', `taskIds=${Array(101).fill(task).join(',')}`],
  ])('rejects %s before private reads', async (_name, query) => {
    expect((await call(query)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('rejects an invalid workspace', async () => {
    expect((await call(`taskIds=${task}`, 'bad')).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
