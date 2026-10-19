import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  actor: vi.fn(),
  client: vi.fn(),
  admin: vi.fn(),
  update: vi.fn(),
  single: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: database.actor,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: database.client,
  createAdminClient: database.admin,
}));
vi.mock('next/cache', () => ({ revalidatePath: database.revalidate }));

import { togglePlanLock } from '../../../../packages/apis/src/meet/actions/plans';

describe('canonical plan owner authorization through the native port supplier', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('resolves the real supplier actor and owner, then denies a wrong actor without mutation', async () => {
    const eq = vi.fn(() => ({ single: database.single }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select, update: database.update }));
    database.admin.mockResolvedValue({ from });
    database.client.mockResolvedValue({});
    database.actor.mockResolvedValue({ user: { id: 'wrong-actor' } });
    database.single.mockResolvedValue({ data: { creator_id: 'owner' } });
    expect(await togglePlanLock('foreign-plan', true)).toEqual({
      error: 'Forbidden',
    });
    expect(database.actor).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('id', 'foreign-plan');
    expect(database.update).not.toHaveBeenCalled();
    expect(database.revalidate).not.toHaveBeenCalled();
  });
});
