import { afterEach, expect, it, vi } from 'vitest';
import type { PasswordsEnvironment } from './environment';
import { createSecretsTransport } from './secrets-transport.server';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.co',
  SUPABASE_SECRET_KEY: 'synthetic-service-key',
} as PasswordsEnvironment;
const args = {
  p_ws: 'f7100000-0000-0000-0000-000000000001',
  p_vault: 'f7200000-0000-0000-0000-000000000001',
  p_actor: null,
  p_request: 'f7400000-0000-0000-0000-000000000001',
  p_action: 'item.list',
  p_input: {},
};
afterEach(() => vi.unstubAllGlobals());
it('actual Supabase client makes one attempt for a transient SQL error', async () => {
  const fetcher = vi.fn(async () =>
    Response.json(
      { code: 'P0001', message: 'sensitive injected SQL detail' },
      { status: 503 }
    )
  );
  vi.stubGlobal('fetch', fetcher);
  const transport = createSecretsTransport(
    env,
    new Request('https://passwords.tuturuuu.com'),
    () => true
  );
  await expect(transport.rpc(args)).rejects.toMatchObject({
    message: 'OPERATION_UNCERTAIN',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('disabled transport makes no auth, SQL or storage request', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect(() =>
    createSecretsTransport(
      env,
      new Request('https://passwords.tuturuuu.com'),
      () => false
    )
  ).toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it('aborted request cannot dispatch SQL', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const signal = AbortSignal.abort();
  const transport = createSecretsTransport(
    env,
    new Request('https://passwords.tuturuuu.com', { signal }),
    () => true
  );
  await expect(transport.rpc(args)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
