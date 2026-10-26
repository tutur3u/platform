import { describe, expect, it, vi } from 'vitest';
import type { LegacyActionName } from './legacy-action-contracts';
import {
  createLegacyActionPorts,
  type LegacyActionSupplier,
} from './legacy-action-ports';
import { refreshConfirmedAction } from './legacy-action-refresh';

function fixture(authenticated = true) {
  const supplier = {
    resetGuestPassword: vi
      .fn<LegacyActionSupplier['resetGuestPassword']>()
      .mockResolvedValue({ error: 'RESET_FAILED' }),
    guestLogin: vi
      .fn<LegacyActionSupplier['guestLogin']>()
      .mockResolvedValue({ error: 'supplier denial' }),
    togglePlanLock: vi
      .fn<LegacyActionSupplier['togglePlanLock']>()
      .mockResolvedValue({ error: 'supplier denial' }),
    removeUserFromPlan: vi
      .fn<LegacyActionSupplier['removeUserFromPlan']>()
      .mockResolvedValue({ error: 'supplier denial' }),
    createPoll: vi
      .fn<LegacyActionSupplier['createPoll']>()
      .mockResolvedValue({ error: 'supplier denial' }),
    deletePoll: vi
      .fn<LegacyActionSupplier['deletePoll']>()
      .mockResolvedValue({ error: 'supplier denial' }),
    addPollOption: vi
      .fn<LegacyActionSupplier['addPollOption']>()
      .mockResolvedValue({ error: 'supplier denial' }),
    deletePollOption: vi
      .fn<LegacyActionSupplier['deletePollOption']>()
      .mockResolvedValue({ error: 'supplier denial' }),
    submitVote: vi
      .fn<LegacyActionSupplier['submitVote']>()
      .mockResolvedValue({ error: 'supplier denial' }),
    toggleWherePoll: vi
      .fn<LegacyActionSupplier['toggleWherePoll']>()
      .mockResolvedValue({ error: 'supplier denial' }),
  };
  const load = vi.fn(async () => supplier);
  const actor = vi.fn(async () => (authenticated ? { id: 'actor' } : null));
  return {
    supplier,
    load,
    actor,
    ports: createLegacyActionPorts({ load, actor }),
  };
}

const mappings: { name: LegacyActionName; args: unknown[] }[] = [
  {
    name: 'resetGuestPassword',
    args: ['plan', '00000000-0000-4000-8000-000000000001', 'new password'],
  },
  {
    name: 'guestLogin',
    args: ['plan', { name: 'Guest', password: 'fixture' }],
  },
  { name: 'togglePlanLock', args: ['plan', true] },
  { name: 'removeUserFromPlan', args: ['plan', 'participant'] },
  {
    name: 'createPoll',
    args: ['plan', { name: 'Location', allow_anonymous_updates: false }],
  },
  { name: 'deletePoll', args: ['plan', 'poll'] },
  {
    name: 'addPollOption',
    args: ['plan', { pollId: 'poll', value: 'Option', userType: 'PLATFORM' }],
  },
  {
    name: 'deletePollOption',
    args: ['plan', 'option', { userType: 'PLATFORM' }],
  },
  {
    name: 'submitVote',
    args: [
      'plan',
      { pollId: 'poll', optionIds: ['one', 'two'], userType: 'PLATFORM' },
    ],
  },
  { name: 'toggleWherePoll', args: ['plan', false] },
];

describe('legacy plan transport ports', () => {
  it.each(mappings)(
    'maps $name to its original positional supplier and preserves denial',
    async ({ name, args }) => {
      const f = fixture();
      expect(await f.ports[name](args)).toEqual({
        error:
          name === 'resetGuestPassword' ? 'RESET_FAILED' : 'supplier denial',
      });
      expect(f.load).toHaveBeenCalledTimes(1);
      for (const [key, supplier] of Object.entries(f.supplier)) {
        expect(supplier).toHaveBeenCalledTimes(key === name ? 1 : 0);
      }
      expect(f.supplier[name]).toHaveBeenCalledWith(...args);
    }
  );

  it.each(mappings)(
    'rejects malformed and extra $name arguments before supplier loading',
    async ({ name, args }) => {
      const f = fixture();
      await expect(f.ports[name](null)).rejects.toThrow();
      await expect(f.ports[name]([...args, 'extra'])).rejects.toThrow();
      expect(f.load).not.toHaveBeenCalled();
      expect(f.actor).not.toHaveBeenCalled();
    }
  );

  it('rejects extra object properties and nonboolean lock input', async () => {
    const f = fixture();
    await expect(
      f.ports.guestLogin([
        'plan',
        { name: 'Guest', password: '', actorId: 'foreign' },
      ])
    ).rejects.toThrow();
    await expect(f.ports.togglePlanLock(['plan', 'true'])).rejects.toThrow();
    // Stored password hashes are no longer an accepted guest credential field.
    await expect(
      f.ports.submitVote([
        'plan',
        {
          userType: 'GUEST',
          guestId: 'guest',
          guestPasswordHash: 'stored-hash',
          pollId: 'poll',
          optionIds: [],
        },
      ])
    ).rejects.toThrow();
    expect(f.load).not.toHaveBeenCalled();
  });

  it.each(mappings.filter(({ name }) => name !== 'guestLogin'))(
    'denies unsigned PLATFORM $name before supplier loading',
    async ({ name, args }) => {
      const f = fixture(false);
      const errors: Partial<Record<LegacyActionName, string>> = {
        resetGuestPassword: 'UNAUTHORIZED',
        removeUserFromPlan: 'Not authenticated',
        deletePoll: 'Authentication required',
      };
      expect(await f.ports[name](args)).toEqual({
        error: errors[name] ?? 'Unauthorized',
      });
      expect(f.load).not.toHaveBeenCalled();
    }
  );

  it('preserves anonymous guest login and exact credential-bound guest calls', async () => {
    const f = fixture(false);
    await f.ports.guestLogin(['plan', { name: 'Guest', password: 'fixture' }]);
    const participant = {
      userType: 'GUEST',
      guestId: 'guest',
      guestSession: 'fixture-session',
    };
    await f.ports.addPollOption([
      'plan',
      { ...participant, pollId: 'poll', value: 'Option' },
    ]);
    await f.ports.submitVote([
      'plan',
      { ...participant, pollId: 'poll', optionIds: [] },
    ]);
    expect(f.load).toHaveBeenCalledTimes(3);
    expect(f.actor).not.toHaveBeenCalled();
    expect(f.supplier.submitVote).toHaveBeenCalledWith('plan', {
      ...participant,
      pollId: 'poll',
      optionIds: [],
    });
  });

  it('rejects missing guest credentials and guest deletion without supplier loading', async () => {
    const f = fixture(false);
    expect(
      await f.ports.submitVote([
        'plan',
        { userType: 'GUEST', pollId: 'poll', optionIds: [] },
      ])
    ).toEqual({ error: 'Unauthorized' });
    expect(
      await f.ports.deletePollOption(['plan', 'option', { userType: 'GUEST' }])
    ).toEqual({ error: 'Unauthorized' });
    expect(f.load).not.toHaveBeenCalled();
  });

  it('retains a canonical ownership denial without claiming a visible refresh', async () => {
    const f = fixture();
    f.supplier.togglePlanLock.mockResolvedValue({ error: 'Forbidden' });
    const refresh = vi.fn();
    const result = await f.ports.togglePlanLock(['foreign-plan', true]);
    expect(await refreshConfirmedAction(result, refresh)).toEqual({
      error: 'Forbidden',
    });
    expect(f.supplier.togglePlanLock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes only a confirmed mutation and retains its exact response', async () => {
    const result = { data: { success: true, operationId: 'same-operation' } };
    const refresh = vi.fn(async () => {});
    expect(await refreshConfirmedAction(result, refresh)).toBe(result);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await refreshConfirmedAction({ error: 'Failed' }, refresh)).toEqual({
      error: 'Failed',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('retains a confirmed mutation response when navigation refresh fails', async () => {
    const result = { data: { success: true, operationId: 'confirmed-once' } };
    const refresh = vi.fn(async () => {
      throw new Error('fixture navigation unavailable');
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await refreshConfirmedAction(result, refresh)).toBe(result);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(warning).toHaveBeenCalledWith(
        'Meet view refresh failed after a confirmed action'
      );
    } finally {
      warning.mockRestore();
    }
  });

  it.each([
    { userType: 'GUEST', pollId: 'poll', value: 'Option' },
    { userType: 'GUEST', pollId: 'poll', value: 'Option', guestId: 'guest' },
    {
      userType: 'GUEST',
      pollId: 'poll',
      value: 'Option',
      guestSession: 'session',
    },
  ])(
    'denies guest option creation without both credentials: %j',
    async (participant) => {
      const f = fixture(false);
      expect(await f.ports.addPollOption(['plan', participant])).toEqual({
        error: 'Unauthorized',
      });
      expect(f.load).not.toHaveBeenCalled();
      expect(f.actor).not.toHaveBeenCalled();
      expect(f.supplier.addPollOption).not.toHaveBeenCalled();
    }
  );

  it('does not refresh an ambiguous mutation result containing both data and an error', async () => {
    const result = {
      data: { operationId: 'not-confirmed' },
      error: 'Rejected',
    };
    const refresh = vi.fn();
    expect(await refreshConfirmedAction(result, refresh)).toBe(result);
    expect(refresh).not.toHaveBeenCalled();
  });
});
