import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { resolveCanonicalRecipient } from './index';

const rawEmail = [
  'From: Sender <sender@example.com>',
  'To: phucvo@tuturuuu.com',
  'Message-ID: <shadow-test@example.com>',
  'Subject: Shadow delivery test',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Cloudflare shadow delivery body.',
].join('\r\n');

function stream(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function createMessage(originalRecipient = 'phucvo@tuturuuu.com') {
  const headers = new Headers();
  headers.set('X-Gm-Original-To', originalRecipient);
  return {
    from: 'sender@example.com',
    headers,
    raw: stream(rawEmail),
    rawSize: new TextEncoder().encode(rawEmail).byteLength,
    setReject: vi.fn(),
    to: 'phucvo@ingest.tutur3u.com',
  };
}

function createEnv() {
  return {
    MAIL_INGEST_SECRET: 'test-secret',
    MAIL_INGEST_URL: 'https://mail.example.test/webhook',
    MAIL_R2_BUCKET: {
      put: vi.fn(
        async (key: string, value: ArrayBuffer | Uint8Array | string) => ({
          etag: 'etag',
          key,
          size:
            typeof value === 'string'
              ? new TextEncoder().encode(value).byteLength
              : value.byteLength,
        })
      ),
    },
    MAIL_R2_BUCKET_NAME: 'mail-test',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveCanonicalRecipient', () => {
  it('maps a verified shadow recipient to the canonical domain', () => {
    expect(
      resolveCanonicalRecipient({
        canonicalDomain: 'tuturuuu.com',
        observedRecipient: 'phucvo@ingest.tutur3u.com',
        originalRecipient: 'Phuc Vo <phucvo@tuturuuu.com>',
      })
    ).toEqual({ recipient: 'phucvo@tuturuuu.com' });
  });

  it('rejects a mismatched Google original-recipient header', () => {
    expect(
      resolveCanonicalRecipient({
        canonicalDomain: 'tuturuuu.com',
        observedRecipient: 'phucvo@ingest.tutur3u.com',
        originalRecipient: 'other@tuturuuu.com',
      })
    ).toEqual({
      reason: 'Original recipient does not match the shadow route',
    });
  });
});

describe('Cloudflare Email Routing Worker', () => {
  it('stores and submits shadow mail using the canonical mailbox identity', async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        requests.push(payload);
        if (payload.type === 'domain_check') {
          return Response.json({
            accepted: true,
            canonicalDomain: 'tuturuuu.com',
          });
        }
        return Response.json({ imported: 1, status: 'imported' });
      })
    );
    const message = createMessage();
    const env = createEnv();

    await worker.email(message, env);

    expect(message.setReject).not.toHaveBeenCalled();
    expect(requests[0]).toEqual({
      domain: 'ingest.tutur3u.com',
      recipient: 'phucvo@ingest.tutur3u.com',
      type: 'domain_check',
    });
    expect(requests[1]).toMatchObject({
      domain: 'tuturuuu.com',
      envelope: {
        observedTo: 'phucvo@ingest.tutur3u.com',
        to: 'phucvo@tuturuuu.com',
      },
      ingressDomain: 'ingest.tutur3u.com',
      type: 'ingest',
    });
    expect(env.MAIL_R2_BUCKET.put).toHaveBeenCalledWith(
      expect.stringMatching(/^mail\/tuturuuu\.com\//u),
      expect.anything(),
      expect.anything()
    );
  });

  it('rejects a suspicious shadow mapping before storing MIME', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ accepted: true, canonicalDomain: 'tuturuuu.com' })
    );
    vi.stubGlobal('fetch', fetchMock);
    const message = createMessage('other@tuturuuu.com');
    const env = createEnv();

    await worker.email(message, env);

    expect(message.setReject).toHaveBeenCalledWith(
      'Original recipient does not match the shadow route'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(env.MAIL_R2_BUCKET.put).not.toHaveBeenCalled();
  });
});
