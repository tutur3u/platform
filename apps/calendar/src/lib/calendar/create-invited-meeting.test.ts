import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { SUPPORTED_COLORS } from '@tuturuuu/types/primitives/SupportedColors';
import { v7 } from 'uuid';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  provider: vi.fn(),
  state: { fresh: true, completed: false },
}));
vi.mock('./provider-writes', () => ({ createProviderEvent: mocks.provider }));
vi.mock('@tuturuuu/utils/coordination', () => ({
  coordinationKey: (id: string) => id,
  coordinate: vi.fn(async ({ action }: { action: string }) => {
    if (action === 'acquire') return { outcome: 'acquired', ...mocks.state };
    return { outcome: action === 'complete' ? 'completed' : 'released' };
  }),
}));
vi.mock('@/lib/workspace-encryption', () => ({
  getWorkspaceKey: vi.fn(async () => null),
  encryptEventForStorage: vi.fn(
    async (_ws: string, fields: Record<string, unknown>) => ({
      ...fields,
      title: `encrypted:${fields.title}`,
      is_encrypted: true,
    })
  ),
  decryptEventFromStorage: vi.fn(async (event: Record<string, unknown>) => ({
    ...event,
    title: String(event.title).replace('encrypted:', ''),
  })),
}));

import {
  createInvitedMeeting,
  meetingRequestIdentity,
} from './create-invited-meeting';
import type { ResolvedCalendarSource } from './source-resolver';

type Row = Record<string, unknown>;
function database() {
  const rows = new Map<string, Row>();
  const control = {
    insertError: null as unknown,
    updateError: null as unknown,
  };
  const from = vi.fn(() => {
    let operation = 'read';
    let value: Row = {};
    const filters: Row = {};
    const result = async () => {
      if (operation === 'insert') {
        if (!SUPPORTED_COLORS.includes(value.color as never))
          return { error: { code: '23503' }, data: null };
        if (control.insertError)
          return { error: control.insertError, data: null };
        if (rows.has(String(value.id)))
          return { error: { code: '23505' }, data: null };
        rows.set(String(value.id), { ...value });
        return { data: rows.get(String(value.id)), error: null };
      }
      const row = rows.get(String(filters.id));
      if (!row || row.ws_id !== filters.ws_id)
        return { data: null, error: null };
      if (operation === 'update') {
        if (control.updateError)
          return { data: null, error: control.updateError };
        rows.set(String(filters.id), { ...row, ...value });
      }
      return { data: rows.get(String(filters.id)), error: null };
    };
    const builder = {
      select: () => builder,
      eq: (key: string, expected: unknown) => {
        filters[key] = expected;
        return builder;
      },
      insert: (payload: Row) => {
        operation = 'insert';
        value = payload;
        return builder;
      },
      update: (payload: Row) => {
        operation = 'update';
        value = payload;
        return builder;
      },
      single: result,
      maybeSingle: result,
    };
    return builder;
  });
  return { rows, control, client: { from } as unknown as TypedSupabaseClient };
}
const source: ResolvedCalendarSource = {
  provider: 'google',
  connectionId: 'connection',
  workspaceCalendarId: null,
  externalCalendarId: 'primary',
  accessRole: 'owner',
  accountEmail: 'organizer@example.com',
  accountName: 'Organizer',
  accessToken: 'test-token',
  label: 'Primary',
  color: null,
};
let db: ReturnType<typeof database>;
let input: Parameters<typeof createInvitedMeeting>[0]['input'];
const create = (
  overrides: Partial<Parameters<typeof createInvitedMeeting>[0]> = {}
) =>
  createInvitedMeeting({
    sbAdmin: db.client,
    wsId: 'workspace',
    userId: 'actor',
    source,
    input,
    ...overrides,
  });
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.state = { fresh: true, completed: false };
  db = database();
  input = {
    requestId: v7(),
    title: 'Planning',
    description: 'Private notes',
    start_at: '2026-11-01T05:30:00Z',
    end_at: '2026-11-01T07:30:00Z',
    invitation: {
      guests: [{ email: 'guest@example.com', optional: true }],
      timeZone: 'America/New_York',
    },
  };
  mocks.provider.mockImplementation(async () => {
    expect([...db.rows.values()][0]).toHaveProperty(
      'scheduling_metadata.meeting_delivery',
      'pending'
    );
    return { externalEventId: 'provider-event', externalCalendarId: 'primary' };
  });
});

describe('durable invitation creation', () => {
  it('reserves encrypted event data before sending and binds the provider result', async () => {
    const event = await create();
    expect(event.title).toBe('Planning');
    const stored = [...db.rows.values()][0]!;
    expect(stored.title).toBe('encrypted:Planning');
    expect(stored.color).toBe('BLUE');
    expect(stored.external_event_id).toBe('provider-event');
    expect(stored).toHaveProperty(
      'scheduling_metadata.meeting_delivery',
      'sent'
    );
    expect(mocks.provider).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: stored.id,
        event: expect.objectContaining({ invitation: input.invitation }),
      })
    );
  });
  it('canonicalizes color before reserving and hashing a retry', async () => {
    input.color = ' blue ';
    const first = await create();
    input.color = 'BLUE';
    mocks.state = { fresh: false, completed: true };
    expect(await create()).toEqual(first);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });
  it('rejects unknown colors before reserving or sending', async () => {
    input.color = 'ultraviolet';
    await expect(create()).rejects.toThrow();
    expect(db.rows.size).toBe(0);
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it('returns an already-created event without sending again', async () => {
    const first = await create();
    mocks.state = { fresh: false, completed: true };
    expect(await create()).toEqual(first);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });
  it('does not recreate a deleted completed meeting', async () => {
    await create();
    db.rows.clear();
    mocks.state = { fresh: false, completed: true };
    await expect(create()).rejects.toMatchObject({ status: 409 });
    expect(db.rows.size).toBe(0);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });
  it('rejects changed attendees or dates under the same request', async () => {
    await create();
    mocks.state = { fresh: false, completed: true };
    input = {
      ...input,
      invitation: {
        ...input.invitation,
        guests: [{ email: 'different@example.com' }],
      },
    };
    await expect(create()).rejects.toMatchObject({ status: 409 });
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });
  it('retains a pending reservation after provider timeout and retries with the same provider identity', async () => {
    mocks.provider.mockRejectedValueOnce(new Error('timeout'));
    await expect(create()).rejects.toThrow('timeout');
    const id = [...db.rows.keys()][0];
    expect(db.rows.get(id!)).toHaveProperty(
      'scheduling_metadata.meeting_delivery',
      'pending'
    );
    mocks.state = { fresh: false, completed: false };
    await create();
    expect(
      mocks.provider.mock.calls.map(([args]) => args.idempotencyKey)
    ).toEqual([id, id]);
  });
  it.each(['exception', 'empty'])(
    'recovers an existing reservation after expiration following %s',
    async (outcome) => {
      const now = Date.now();
      if (outcome === 'exception')
        mocks.provider.mockRejectedValueOnce(new Error('timeout'));
      else mocks.provider.mockResolvedValueOnce(null);
      await expect(create()).rejects.toThrow();
      const id = [...db.rows.keys()][0];
      // Even after the coordination record expires, the DB reservation is authoritative.
      vi.spyOn(Date, 'now').mockReturnValue(now + 3 * 60 * 60_000);
      await create();
      expect(
        mocks.provider.mock.calls.map(([args]) => args.idempotencyKey)
      ).toEqual([id, id]);
      expect(db.rows.get(id!)).toHaveProperty(
        'scheduling_metadata.meeting_delivery',
        'sent'
      );
    }
  );
  it('never recreates an expired reservation after deletion and coordination eviction', async () => {
    const now = Date.now();
    await create();
    db.rows.clear();
    vi.spyOn(Date, 'now').mockReturnValue(now + 3 * 60 * 60_000);
    await expect(create()).rejects.toMatchObject({ status: 409 });
    expect(db.rows.size).toBe(0);
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });
  it('does not send a new request outside the creation window', async () => {
    input.requestId = v7({ msecs: Date.now() - 16 * 60_000 });
    await expect(create()).rejects.toMatchObject({ status: 409 });
    expect(db.rows.size).toBe(0);
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it('preserves provider idempotency when storing the provider response fails', async () => {
    db.control.updateError = new Error('database unavailable');
    await expect(create()).rejects.toThrow('database unavailable');
    const id = [...db.rows.keys()][0];
    db.control.updateError = null;
    mocks.state = { fresh: false, completed: false };
    await create();
    expect(
      mocks.provider.mock.calls.map(([args]) => args.idempotencyKey)
    ).toEqual([id, id]);
    expect(db.rows.get(id!)).toHaveProperty(
      'scheduling_metadata.meeting_delivery',
      'sent'
    );
  });
  it('does not send if the durable reservation cannot be persisted', async () => {
    db.control.insertError = new Error('database unavailable');
    await expect(create()).rejects.toThrow('database unavailable');
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it('does not send a completed request with an inconsistent provider reference', async () => {
    await create();
    const row = [...db.rows.values()][0]!;
    row.external_event_id = null;
    mocks.state = { fresh: false, completed: true };
    await expect(create()).rejects.toMatchObject({ status: 409 });
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });
  it('binds request identity to both actor and workspace', () => {
    const id = meetingRequestIdentity('workspace', 'actor', input.requestId);
    expect(meetingRequestIdentity('other', 'actor', input.requestId)).not.toBe(
      id
    );
    expect(
      meetingRequestIdentity('workspace', 'other', input.requestId)
    ).not.toBe(id);
  });
  it('requires a connected sender and ordered time range before reservation', async () => {
    await expect(
      create({
        source: {
          provider: 'tuturuuu',
          workspaceCalendarId: 'local-calendar',
          label: 'Local',
          color: null,
        },
      })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      create({ input: { ...input, end_at: input.start_at } })
    ).rejects.toMatchObject({ status: 400 });
    expect(db.rows.size).toBe(0);
    expect(mocks.provider).not.toHaveBeenCalled();
  });
});
