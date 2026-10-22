// @vitest-environment node
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaffReadError } from '@/app/api/v1/product-feedback/staff-access';
import {
  createFeedbackSubmissionHandler,
  type FeedbackSubmissionDependencies,
} from './product-feedback-handlers';

const actor = '11111111-1111-4111-8111-111111111111';
const receipt = {
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-10-22T00:00:00Z',
};
const input = {
  title: ' Subject ',
  body: ' Details ',
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
  turnstileToken: 'PRIVATE_TOKEN',
};
function request(body: unknown = input, headers: HeadersInit = {}) {
  return new Request('https://web.example.test/api/v1/product-feedback', {
    method: 'POST',
    headers: {
      authorization: 'Bearer fixture-user',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function dependencies(
  overrides: Partial<FeedbackSubmissionDependencies> = {}
): FeedbackSubmissionDependencies {
  return {
    actor: vi.fn(async () => actor),
    enabled: () => true,
    mediaEnabled: () => true,
    verify: vi.fn(async () => {}),
    submit: vi.fn(async () => ({ status: 'accepted', receipt })),
    ...overrides,
  };
}
afterEach(() => vi.restoreAllMocks());
describe('secure product feedback intake', () => {
  it('uses only the authenticated actor and returns the content-free receipt', async () => {
    const deps = dependencies();
    const response = await createFeedbackSubmissionHandler(deps)(request());
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual(receipt);
    expect(deps.submit).toHaveBeenCalledOnce();
    expect(deps.submit).toHaveBeenCalledWith(
      actor,
      {
        title: 'Subject',
        body: 'Details',
        idempotencyKey: input.idempotencyKey,
      },
      expect.anything()
    );
  });
  it.each([
    { ...input, actor: 'spoofed' },
    { ...input, title: '' },
    { ...input, body: 'x'.repeat(8001) },
    { ...input, idempotencyKey: actor.replace('-4111-', '-7111-') },
    { ...input, turnstileToken: '' },
    { ...input, media: { contentType: 'text/html', data: 'aaaa' } },
  ])(
    'rejects malformed/authority-bearing input before verification or SQL',
    async (payload) => {
      const deps = dependencies();
      expect(
        (await createFeedbackSubmissionHandler(deps)(request(payload))).status
      ).toBe(400);
      expect(deps.verify).not.toHaveBeenCalled();
      expect(deps.submit).not.toHaveBeenCalled();
    }
  );
  it.each([401, 403, 503] as const)(
    'denied actor %s precedes body and writes',
    async (status) => {
      const deps = dependencies({
        actor: async () => {
          throw new StaffReadError(status);
        },
      });
      expect(
        (await createFeedbackSubmissionHandler(deps)(request({ broken: true })))
          .status
      ).toBe(status);
      expect(deps.submit).not.toHaveBeenCalled();
    }
  );
  it('requires fresh verification; never forwards provider errors or attempts SQL on failure', async () => {
    const deps = dependencies({
      verify: async () => {
        throw new StaffReadError(403);
      },
    });
    const response = await createFeedbackSubmissionHandler(deps)(request());
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('PRIVATE');
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it.each([{ status: 'conflict' }, { status: 'limited', retryAfter: 42 }])(
    'preserves transactional %j without replay',
    async (result) => {
      const deps = dependencies({ submit: vi.fn(async () => result) });
      const response = await createFeedbackSubmissionHandler(deps)(request());
      expect(response.status).toBe(result.status === 'conflict' ? 409 : 429);
      expect(response.headers.get('retry-after')).toBe(
        result.status === 'limited' ? '42' : null
      );
      expect(deps.submit).toHaveBeenCalledOnce();
    }
  );
  it('blocks cross-origin and cookie-only requests without same-origin proof', async () => {
    const deps = dependencies();
    const handler = createFeedbackSubmissionHandler(deps);
    expect(
      (await handler(request(input, { origin: 'https://evil.example.test' })))
        .status
    ).toBe(403);
    const cookies = request();
    cookies.headers.delete('authorization');
    expect((await handler(cookies)).status).toBe(403);
    cookies.headers.set('origin', 'https://web.example.test');
    expect((await handler(cookies)).status).toBe(201);
    expect(deps.submit).toHaveBeenCalledOnce();
  });
  it('fails closed on disabled intake/media flags', async () => {
    const deps = dependencies({ enabled: () => false });
    expect(
      (await createFeedbackSubmissionHandler(deps)(request())).status
    ).toBe(503);
    expect(deps.submit).not.toHaveBeenCalled();
    const disabledMedia = dependencies({ mediaEnabled: () => false });
    expect(
      (
        await createFeedbackSubmissionHandler(disabledMedia)(
          request({
            ...input,
            media: { contentType: 'image/png', data: 'AAAA' },
          })
        )
      ).status
    ).toBe(503);
    expect(disabledMedia.verify).not.toHaveBeenCalled();
  });
  it('validates actual image bytes and stores only a bounded metadata-free WebP', async () => {
    const png = await sharp({
      create: { width: 12, height: 12, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    const deps = dependencies();
    expect(
      (
        await createFeedbackSubmissionHandler(deps)(
          request({
            ...input,
            media: { contentType: 'image/png', data: png.toString('base64') },
          })
        )
      ).status
    ).toBe(201);
    const submitted = vi.mocked(deps.submit).mock.calls[0]?.[1];
    const bytes = Buffer.from(submitted?.media ?? '', 'base64');
    expect(bytes.length).toBeLessThanOrEqual(524288);
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    expect(JSON.stringify(submitted)).not.toContain('PRIVATE_TOKEN');
  });
  it.each(['<svg onload="alert(1)"/>', 'not image'])(
    'rejects content-type spoofed image %s',
    async (bytes) => {
      const deps = dependencies();
      expect(
        (
          await createFeedbackSubmissionHandler(deps)(
            request({
              ...input,
              media: {
                contentType: 'image/png',
                data: Buffer.from(bytes).toString('base64'),
              },
            })
          )
        ).status
      ).toBe(400);
      expect(deps.submit).not.toHaveBeenCalled();
    }
  );
  it('bounds both declared and actual streamed request bytes', async () => {
    const deps = dependencies();
    const handler = createFeedbackSubmissionHandler(deps);
    expect(
      (await handler(request(input, { 'content-length': '2850001' }))).status
    ).toBe(413);
    const actual = request({ ...input, body: 'x'.repeat(2850001) });
    expect((await handler(actual)).status).toBe(413);
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it('sanitizes malformed dependency results and never replays unknown writes', async () => {
    const deps = dependencies({
      submit: vi.fn(async () => {
        throw new Error('PRIVATE_SQL_TOKEN');
      }),
    });
    const response = await createFeedbackSubmissionHandler(deps)(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('PRIVATE');
    expect(deps.submit).toHaveBeenCalledOnce();
  });
  it('cancels an aborted body before verification or SQL', async () => {
    const controller = new AbortController();
    const deps = dependencies();
    const pending = new Request(request(), { signal: controller.signal });
    controller.abort();
    expect((await createFeedbackSubmissionHandler(deps)(pending)).status).toBe(
      503
    );
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.submit).not.toHaveBeenCalled();
  });
});
