import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ sign: vi.fn(), relay: vi.fn() }));
vi.mock('./storage-download-sign', () => ({
  createGuardedSupabaseStorageReadUrl: mocks.sign,
}));
vi.mock('./storage-download-relay', () => ({
  relayStorageDownload: mocks.relay,
}));

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { downloadGuardedSupabaseStorageObject } from './storage-download-object';

beforeEach(() => {
  vi.stubEnv('SECURITY_EGRESS_ENFORCEMENT_ENABLED', 'true');
  mocks.sign
    .mockReset()
    .mockResolvedValue(
      'https://web.example.test/api/v1/storage/guarded-download/ticket'
    );
  mocks.relay.mockReset();
});
it('uses the guarded relay for server-side CMS downloads', async () => {
  mocks.relay.mockResolvedValue(
    new Response('test', { headers: { 'Content-Type': 'text/plain' } })
  );
  const result = await downloadGuardedSupabaseStorageObject(
    {} as TypedSupabaseClient,
    'ws-1',
    'ws-1/external-projects/a.txt'
  );
  expect(mocks.relay.mock.calls[0]![1]).toBe('ticket');
  expect(new TextDecoder().decode(result.buffer)).toBe('test');
  expect(result.contentType).toBe('text/plain');
});
it('propagates exhausted budgets without a direct Storage fallback', async () => {
  mocks.relay.mockResolvedValue(
    Response.json({ message: 'limited' }, { status: 429 })
  );
  await expect(
    downloadGuardedSupabaseStorageObject(
      {} as TypedSupabaseClient,
      'ws-1',
      'ws-1/a'
    )
  ).rejects.toMatchObject({ status: 429 });
  expect(mocks.relay).toHaveBeenCalledTimes(1);
});
