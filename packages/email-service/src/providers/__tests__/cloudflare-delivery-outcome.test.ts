import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderSendParams } from '../../types';
import {
  CLOUDFLARE_MAX_MESSAGE_BYTES,
  CloudflareEmailProvider,
} from '../cloudflare';

const credentials = {
  accountId: 'synthetic-account',
  apiBaseUrl: 'https://provider.example.com',
  apiToken: 'synthetic-token',
  type: 'cloudflare' as const,
};
const first = 'first@example.com',
  second = 'second@example.com';
const parameters = (): ProviderSendParams => ({
  content: { html: '<p>Synthetic notice</p>', subject: 'Synthetic notice' },
  recipients: { to: [first, second] },
  source: 'Synthetic <sender@example.org>',
});
function response(result: Record<string, unknown>) {
  return new Response(JSON.stringify({ errors: [], result, success: true }), {
    status: 200,
  });
}
const adapter = () => new CloudflareEmailProvider(credentials);
afterEach(() => vi.restoreAllMocks());

describe('Cloudflare dispatch outcome through the actual adapter', () => {
  it.each([
    { delivered: [first], permanent_bounces: [second], queued: [] },
    { delivered: [], permanent_bounces: [second], queued: [first] },
    {
      delivered: [],
      message_id: 'synthetic-receipt',
      permanent_bounces: [second],
      queued: [],
    },
  ])('partial acceptance is not retry-safe rejection: %j', async (body) => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response(body));
    const result = await adapter().send(parameters());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('permanently bounced');
    expect(result.deliveryOutcome).toBe('accepted');
  });
  it.each(['fetch', 'body'])(
    'loss after %s handoff is unknown',
    async (stage) => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      if (stage === 'fetch')
        fetch.mockRejectedValue(new TypeError('Synthetic connection lost'));
      else
        fetch.mockResolvedValue(
          new Response('{"success":true,"result":', { status: 200 })
        );
      const result = await adapter().send(parameters());
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('unknown');
    }
  );
  it('all-bounce response is not proven pre-acceptance rejection', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        delivered: [],
        permanent_bounces: [first, second],
        queued: [],
      })
    );
    const result = await adapter().send(parameters());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.deliveryOutcome).toBe('unknown');
  });
  it('recipient limit is rejection before any provider request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('Unexpected synthetic invocation');
    });
    const result = await adapter().send({
      ...parameters(),
      recipients: {
        to: Array.from({ length: 51 }, (_, i) => `synthetic-${i}@example.com`),
      },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain('at most 50');
    expect(result.deliveryOutcome).toBe('rejected');
  });
  it('successful acceptance keeps existing success behavior', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        delivered: [first],
        permanent_bounces: [],
        queued: [second],
      })
    );
    const result = await adapter().send(parameters());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.deliveryOutcome).toBe('accepted');
  });
  it('incomplete successful envelope without acceptance evidence is unknown', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        response({ delivered: [], permanent_bounces: [], queued: [] })
      );
    const result = await adapter().send(parameters());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.deliveryOutcome).toBe('unknown');
  });
});

class SanitizationFailureProvider extends CloudflareEmailProvider {
  protected override async sanitizeHtml(_html: string): Promise<string> {
    throw new Error('Synthetic sanitization failure');
  }
}

describe('Cloudflare predispatch rejection boundary', () => {
  it('sanitization failure rejects before provider handoff', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const result = await new SanitizationFailureProvider(credentials).send(
      parameters()
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      deliveryOutcome: 'rejected',
      error: 'Synthetic sanitization failure',
    });
  });

  it('request serialization failure rejects before provider handoff', async () => {
    const headers: Record<string, string> = { 'X-Synthetic': 'value' };
    // Size estimation reads ordinary string headers; JSON encoding calls toJSON.
    Object.defineProperty(headers, 'toJSON', {
      enumerable: false,
      value() {
        throw new Error('Synthetic serialization failure');
      },
    });
    const fetch = vi.spyOn(globalThis, 'fetch');
    const input = parameters();
    const result = await adapter().send({
      ...input,
      content: { ...input.content, headers },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      deliveryOutcome: 'rejected',
      error: 'Synthetic serialization failure',
    });
  });

  it('attachment limit rejects before provider handoff', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const input = parameters();
    const result = await adapter().send({
      ...input,
      content: {
        ...input.content,
        attachments: Array.from({ length: 33 }, (_, i) => ({
          contentType: 'text/plain',
          data: new Uint8Array([1]),
          filename: `synthetic-${i}.txt`,
        })),
      },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      deliveryOutcome: 'rejected',
    });
    expect(result.error).toContain('at most 32');
  });

  it('message size rejects before provider handoff', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const input = parameters();
    const result = await adapter().send({
      ...input,
      content: {
        ...input.content,
        text: 'x'.repeat(CLOUDFLARE_MAX_MESSAGE_BYTES),
      },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      deliveryOutcome: 'rejected',
    });
    expect(result.error).toContain('5 MiB');
  });
});
