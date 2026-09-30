import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  auth: vi.fn(),
  googleGet: vi.fn(),
  normalize: vi.fn(),
  membership: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@tuturuuu/google', () => ({
  google: { calendar: () => ({ events: { get: mocks.googleGet } }) },
}));
vi.mock('./provider-writes', () => ({ createGoogleAuthClient: vi.fn() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { encryptWorkspaceKey } from '@tuturuuu/utils/encryption';
import { GET } from '@/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/link-preview/route';
import {
  decryptEventFromStorage,
  encryptEventForStorage,
} from '@/lib/workspace-encryption';

// Synthetic test keys only. The actual helpers and AES-GCM implementation are not mocked.
const masterKey = 'calendar-preview-synthetic-master-key-for-tests';
const workspaceKey = Buffer.alloc(32, 3);
const eventId = '11111111-1111-4111-8111-111111111111';
const plain = {
  title: 'Real decrypted title',
  description: 'Private description',
  location: 'Real room',
};
let encryptedFields: Awaited<
  ReturnType<typeof encryptEventForStorage<typeof plain>>
>;
let encryptedKey: string;
let currentKey: { encrypted_key: string } | null;
let stored: Record<string, unknown>;

function database() {
  const rows: Record<string, Record<string, unknown>[]> = {
    workspace_calendar_events: [stored],
    workspace_calendars: [
      { id: 'native-source', ws_id: 'ws', is_enabled: true },
    ],
    calendar_auth_tokens: [
      {
        id: 'account-row',
        ws_id: 'ws',
        user_id: 'actor',
        provider: 'google',
        account_email: 'actor@example.com',
        account_name: 'Synthetic actor',
        access_token: 'synthetic-access-token',
        refresh_token: null,
        is_active: true,
      },
    ],
    calendar_connections: [
      {
        id: 'connection',
        ws_id: 'ws',
        provider: 'google',
        auth_token_id: 'account-row',
        workspace_calendar_id: 'native-source',
        calendar_id: 'provider-calendar',
        is_enabled: true,
        access_role: 'reader',
        calendar_name: 'Read only',
        color: null,
      },
    ],
    workspace_encryption_keys: currentKey
      ? [{ ...currentKey, ws_id: 'ws' }]
      : [],
  };
  return {
    schema() {
      return this;
    },
    from(table: string) {
      let data = rows[table] ?? [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          data = data.filter((row) => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          data = data.filter((row) => values.includes(row[key]));
          return query;
        },
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders intentionally implement PromiseLike.
        then: (resolve: (value: unknown) => void) =>
          Promise.resolve({ data, error: null }).then(resolve),
      };
      return query;
    },
  };
}

beforeAll(async () => {
  encryptedFields = await encryptEventForStorage('ws', plain, workspaceKey);
  encryptedKey = await encryptWorkspaceKey(workspaceKey, masterKey);
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ENCRYPTION_MASTER_KEY', masterKey);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  currentKey = { encrypted_key: encryptedKey };
  stored = {
    ...encryptedFields,
    id: eventId,
    ws_id: 'ws',
    provider: 'tuturuuu',
    source_calendar_id: 'native-source',
    external_event_id: null,
    external_calendar_id: null,
    google_event_id: null,
    start_at: '2026-09-30T12:00:00Z',
    end_at: '2026-09-30T13:00:00Z',
  };
  mocks.admin.mockImplementation(async () => database());
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { id: 'actor' },
    supabase: { rpc: vi.fn(async () => ({ data: true, error: null })) },
  });
  mocks.normalize.mockResolvedValue('ws');
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.googleGet.mockResolvedValue({
    data: {
      id: 'provider-event',
      summary: 'Provider authority',
      start: { dateTime: '2026-09-30T12:00:00Z' },
      end: { dateTime: '2026-09-30T13:00:00Z' },
    },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function providerTarget() {
  stored = {
    ...stored,
    provider: 'google',
    external_calendar_id: 'provider-calendar',
    external_event_id: 'provider-event',
  };
}
function requestPreview() {
  return GET(new Request('https://calendar.example/api'), {
    params: Promise.resolve({ wsId: 'ws', eventId }),
  });
}
async function expectSuppressed() {
  const response = await requestPreview();
  expect(response.status).toBe(404);
  expect(await response.text()).toBe('{}');
  expect(mocks.googleGet).not.toHaveBeenCalled();
}

it('demonstrates actual missing-key fallback returns the original encrypted row, then suppresses native/provider previews', async () => {
  currentKey = null;
  const before = await decryptEventFromStorage(stored as any, 'ws');
  expect(before).toBe(stored);
  expect(before.title).toBe(encryptedFields.title);
  expect(before.is_encrypted).toBe(true);
  await expectSuppressed();
  providerTarget();
  await expectSuppressed();
});
it('suppresses provider GET on missing key without relying on native serialization', async () => {
  currentKey = null;
  providerTarget();
  await expectSuppressed();
});
it('suppresses encrypted rows when the master-key environment is unavailable', async () => {
  vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
  await expectSuppressed();
  providerTarget();
  await expectSuppressed();
});
it.each(['title', 'description', 'location'] as const)(
  'demonstrates corrupt %s retains ciphertext despite clearing the legacy flag; strict preview never continues',
  async (field) => {
    const bytes = Buffer.from(encryptedFields[field]!, 'base64');
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    stored[field] = bytes.toString('base64');
    const before = await decryptEventFromStorage(stored as any, 'ws');
    expect(before.is_encrypted).toBe(false);
    expect(before[field]).toBe(stored[field]);
    await expectSuppressed();
    providerTarget();
    await expectSuppressed();
  }
);
it.each(['eA==', 'not base64!', ''])(
  'handles truncated/noncanonical input or permitted empty field: %s',
  async (value) => {
    stored.title = value;
    if (value === '') {
      const response = await requestPreview();
      expect(response.status).toBe(200);
      expect((await response.json()).title).toBeNull();
    } else {
      await expectSuppressed();
      providerTarget();
      await expectSuppressed();
    }
  }
);
it('suppresses wrong workspace keys and corrupt wrapped keys without provider continuation', async () => {
  currentKey = {
    encrypted_key: await encryptWorkspaceKey(Buffer.alloc(32, 7), masterKey),
  };
  await expectSuppressed();
  providerTarget();
  await expectSuppressed();
  currentKey = { encrypted_key: 'invalid wrapped key' };
  await expectSuppressed();
});
it('uses the actual encryption storage format and returns only plaintext for authenticated native data', async () => {
  const real = await decryptEventFromStorage(stored as any, 'ws');
  expect(real).toMatchObject({ ...plain, is_encrypted: false });
  const response = await requestPreview();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.title).toBe(plain.title);
  expect(body.location.displayName).toBe(plain.location);
  for (const value of Object.values(encryptedFields)) {
    if (typeof value === 'string' && value)
      expect(JSON.stringify(body)).not.toContain(value);
  }
  expect(JSON.stringify(body)).not.toContain(plain.description);
  expect(mocks.googleGet).not.toHaveBeenCalled();
});
it('continues exact provider GET only after all stored encrypted fields authenticate', async () => {
  providerTarget();
  const response = await requestPreview();
  expect(response.status).toBe(200);
  expect((await response.json()).title).toBe('Provider authority');
  expect(mocks.googleGet).toHaveBeenCalledTimes(1);
});
