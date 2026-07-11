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

  it('preserves inline attachment disposition and content IDs', async () => {
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

    await new CloudflareEmailProvider(credentials).send({
      ...params(),
      content: {
        ...params().content,
        attachments: [
          {
            contentId: 'hero@tuturuuu.mail',
            contentType: 'image/png',
            data: new Uint8Array([1, 2, 3]),
            disposition: 'inline',
            filename: 'hero.png',
          },
        ],
      },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.attachments[0]).toMatchObject({
      content_id: 'hero@tuturuuu.mail',
      disposition: 'inline',
    });
  });

  it('accepts a successful response with a message ID and empty delivery arrays', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [],
          result: {
            delivered: [],
            message_id: '<message-1@example.org>',
            permanent_bounces: [],
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

    expect(result).toMatchObject({
      messageId: '<message-1@example.org>',
      success: true,
    });
  });

  it('rejects an empty successful response without a message ID', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [],
          result: { delivered: [], queued: [] },
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
