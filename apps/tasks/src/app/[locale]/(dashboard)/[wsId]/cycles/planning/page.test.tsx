import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspace: vi.fn(),
  loadTaskCycles: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
  sessionUser: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.sessionUser,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => {
    mocks.calls.push('createAdminClient');
    return mocks.createAdminClient(...args);
  },
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => {
    mocks.calls.push('getPermissions');
    return mocks.getPermissions(...args);
  },
  getWorkspace: mocks.getWorkspace,
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/cycles/task-cycles-page-model', () => ({
  loadTaskCycles: mocks.loadTaskCycles,
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/cycles/planning/cycle-planning-view', () => ({
  CyclePlanningView: () => null,
}));

import CyclePlanningPage from './page';

const WS_ID = '00000000-0000-4000-8000-000000000001';
const params = Promise.resolve({ wsId: WS_ID });
const admin = { tag: 'admin' };

describe('cycle planning page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls = [];
    mocks.sessionUser.mockResolvedValue({ id: 'user-1' });
    mocks.getWorkspace.mockResolvedValue({ id: WS_ID });
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.loadTaskCycles.mockResolvedValue([]);
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: () => false,
    });
  });

  it('loads cycles with a no-cookie admin client after the permission check', async () => {
    const element = await CyclePlanningPage({ params });

    expect(mocks.calls).toEqual(['getPermissions', 'createAdminClient']);
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.loadTaskCycles).toHaveBeenCalledWith(admin, WS_ID);
    expect(element.props).toMatchObject({ wsId: WS_ID, cycles: [] });
  });

  it('redirects members without manage_projects before creating the admin client', async () => {
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => true });

    await expect(CyclePlanningPage({ params })).rejects.toThrow(
      `NEXT_REDIRECT:/${WS_ID}`
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns not found without permissions and never creates the admin client', async () => {
    mocks.getPermissions.mockResolvedValue(null);

    await expect(CyclePlanningPage({ params })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
