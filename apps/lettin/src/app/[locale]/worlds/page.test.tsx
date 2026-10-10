import { beforeEach, expect, it, vi } from 'vitest';
import Page from './page';

const { worlds } = vi.hoisted(() => ({ worlds: vi.fn() }));
vi.mock('@/lib/public-worlds', () => ({ publicWorlds: worlds }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
vi.mock('@/components/brand', () => ({ Brand: () => null }));
vi.mock('@/components/public-explorer', () => ({ PublicExplorer: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  worlds.mockResolvedValue([]);
});
it('uses the same normalized tag in the server query and reading surface', async () => {
  const result = await Page({
    searchParams: Promise.resolve({ tag: '  Rồng  ', q: 'magic', page: '2' }),
  });
  expect(worlds).toHaveBeenCalledWith(undefined, {
    page: 2,
    search: 'magic',
    tag: 'Rồng',
  });
  expect(result.props.children[1].props.tag).toBe('Rồng');
});
it.each([
  { tag: ['one', 'two'] },
  { tag: '' },
  { tag: 'x'.repeat(41) },
  { q: ['one', 'two'] },
])(
  'rejects malformed page filters before database access: %j',
  async (query) => {
    await expect(
      Page({ searchParams: Promise.resolve(query) })
    ).rejects.toThrow('not-found');
    expect(worlds).not.toHaveBeenCalled();
  }
);
