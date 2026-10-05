import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/workspace-encryption', () => ({
  encryptEventForStorage: vi.fn(),
  decryptEventFromStorage: vi.fn(),
  getWorkspaceKey: vi.fn(),
}));

import { assertProviderSeriesWritable } from './readonly';

const wsId = '00000000-0000-4000-8000-000000009811';
const userId = '00000000-0000-4000-8000-000000009812';
const eventId = '00000000-0000-4000-8000-000000009813';
const check = (data: unknown, error: unknown = null) =>
  assertProviderSeriesWritable({
    sbAdmin: {
      rpc: vi.fn().mockResolvedValue({ data, error }),
    } as unknown as TypedSupabaseClient,
    wsId,
    userId,
    eventId,
  });
afterEach(() => vi.unstubAllEnvs());
describe('authoritative provider readonly guard', () => {
  it('allows only an explicit writable receipt', async () => {
    await expect(check(false)).resolves.toBeUndefined();
    await expect(check(null)).rejects.toMatchObject({ status: 503 });
  });
  it('rejects an unsupported rule even when cached UI metadata is absent', async () => {
    await expect(check(true)).rejects.toMatchObject({
      status: 422,
      code: 'PROVIDER_RULE_READ_ONLY',
    });
  });
  it('fails closed on lookup failure and missing migration with admission enabled', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED', 'true');
    await expect(check(null, { code: 'PGRST202' })).rejects.toMatchObject({
      status: 503,
    });
  });
  it('permits missing migration only while rollout admission is disabled', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED', 'false');
    await expect(check(null, { code: 'PGRST202' })).resolves.toBeUndefined();
    await expect(check(null, { code: '42501' })).rejects.toMatchObject({
      status: 503,
    });
  });
});
