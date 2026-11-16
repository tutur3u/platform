import { CiteWorkSchema, formatDocument } from '@tuturuuu/cite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  store: vi.fn(),
  evaluate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: mocks.store,
}));
const work = CiteWorkSchema.parse({
  id: 'synthetic-book',
  type: 'book',
  title: 'Synthetic maps',
  authors: [{ kind: 'person', family: 'Vale', given: 'Mira' }],
  issued: { year: 2024 },
  publisher: 'Fictional Press',
  publisherPlace: 'Example City',
});
function request(style: 'apa' | 'harvard', authorization?: string) {
  return new Request('https://tuturuuu.com/api/v1/cite/format', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorization
        ? { authorization }
        : { cookie: 'synthetic-session=value' }),
    },
    body: JSON.stringify({
      style,
      works: [work],
      citations: [{ id: 'first', items: [{ workId: work.id, locator: '8' }] }],
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, user: { id: 'verified-actor' } });
  mocks.store.mockResolvedValue({ eval: mocks.evaluate });
  mocks.evaluate.mockResolvedValue(1);
});
describe('POST /api/v1/cite/format', () => {
  it.each(['apa', 'harvard'] as const)(
    'matches portable %s document output exactly',
    async (style) => {
      const input = request(style);
      const response = await POST(input);
      expect(mocks.auth).toHaveBeenCalledWith(input);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual(
        formatDocument({
          style,
          works: [work],
          citations: [
            { id: 'first', items: [{ workId: work.id, locator: '8' }] },
          ],
        })
      );
    }
  );
  it('passes Bearer credentials unchanged to the existing session resolver', async () => {
    const input = request('apa', 'Bearer synthetic-access-token');
    expect((await POST(input)).status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledWith(input);
    expect(input.headers.get('authorization')).toBe(
      'Bearer synthetic-access-token'
    );
  });
  it('refuses unauthenticated and Redis-unavailable requests', async () => {
    mocks.auth.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    expect((await POST(request('apa'))).status).toBe(401);
    expect(mocks.store).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ ok: true, user: { id: 'verified-actor' } });
    mocks.store.mockResolvedValue(null);
    expect((await POST(request('apa'))).status).toBe(503);
  });
});
