import { beforeEach, expect, it, vi } from 'vitest';
import {
  MIRA_ACCOUNT_CONFIRMATION_KEY,
  MIRA_ACCOUNT_CONFIRMATION_VERSION,
} from '../../features/live-assistant/account-confirmation';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';

const f = vi.hoisted(() => ({
  database: vi.fn(),
  authUser: vi.fn(),
  room: vi.fn(),
}));
vi.mock('./room', () => ({ liveRoomCommand: f.room }));
vi.mock('./storage', () => ({
  liveAuthUser: f.authUser,
  liveDatabase: f.database,
}));

import {
  readLivePaidAccount,
  requireCurrentPrivateGrant,
} from './private-grant';

const owner = '00000000-0000-4000-8000-000000000001';
const personal = '00000000-0000-4000-8000-000000000002';
const product = '00000000-0000-4000-8000-000000000003';
const enabled = { MEET_PAID_TIER_HOSTING_ENABLED: 'true' } as LiveEnvironment;

function fixture(tier: string | null) {
  f.database.mockImplementation((_env, path: string) => {
    if (path.startsWith('workspaces?')) return [{ id: personal }];
    if (path.startsWith('workspace_subscriptions?'))
      return [
        { created_at: '2026-11-01', status: 'active', product_id: product },
      ];
    return [{ id: product, tier }];
  });
}

beforeEach(() => vi.resetAllMocks());

it('requires the exact hosting switch before any subscription read', async () => {
  fixture('PRO');
  for (const value of [undefined, '', 'TRUE', '1'])
    expect(
      await readLivePaidAccount(
        { MEET_PAID_TIER_HOSTING_ENABLED: value } as LiveEnvironment,
        owner
      )
    ).toBe(false);
  expect(f.database).not.toHaveBeenCalled();
});

it('admits only paid Personal tiers and reads products from the private schema', async () => {
  fixture('PRO');
  expect(await readLivePaidAccount(enabled, owner)).toBe(true);
  expect(f.database).toHaveBeenLastCalledWith(
    enabled,
    expect.stringContaining('workspace_subscription_products?'),
    { schema: 'private' }
  );
  fixture('FREE');
  expect(await readLivePaidAccount(enabled, owner)).toBe(false);
});

it('fails closed for a missing Personal workspace or product tier', async () => {
  f.database.mockResolvedValueOnce([]);
  expect(await readLivePaidAccount(enabled, owner)).toBe(false);
  fixture(null);
  await expect(readLivePaidAccount(enabled, owner)).rejects.toThrow();
});

function grant(app: 'meet' | 'parley') {
  const version = '2026-11-13-private-v1';
  const identity = {
    workspaceId: personal,
    isHost: false,
    displayName: 'Viewer',
  };
  const saved = {
    claims: {
      audience: 'meet-live',
      app,
      ownerId: owner,
      meetingId: personal,
      sessionId: product,
      billingWorkspaceId: personal,
      mode: 'personal',
      consentVersion: version,
      consentRevision: 1,
      expiresAt: 1,
    },
    identity,
  } satisfies Pick<SavedSession, 'claims' | 'identity'>;
  f.room.mockResolvedValue({
    choice: {
      choice: 'continue',
      accountId: owner,
      meetingId: personal,
      version,
      revision: 1,
    },
  });
  return saved;
}

const uxV2 = { ...enabled, MEET_UX_V2: 'true' };

it('refuses missing and old account confirmations with Meet UX v2 enabled', async () => {
  const saved = grant('meet');
  f.authUser
    .mockResolvedValueOnce({ id: owner, app_metadata: {} })
    .mockResolvedValueOnce({
      id: owner,
      app_metadata: { [MIRA_ACCOUNT_CONFIRMATION_KEY]: 'obsolete' },
    });
  for (const attempt of [1, 2]) {
    await expect(requireCurrentPrivateGrant(uxV2, saved)).rejects.toThrow(
      'Private Mira account confirmation is unavailable'
    );
    expect(f.authUser).toHaveBeenCalledTimes(attempt);
  }
});

it('fails closed when the Worker cannot look up the authenticated account', async () => {
  f.authUser.mockRejectedValue(new Error('Auth unavailable'));
  await expect(requireCurrentPrivateGrant(uxV2, grant('meet'))).rejects.toThrow(
    'Private Mira account confirmation is unavailable'
  );
});

it('keeps the existing grant for Parley and for Meet with the flag off', async () => {
  await expect(
    requireCurrentPrivateGrant(uxV2, grant('parley'))
  ).resolves.toBeUndefined();
  await expect(
    requireCurrentPrivateGrant(enabled, grant('meet'))
  ).resolves.toBeUndefined();
  expect(f.authUser).not.toHaveBeenCalled();
});

it('reuses a current confirmation for this account until its TTL expires', async () => {
  vi.useFakeTimers();
  try {
    const saved = grant('meet');
    f.authUser
      .mockResolvedValueOnce({
        id: owner,
        app_metadata: {
          [MIRA_ACCOUNT_CONFIRMATION_KEY]: {
            version: MIRA_ACCOUNT_CONFIRMATION_VERSION,
            confirmedAt: '2026-11-25T12:00:00.000Z',
            locale: 'en',
            textHash: 'a'.repeat(64),
          },
        },
      })
      .mockResolvedValue({ id: owner, app_metadata: {} });
    await requireCurrentPrivateGrant(uxV2, saved);
    vi.advanceTimersByTime(59_999);
    await requireCurrentPrivateGrant(uxV2, saved);
    expect(f.authUser).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    await expect(requireCurrentPrivateGrant(uxV2, saved)).rejects.toThrow(
      'Private Mira account confirmation is unavailable'
    );
    expect(f.authUser).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
