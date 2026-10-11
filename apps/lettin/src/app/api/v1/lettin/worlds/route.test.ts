import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from './route';

const { read, binding } = vi.hoisted(() => ({
  read: vi.fn(),
  binding: vi.fn(),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/server/bindings', () => ({ bindings: binding }));
vi.mock('@/server/queries', () => ({ readPublic: read }));
beforeEach(() => {
  vi.clearAllMocks();
  binding.mockResolvedValue({ db: 'db' });
  read.mockResolvedValue([]);
});
it('passes bounded tag and text filters to the authoritative public query', async () => {
  const response = await GET(
    new Request(
      'https://lettin.tuturuuu.com/api/v1/lettin/worlds?q=magic&tag=R%E1%BB%93ng&page=2'
    )
  );
  expect(response.status).toBe(200);
  expect(read).toHaveBeenCalledWith('db', undefined, {
    search: 'magic',
    tag: 'Rồng',
    page: 2,
  });
});
it.each(['tag=', `tag=${'x'.repeat(41)}`, 'tag=one&tag=two', 'page=10001'])(
  'rejects invalid filter input before database access: %s',
  async (query) => {
    const response = await GET(
      new Request(`https://lettin.tuturuuu.com/api/v1/lettin/worlds?${query}`)
    );
    expect(response.status).toBe(400);
    expect(binding).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  }
);
