import { createHmac } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './route';

const { maybeSingle } = vi.hoisted(() => ({ maybeSingle: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => {
  const query = {
    from: () => query,
    select: () => query,
    eq: () => query,
    maybeSingle,
  };
  return { createAdminClient: () => ({ schema: () => query }) };
});
vi.mock('@/lib/mail/groups/delivery', () => ({ deliverGroupMessage: vi.fn() }));
vi.mock('@/lib/mail/inbound/ingest', () => ({
  createInboundMessage: vi.fn(),
  resolveInboundMailbox: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('logs a PostgREST code when signed Cloudflare ingestion fails', async () => {
  const address = 'person@example.com';
  const secret = 'fixture-signing-secret';
  vi.stubEnv('MAIL_CLOUDFLARE_INGEST_SECRET', secret);
  maybeSingle.mockResolvedValue({
    data: null,
    error: {
      code: '23505',
      message: 'Domain lookup failed for ' + address,
      details: 'Conflicting address: ' + address,
      hint: 'Check ' + address,
    },
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const body = JSON.stringify({
    type: 'domain_check',
    domain: 'example.com',
    recipient: address,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret)
    .update(timestamp + '.' + body)
    .digest('hex');
  const response = await POST(
    new Request('https://mail.test/api/v1/webhooks/mail/cloudflare', {
      method: 'POST',
      body,
      headers: {
        'x-tuturuuu-mail-signature': signature,
        'x-tuturuuu-mail-timestamp': timestamp,
      },
    })
  );

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Ingestion failed' });
  expect(log).toHaveBeenCalledExactlyOnceWith(
    '[mail] Cloudflare inbound ingestion failed',
    { error: { code: '23505' } }
  );
  expect(JSON.stringify(log.mock.calls)).not.toMatch(
    /[\w.+-]+@[\w-]+\.[\w.]+/u
  );
});
