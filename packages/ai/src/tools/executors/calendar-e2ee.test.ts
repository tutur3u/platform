import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import {
  executeCheckE2EEStatus,
  executeCreateEvent,
  executeGetUpcomingEvents,
  executeUpdateEvent,
} from './calendar';
import { ENCRYPTION_UNAVAILABLE_MESSAGE } from './helpers/encryption';

const mocks = vi.hoisted(() => ({
  keyLookup: vi.fn(),
  master: vi.fn(),
  decryptKey: vi.fn(),
  encrypt: vi.fn(),
  decryptEvents: vi.fn(),
}));
vi.mock('./calendar-automation', () => ({
  executeCalendarAutomation: vi.fn(),
}));
vi.mock('@tuturuuu/utils/encryption', () => ({
  getMasterKey: mocks.master,
  decryptWorkspaceKey: mocks.decryptKey,
  encryptCalendarEventFields: mocks.encrypt,
  decryptCalendarEvents: mocks.decryptEvents,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: mocks.keyLookup,
    };
    return { from: () => query };
  },
}));

type Result = { data: unknown; error: null; count?: number };

/** Chainable query stub that records writes and resolves to `result`. */
function supabaseStub(result: Result) {
  const writes: Array<{ op: string; payload: unknown }> = [];
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit'])
    query[method] = () => query;
  query.insert = (payload: unknown) => {
    writes.push({ op: 'insert', payload });
    return query;
  };
  query.update = (payload: unknown) => {
    writes.push({ op: 'update', payload });
    return query;
  };
  query.single = async () => result;
  query.then = (resolve: (value: Result) => unknown) => resolve(result);
  return { client: { from: () => query }, writes };
}

function context(result: Result) {
  const stub = supabaseStub(result);
  const ctx = {
    userId: 'user-1',
    wsId: 'ws-1',
    supabase: stub.client,
  } as unknown as MiraToolContext;
  return { ctx, writes: stub.writes };
}

const createArgs = {
  title: 'Private meeting',
  description: 'Private evidence',
  location: 'Room 1',
  startAt: '2026-11-15T01:00:00Z',
  endAt: '2026-11-15T02:00:00Z',
};
const encryptedRow = {
  id: 'e1',
  title: 'ciphertext-title',
  description: 'ciphertext-description',
  location: 'ciphertext-location',
  start_at: '2026-11-15T01:00:00Z',
  end_at: '2026-11-15T02:00:00Z',
  is_encrypted: true,
  locked: false,
};

// Block bodies: a function returned from a beforeEach hook runs as its
// teardown, so these helpers must not return the configured mock.
const withKeyRow = () => {
  mocks.keyLookup.mockResolvedValue({
    data: { encrypted_key: 'wrapped' },
    error: null,
  });
};
const withoutKeyRow = () => {
  mocks.keyLookup.mockResolvedValue({ data: null, error: null });
};
const missingMasterKey = () => {
  mocks.master.mockImplementation(() => {
    throw new Error('missing master key');
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  withKeyRow();
  mocks.master.mockReturnValue('master');
  mocks.decryptKey.mockResolvedValue(Buffer.alloc(32));
  mocks.encrypt.mockReturnValue({
    title: 'enc-title',
    description: 'enc-description',
    location: 'enc-location',
  });
});

describe('key row present, master key missing', () => {
  beforeEach(missingMasterKey);

  it('refuses to create an event and writes nothing', async () => {
    const { ctx, writes } = context({ data: { id: 'new' }, error: null });
    await expect(executeCreateEvent(createArgs, ctx)).resolves.toEqual({
      error: ENCRYPTION_UNAVAILABLE_MESSAGE,
    });
    expect(writes).toEqual([]);
    expect(mocks.encrypt).not.toHaveBeenCalled();
  });

  it('refuses to update event text and writes nothing', async () => {
    const { ctx, writes } = context({
      data: { is_encrypted: true },
      error: null,
    });
    await expect(
      executeUpdateEvent({ eventId: 'e1', title: 'Renamed' }, ctx)
    ).resolves.toEqual({ error: ENCRYPTION_UNAVAILABLE_MESSAGE });
    expect(writes).toEqual([]);
  });

  it('flags encrypted events on read and never returns ciphertext', async () => {
    const { ctx } = context({ data: [encryptedRow], error: null });
    const result = (await executeGetUpcomingEvents({}, ctx)) as {
      notice?: string;
      events: Array<Record<string, unknown>>;
    };
    expect(result.notice).toBeDefined();
    expect(result.events[0]).toMatchObject({
      id: 'e1',
      title: null,
      description: null,
      location: null,
      encryptionUnavailable: true,
    });
    expect(JSON.stringify(result)).not.toContain('ciphertext');
  });

  it('reports E2EE as enabled but unavailable', async () => {
    const { ctx } = context({ data: null, error: null });
    await expect(executeCheckE2EEStatus({}, ctx)).resolves.toMatchObject({
      enabled: true,
      available: false,
    });
  });
});

describe('no key row', () => {
  beforeEach(() => {
    withoutKeyRow();
    missingMasterKey();
  });

  it('creates plaintext events as before', async () => {
    const { ctx, writes } = context({ data: { id: 'new' }, error: null });
    await expect(executeCreateEvent(createArgs, ctx)).resolves.toMatchObject({
      success: true,
    });
    expect(writes).toEqual([
      {
        op: 'insert',
        payload: expect.objectContaining({
          title: 'Private meeting',
          is_encrypted: false,
        }),
      },
    ]);
  });

  it('reports E2EE as not enabled', async () => {
    const { ctx } = context({ data: null, error: null });
    await expect(executeCheckE2EEStatus({}, ctx)).resolves.toMatchObject({
      enabled: false,
      hasKey: false,
    });
  });
});

describe('master key present', () => {
  it('creates encrypted events as before', async () => {
    const { ctx, writes } = context({ data: { id: 'new' }, error: null });
    await expect(executeCreateEvent(createArgs, ctx)).resolves.toMatchObject({
      success: true,
      event: { title: 'Private meeting' },
    });
    expect(writes).toEqual([
      {
        op: 'insert',
        payload: expect.objectContaining({
          title: 'enc-title',
          is_encrypted: true,
        }),
      },
    ]);
  });

  it('encrypts updated text as before', async () => {
    const { ctx, writes } = context({
      data: { is_encrypted: true },
      error: null,
    });
    await expect(
      executeUpdateEvent({ eventId: 'e1', title: 'Renamed' }, ctx)
    ).resolves.toMatchObject({ success: true });
    expect(writes).toEqual([
      {
        op: 'update',
        payload: { title: 'enc-title', is_encrypted: true },
      },
    ]);
  });

  it('returns decrypted events on read', async () => {
    mocks.decryptEvents.mockReturnValue([
      { ...encryptedRow, title: 'Private meeting', is_encrypted: false },
    ]);
    const { ctx } = context({ data: [encryptedRow], error: null });
    const result = (await executeGetUpcomingEvents({}, ctx)) as {
      notice?: string;
      events: Array<Record<string, unknown>>;
    };
    expect(result.notice).toBeUndefined();
    expect(result.events[0]?.title).toBe('Private meeting');
    expect(result.events[0]).not.toHaveProperty('encryptionUnavailable');
  });
});
