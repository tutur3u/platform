import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  capture: vi.fn(),
  fixRef: vi.fn(),
  format: vi.fn(),
  lookup: vi.fn(),
  validate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/cite/api/capture', () => ({ POST: handlers.capture }));
vi.mock('@/lib/cite/api/fix-ref', () => ({ POST: handlers.fixRef }));
vi.mock('@/lib/cite/api/format', () => ({ POST: handlers.format }));
vi.mock('@/lib/cite/api/lookup', () => ({ POST: handlers.lookup }));
vi.mock('@/lib/cite/api/validate', () => ({ POST: handlers.validate }));
const { POST } = await import('./route');

const call = (path: string[]) =>
  POST(
    new NextRequest(`https://tuturuuu.com/api/v1/cite/${path.join('/')}`, {
      method: 'POST',
    }),
    { params: Promise.resolve({ path }) }
  );

beforeEach(() => {
  for (const handler of Object.values(handlers)) {
    handler.mockReset();
    handler.mockResolvedValue(Response.json({ ok: true }));
  }
});

describe('cite action route', () => {
  it.each([
    [['ai', 'fix-ref'], 'fixRef'],
    [['capture'], 'capture'],
    [['format'], 'format'],
    [['lookup'], 'lookup'],
    [['validate'], 'validate'],
  ] as const)('dispatches %j only to its own handler', async (path, name) => {
    const response = await call([...path]);
    expect(response.status).toBe(200);
    for (const [key, handler] of Object.entries(handlers))
      expect(handler).toHaveBeenCalledTimes(key === name ? 1 : 0);
  });

  it.each([
    [['fix-ref']],
    [['ai']],
    [['ai', 'fix-ref', 'extra']],
    [['capture', 'x']],
    [['constructor']],
    [['__proto__']],
    [['toString']],
  ] as const)(
    'returns a fixed 404 for %j without calling a handler',
    async (path) => {
      const response = await call([...path]);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'NOT_FOUND' });
      expect(response.headers.get('cache-control')).toBe('no-store');
      for (const handler of Object.values(handlers))
        expect(handler).not.toHaveBeenCalled();
    }
  );
});
