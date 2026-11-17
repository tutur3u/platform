import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reserveCitationGrounding } from './grounding-budget';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  schema: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));

const actorId = '00000000-0000-4000-8000-00000000a401';
const now = () => 123_000;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockReturnValue({ schema: mocks.schema });
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe('authenticated grounding budget', () => {
  it('calls the service-only RPC with a digest and separate limits', async () => {
    expect(await reserveCitationGrounding(actorId, { now })).toBe(true);
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith({ noCookie: true });
    expect(mocks.schema).toHaveBeenCalledExactlyOnceWith('private');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('reserve_cite_budget', {
      p_scope: 'ground',
      p_actor_hash: createHash('sha256').update(actorId).digest('hex'),
      p_window: 2,
      p_actor_limit: 30,
      p_global_limit: 600,
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(actorId);
  });

  it.each([
    ['actor', 30, 30],
    ['global', 0, 600],
  ])(
    'refuses a %s limit denial from the shared adapter',
    async (_limit, actorCount, globalCount) => {
      mocks.rpc.mockImplementation(
        async (_name, { p_actor_limit, p_global_limit }) => ({
          data: actorCount < p_actor_limit && globalCount < p_global_limit,
          error: null,
        })
      );
      expect(await reserveCitationGrounding(actorId, { now })).toBe(false);
    }
  );

  it('fails closed for missing storage, RPC errors and transport failures', async () => {
    expect(
      await reserveCitationGrounding(actorId, { store: async () => null })
    ).toBe(false);
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: { code: 'XX000' } })
      .mockRejectedValueOnce(new Error('Database unavailable'));
    expect(await reserveCitationGrounding(actorId, { now })).toBe(false);
    expect(await reserveCitationGrounding(actorId, { now })).toBe(false);
  });
});
