import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { createAdminClient, eq, maybeSingle, select, from } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient }));

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { WorkspaceSecretsBinding } from '@tuturuuu/utils/workspace-secrets/protocol';
import { configureWorkspaceSecretsRuntime } from '@tuturuuu/utils/workspace-secrets/runtime';
import {
  createEncryptedDataKey,
  encryptSecretValue,
} from '../mobile-deployment/crypto';
import {
  CALENDAR_GATEWAY_SECRET_NAME,
  loadCalendarGatewaySecret,
} from './secret';

const credential = 'test-calendar-gateway-credential'.padEnd(43, 'x');
const masterKey = 'test-calendar-master-fixture-at-least-32-bytes';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MOBILE_CALENDAR_GATEWAY_SECRET', undefined);
  vi.stubEnv('ENCRYPTION_MASTER_KEY', masterKey);
  eq.mockReturnValue({ eq, maybeSingle });
  select.mockReturnValue({ eq });
  from.mockReturnValue({ select });
  createAdminClient.mockResolvedValue({ from });
});

afterEach(() => {
  vi.unstubAllEnvs();
  configureWorkspaceSecretsRuntime(null);
});

function fakeBinding(reveal: WorkspaceSecretsBinding['reveal']) {
  const binding = {
    keyStatus: vi.fn(),
    put: vi.fn(),
    rename: vi.fn(),
    reveal: vi.fn(reveal),
  } satisfies WorkspaceSecretsBinding;
  configureWorkspaceSecretsRuntime(binding);
  return binding;
}

async function fixtureEnvelope() {
  const { dataKey, encryptedDataKey } = await createEncryptedDataKey();
  try {
    return JSON.stringify({
      version: 1,
      encryptedDataKey,
      encryptedSecret: encryptSecretValue(credential, dataKey),
    });
  } finally {
    dataKey.fill(0);
  }
}

it('uses the Worker credential without reading the database or master key', async () => {
  vi.stubEnv('MOBILE_CALENDAR_GATEWAY_SECRET', credential);
  vi.stubEnv('ENCRYPTION_MASTER_KEY', undefined);
  await expect(loadCalendarGatewaySecret()).resolves.toBe(credential);
  expect(createAdminClient).not.toHaveBeenCalled();
});

it('fails closed on an explicitly configured invalid binding', async () => {
  vi.stubEnv('MOBILE_CALENDAR_GATEWAY_SECRET', '');
  await expect(loadCalendarGatewaySecret()).rejects.toMatchObject({
    reason: 'invalid-binding',
  });
  expect(createAdminClient).not.toHaveBeenCalled();
});

it('decrypts the existing root envelope when there is no Worker binding', async () => {
  maybeSingle.mockResolvedValue({
    data: { value: await fixtureEnvelope() },
    error: null,
  });
  await expect(loadCalendarGatewaySecret()).resolves.toBe(credential);
  expect(from).toHaveBeenCalledWith('workspace_secrets');
  expect(eq.mock.calls).toEqual([
    ['ws_id', ROOT_WORKSPACE_ID],
    ['name', CALENDAR_GATEWAY_SECRET_NAME],
  ]);
});

it('reports an unreadable envelope under a different master key', async () => {
  maybeSingle.mockResolvedValue({
    data: { value: await fixtureEnvelope() },
    error: null,
  });
  vi.stubEnv('ENCRYPTION_MASTER_KEY', `${masterKey}-different`);
  await expect(loadCalendarGatewaySecret()).rejects.toMatchObject({
    reason: 'envelope-decrypt',
  });
});

it.each([
  [{ data: null, error: new Error('fixture read error') }, 'envelope-read'],
  [{ data: null, error: null }, 'envelope-missing'],
  [{ data: { value: 'null' }, error: null }, 'envelope-invalid'],
])(
  'classifies unavailable legacy credentials as %j (%s)',
  async (row, reason) => {
    maybeSingle.mockResolvedValue(row);
    await expect(loadCalendarGatewaySecret()).rejects.toMatchObject({ reason });
  }
);

it('reveals the envelope through the secrets Worker when bound', async () => {
  const envelope = await fixtureEnvelope();
  const binding = fakeBinding(async () => ({
    status: 'ok',
    value: envelope,
    valueRev: 1,
  }));
  await expect(loadCalendarGatewaySecret()).resolves.toBe(credential);
  expect(binding.reveal).toHaveBeenCalledWith({
    name: CALENDAR_GATEWAY_SECRET_NAME,
    purpose: 'mobile-calendar',
    wsId: ROOT_WORKSPACE_ID,
  });
  expect(createAdminClient).not.toHaveBeenCalled();
});

it('reports a missing envelope when the Worker has none', async () => {
  fakeBinding(async () => ({ status: 'not_found' }));
  await expect(loadCalendarGatewaySecret()).rejects.toMatchObject({
    reason: 'envelope-missing',
  });
  expect(createAdminClient).not.toHaveBeenCalled();
});

it.each([
  ['a failed status', async () => ({ status: 'unavailable' as const })],
  [
    'a thrown error',
    async () => {
      throw new Error('fixture binding failure');
    },
  ],
])('fails closed without a plaintext read on %s', async (_label, reveal) => {
  fakeBinding(reveal);
  await expect(loadCalendarGatewaySecret()).rejects.toMatchObject({
    reason: 'envelope-read',
  });
  expect(createAdminClient).not.toHaveBeenCalled();
});
