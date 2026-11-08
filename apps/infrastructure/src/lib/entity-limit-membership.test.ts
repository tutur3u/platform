import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  membership: 'MEMBER' as string | null,
  allowed: true,
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: vi.fn(async () => ({ id: 'actor' })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(async () =>
    mocks.membership === null
      ? null
      : {
          membershipType: mocks.membership,
          containsPermission: () => mocks.allowed,
        }
  ),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({ rpc: mocks.rpc, from: mocks.from })),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import {
  addPlatformEntityCreationLimitTable,
  reattachPlatformEntityCreationLimitTrigger,
  updatePlatformEntityCreationLimitMetadata,
  updatePlatformEntityCreationLimitTier,
} from '../app/[locale]/(dashboard)/[wsId]/entity-creation-limits/actions';
import { GET } from '../app/api/v1/infrastructure/entity-creation-limits/route';

const form = () => {
  const data = new FormData();
  data.set('targetTable', 'tasks');
  return data;
};
const actions = [
  [
    'add',
    () => addPlatformEntityCreationLimitTable(ROOT_WORKSPACE_ID, form()),
    'table-added',
  ],
  [
    'metadata',
    () =>
      updatePlatformEntityCreationLimitMetadata(
        ROOT_WORKSPACE_ID,
        'tasks',
        form()
      ),
    'metadata-saved',
  ],
  [
    'tier',
    () =>
      updatePlatformEntityCreationLimitTier(
        ROOT_WORKSPACE_ID,
        'tasks',
        'FREE',
        form()
      ),
    'tier-saved',
  ],
  [
    'reattach',
    () =>
      reattachPlatformEntityCreationLimitTrigger(ROOT_WORKSPACE_ID, 'tasks'),
    'trigger-reattached',
  ],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership = 'MEMBER';
  mocks.allowed = true;
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.from.mockReturnValue({
    select: () => ({
      order: () => ({ order: async () => ({ data: [], error: null }) }),
    }),
  });
});

describe.each(['GUEST', null])(
  'entity limits deny membership %s with permission',
  (membership) => {
    beforeEach(() => {
      mocks.membership = membership;
    });
    it('returns 403 before reading global metadata', async () => {
      expect((await GET()).status).toBe(403);
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it.each(actions)('denies %s before mutation', async (_name, run) => {
      await expect(run()).rejects.toThrow('Forbidden');
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  }
);

describe('entity limits allow root members with permission', () => {
  it('reads metadata', async () => {
    expect((await GET()).status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('platform_entity_creation_limits');
  });
  it.each(actions)('allows %s', async (_name, run, status) => {
    await expect(run()).resolves.toEqual({ status });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
});

describe('entity limits deny root members without permission', () => {
  beforeEach(() => {
    mocks.allowed = false;
  });
  it('denies reads', async () => {
    expect((await GET()).status).toBe(403);
  });
  it.each(actions)('denies %s', async (_name, run) => {
    await expect(run()).rejects.toThrow('Forbidden');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
