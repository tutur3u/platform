import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUDFLARE_MAX_MESSAGE_BYTES,
  CloudflareEmailProvider,
} from '../cloudflare';

const credentials = {
  accountId: 'account-1',
  apiBaseUrl: 'https://api.example.com',
  apiToken: 'token-1',
  type: 'cloudflare' as const,
};

function params() {
  return {
    content: { html: '<p>Hello</p>', subject: 'Hello', text: 'Hello' },
    recipients: { to: ['person@example.com'] },
    source: 'Tuturuuu <hello@example.org>',
  };
}

afterEach(() => vi.restoreAllMocks());

describe('CloudflareEmailProvider', () => {
  it('sends through the account Email Service REST endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [],
          result: { delivered: ['person@example.com'], queued: [] },
          success: true,
        }),
        { status: 200 }
      )
    );

    const result = await new CloudflareEmailProvider(credentials).send(
      params()
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/accounts/account-1/email/sending/send',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects more than 50 combined recipients before calling Cloudflare', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await new CloudflareEmailProvider(credentials).send({
      ...params(),
      recipients: {
        to: Array.from(
          { length: 51 },
          (_, index) => `person-${index}@example.com`
        ),
      },
    });

    expect(result).toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects messages above the provider size limit before sending', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await new CloudflareEmailProvider(credentials).send({
      ...params(),
      content: {
        ...params().content,
        text: 'x'.repeat(CLOUDFLARE_MAX_MESSAGE_BYTES),
      },
    });

    expect(result).toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces permanent bounces as send failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [],
          result: {
            delivered: [],
            permanent_bounces: ['person@example.com'],
            queued: [],
          },
          success: true,
        }),
        { status: 200 }
      )
    );

    const result = await new CloudflareEmailProvider(credentials).send(
      params()
    );
    expect(result).toMatchObject({ success: false });
  });
});
