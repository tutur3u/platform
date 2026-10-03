import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  inspect: vi.fn(),
  patch: vi.fn(),
  one: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock('./native-generation-request-service', () => ({
  createRequestNativeGenerationService: () => ({
    inspect: m.inspect,
    patch: m.patch,
  }),
}));
vi.mock('../../workspace-encryption', () => ({
  decryptEventFromStorage: m.decrypt,
  getWorkspaceKey: async () => Buffer.alloc(32),
  encryptEventForStorage: async () => ({ is_encrypted: true }),
}));

vi.mock('./provider-saga-routes', () => ({
  unsupportedProviderSaga: () => new Response(null, { status: 409 }),
}));
vi.mock('./route-handlers', () => ({
  operationFailure: () => new Response(null, { status: 503 }),
}));

import { handleRetainedNativeMutation } from './native-generation-routes';

const query = { select: () => query, eq: () => query, single: m.one };
const args = {
  request: new Request('https://example.test'),
  rawWsId: 'workspace',
  wsId: 'workspace',
  eventId: 'event',
  sbAdmin: { from: () => query } as unknown as TypedSupabaseClient,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.inspect.mockResolvedValue('0');
  m.patch.mockResolvedValue({});
  m.decrypt.mockImplementation(async (data) => data);
});
it.each(['PGRST116', 'XX000'])(
  'distinguishes missing rows from pre-encryption storage errors %s',
  async (code) => {
    m.one.mockResolvedValue({ data: null, error: { code } });
    const response = await handleRetainedNativeMutation({
      ...args,
      updates: { title: 'title' },
    });
    expect(response.status).toBe(code === 'PGRST116' ? 404 : 503);
    expect(m.patch).not.toHaveBeenCalled();
  }
);
it.each(['PGRST116', 'XX000'])(
  'distinguishes post-commit read failures %s without repeating the mutation',
  async (code) => {
    m.one.mockResolvedValue({ data: null, error: { code } });
    const response = await handleRetainedNativeMutation({
      ...args,
      updates: { locked: true },
    });
    expect(response.status).toBe(code === 'PGRST116' ? 404 : 503);
    expect(m.patch).toHaveBeenCalledExactlyOnceWith('0', { locked: true });
  }
);
