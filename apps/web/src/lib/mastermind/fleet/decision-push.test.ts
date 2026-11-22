import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fleetStateSchema } from './contract';
import { fleetPushMessage, notifyNewFleetDecision } from './decision-push';
import { sampleFleetState } from './sample-state.fixture';
import { recordFleetAnswer, writeFleetState } from './store';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
  selectOwnerIds: vi.fn(),
  limit: vi.fn(),
  send: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/notifications/push-delivery', () => ({
  sendCustomPushMessageBatch: mocks.send,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
}));

const owner = 'fb165400-fe30-4d24-a419-8ac523c02a3e';
const other = 'befb6f13-e92f-461e-ab7d-ec2db6fb053c';

function fixture() {
  const date = new Date();
  const base = fleetStateSchema.parse(sampleFleetState());
  const [sample] = base.decisions;
  if (!sample) throw new Error('Missing sample fleet decision');
  const card = {
    ...sample,
    createdAt: date.toISOString(),
    body: 'One line.\nSecond line.',
  };
  return {
    ...base,
    generatedAt: card.createdAt,
    decisions: [card] as [typeof card],
    resolved: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MASTERMIND_FLEET_INBOX_PUSH_ENABLED', 'true');
  vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', owner);
  mocks.selectOwnerIds.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockResolvedValue({
    data: [
      { user_id: owner, token: 'owner-token' },
      { user_id: other, token: 'foreign-token' },
    ],
    error: null,
  });
  mocks.createAdminClient.mockReturnValue({
    from: () => ({ select: () => ({ in: mocks.selectOwnerIds }) }),
    rpc: mocks.rpc,
  });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.send.mockResolvedValue({ deliveredCount: 1, invalidTokens: [] });
});

afterEach(() => vi.unstubAllEnvs());

describe('fleet Inbox push', () => {
  it('dispatches each category and review once across concurrent publishes', async () => {
    const store = createMemoryMastermindStore();
    const state = fixture();
    const card = state.decisions[0];
    const snapshot = await writeFleetState(store, {
      ...state,
      decisions: [
        card,
        { ...card, id: 'urgent-review', kind: 'review', urgency: 'urgent' },
        { ...card, id: 'fyi', urgency: 'fyi' },
      ],
    });
    await Promise.all([
      notifyNewFleetDecision(store, null, snapshot),
      notifyNewFleetDecision(store, null, snapshot),
    ]);
    expect(mocks.selectOwnerIds).toHaveBeenCalledWith('user_id', [owner]);
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(
      mocks.send.mock.calls.map(([args]) => args.message.category).sort()
    ).toEqual([
      'mastermind_inbox_decision',
      'mastermind_inbox_fyi',
      'mastermind_inbox_urgent',
    ]);
    expect(mocks.send).toHaveBeenCalledWith({
      devices: [{ token: 'owner-token' }],
      message: expect.objectContaining({
        body: 'One line. Second line.',
        data: expect.objectContaining({
          entityId: 'urgent-review',
          userId: owner,
        }),
      }),
    });
  });

  it('skips answered, withdrawn and explicitly muted cards', async () => {
    const store = createMemoryMastermindStore();
    const state = fixture();
    const card = state.decisions[0];
    const published = await writeFleetState(store, {
      ...state,
      decisions: [
        card,
        { ...card, id: 'withdrawn' },
        { ...card, id: 'muted', urgency: 'fyi' },
      ],
    });
    await recordFleetAnswer(
      store,
      card.id,
      { action: 'hold' },
      'test-answer',
      new Date(),
      owner
    );
    await writeFleetState(store, {
      ...state,
      decisions: [card, { ...card, id: 'muted', urgency: 'fyi' }],
    });
    mocks.rpc.mockImplementation(async (_name, args) => ({
      data: args.p_event_type !== 'mastermind_inbox_fyi',
      error: null,
    }));
    await notifyNewFleetDecision(store, null, published);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('stops before device or provider access if disabled or the owner is ambiguous', async () => {
    const store = createMemoryMastermindStore();
    const snapshot = await writeFleetState(store, fixture());
    vi.stubEnv('MASTERMIND_FLEET_INBOX_PUSH_ENABLED', 'false');
    await notifyNewFleetDecision(store, null, snapshot);
    vi.stubEnv('MASTERMIND_FLEET_INBOX_PUSH_ENABLED', 'true');
    vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', `${owner},${other}`);
    await notifyNewFleetDecision(store, null, snapshot);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not look up devices when the configured owner lacks root permission', async () => {
    const store = createMemoryMastermindStore();
    const snapshot = await writeFleetState(store, fixture());
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await notifyNewFleetDecision(store, null, snapshot);
    expect(mocks.selectOwnerIds).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('never retries an uncertain provider send when a card reappears', async () => {
    const store = createMemoryMastermindStore();
    const snapshot = await writeFleetState(store, fixture());
    mocks.send.mockRejectedValueOnce(new Error('Unknown provider result'));
    await notifyNewFleetDecision(store, null, snapshot);
    await notifyNewFleetDecision(store, null, snapshot);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('stops at the durable daily budget after a process restart', async () => {
    const store = createMemoryMastermindStore();
    const snapshot = await writeFleetState(store, fixture());
    const day = new Date().toISOString().slice(0, 10);
    await store.set(`mastermind:fleet:decision-push:budget:${day}`, '100', {
      ttlMs: 60_000,
    });
    await notifyNewFleetDecision(store, null, snapshot);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('uses different transport priority for a decision and an FYI', () => {
    const card = fixture().decisions[0];
    const now = Date.now();
    expect(fleetPushMessage(card, owner, 'en', now)).toMatchObject({
      androidPriority: 'high',
      interruptionLevel: 'time-sensitive',
    });
    expect(
      fleetPushMessage({ ...card, urgency: 'fyi' }, owner, 'en', now)
    ).toMatchObject({
      androidPriority: 'normal',
      interruptionLevel: 'active',
    });
  });
});
