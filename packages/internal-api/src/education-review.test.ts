import { describe, expect, it, vi } from 'vitest';
import { reviewEducationDocument } from './education';
const input = {
  wsId: 'ws',
  courseId: 'course',
  moduleId: 'module',
  text: 'She go',
  subject: 'writing' as const,
  locale: 'en' as const,
  level: 'hints' as const,
};
describe('streamed education review', () => {
  it('streams via the owning Teach client, forwards abort, and parses the final object', async () => {
    const encoder = new TextEncoder();
    const fetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('{"suggestions":'));
              controller.enqueue(encoder.encode('[]}'));
              controller.close();
            },
          })
        )
    );
    const controller = new AbortController();
    const progress = vi.fn();
    expect(
      await reviewEducationDocument(input, controller.signal, progress, {
        baseUrl: 'https://teach.example.com',
        fetch,
      })
    ).toEqual({ suggestions: [] });
    expect(fetch).toHaveBeenCalledWith(
      'https://teach.example.com/api/ai/objects/inline-assistance',
      expect.objectContaining({
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
        body: JSON.stringify(input),
      })
    );
    expect(progress).toHaveBeenCalledTimes(2);
  });
  it('rejects denied, invalid and oversized responses', async () => {
    for (const response of [
      new Response('Denied', { status: 403 }),
      new Response('{broken'),
      new Response('x'.repeat(256_001)),
    ]) {
      const fetch = vi.fn(async () => response);
      await expect(
        reviewEducationDocument(
          input,
          new AbortController().signal,
          undefined,
          { baseUrl: 'https://teach.example.com', fetch }
        )
      ).rejects.toThrow();
    }
  });
});
