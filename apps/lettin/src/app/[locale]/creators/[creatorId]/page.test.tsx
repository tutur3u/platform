import { beforeEach, expect, it, vi } from 'vitest';
import Page, { generateMetadata } from './page';

const state = vi.hoisted(() => ({
  worlds: vi.fn(),
  identity: vi.fn(),
  about: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/lib/public-worlds', () => ({ publicWorlds: state.worlds }));
vi.mock('@/server/creator-profile', () => ({
  readCreatorIdentity: state.identity,
}));
vi.mock('@/server/creator-about', () => ({
  readPublicCreatorAbout: state.about,
}));
vi.mock('@/server/bindings', () => ({
  bindings: async () => ({ db: 'fixture-db' }),
}));
vi.mock('@/lib/page-metadata', () => ({
  createLettinPageMetadata: (input: unknown) => input,
}));
vi.mock('@/components/brand', () => ({ Brand: () => null }));
vi.mock('@/components/creator-about-view', () => ({
  CreatorAboutView: () => null,
}));
vi.mock('@/components/creator-profile-header', () => ({
  CreatorProfileHeader: () => null,
}));
vi.mock('@/components/reader-creator-bookmark', () => ({
  ReaderCreatorBookmark: () => null,
}));
vi.mock('@/components/public-explorer', () => ({ PublicExplorer: () => null }));
const id = '00000000-0000-4000-8000-000000000001';
const identity = {
  id,
  display_name: 'Public name',
  handle: null,
  bio: 'Public bio',
  avatar_url: null,
  banner_url: null,
};
const world = { id: 'published-notebook', published: { title: 'Published' } };
beforeEach(() => {
  vi.resetAllMocks();
  state.identity.mockResolvedValue(identity);
  state.worlds.mockResolvedValue([world]);
  state.about.mockResolvedValue(null);
});
const page = (query = {}) =>
  Page({
    params: Promise.resolve({ creatorId: 'requested-id' }),
    searchParams: Promise.resolve(query),
  });
it('reuses the first published catalogue and preserves the optional owner-shared about projection', async () => {
  const result = await page();
  expect(state.worlds.mock.calls).toEqual([
    [undefined, { creatorId: id, page: 1 }],
  ]);
  expect(state.about).toHaveBeenCalledWith('fixture-db', id);
  expect(result.props.children.at(-1).props).toMatchObject({
    worlds: [world],
    page: 1,
    clearHref: `/creators/${id}`,
  });
  expect(result.props.children[1].props.children[1]).toBeNull();
});
it('renders an empty creator-scoped catalogue for a search without matches', async () => {
  state.worlds.mockResolvedValueOnce([world]).mockResolvedValueOnce([]);
  const result = await page({ q: 'no-match' });
  expect(state.worlds.mock.calls).toEqual([
    [undefined, { creatorId: id, page: 1 }],
    [undefined, { creatorId: id, page: 1, search: 'no-match', tag: undefined }],
  ]);
  expect(result.props.children.at(-1).props).toMatchObject({
    worlds: [],
    search: 'no-match',
    clearHref: `/creators/${id}`,
  });
});
it('uses the same normalized tag/search/page for the scoped query and UI, including empty later pages', async () => {
  state.worlds.mockResolvedValueOnce([world]).mockResolvedValueOnce([]);
  const result = await page({ tag: '  Rồng  ', q: 'magic', page: '2' });
  expect(state.worlds).toHaveBeenLastCalledWith(undefined, {
    creatorId: id,
    page: 2,
    search: 'magic',
    tag: 'Rồng',
  });
  expect(result.props.children.at(-1).props).toMatchObject({
    worlds: [],
    page: 2,
    search: 'magic',
    tag: 'Rồng',
  });
});
it.each([
  { tag: ['one', 'two'] },
  { tag: '' },
  { tag: 'x'.repeat(41) },
  { q: ['one', 'two'] },
  { page: ['2', '3'] },
])(
  'rejects malformed filters before identity/catalogue/about reads: %j',
  async (query) => {
    await expect(page(query)).rejects.toThrow('not-found');
    expect(state.identity).not.toHaveBeenCalled();
    expect(state.worlds).not.toHaveBeenCalled();
    expect(state.about).not.toHaveBeenCalled();
  }
);
it('does not recover unpublished creators through filtered queries or about details', async () => {
  state.worlds.mockResolvedValue([]);
  await expect(page({ q: 'anything', tag: 'Magic' })).rejects.toThrow(
    'not-found'
  );
  expect(state.worlds).toHaveBeenCalledTimes(1);
  expect(state.about).not.toHaveBeenCalled();
});
it('rejects missing identities before catalogue and about access', async () => {
  state.identity.mockResolvedValue(null);
  await expect(page()).rejects.toThrow('not-found');
  expect(state.worlds).not.toHaveBeenCalled();
  expect(state.about).not.toHaveBeenCalled();
});
it('keeps metadata publication-gated and limited to projected identity fields', async () => {
  const result = await generateMetadata({
    params: Promise.resolve({ creatorId: 'requested-id', locale: 'vi' }),
  });
  expect(result).toMatchObject({
    title: 'Public name',
    description: 'Public bio',
    locale: 'vi',
    pathname: `/creators/${id}`,
  });
  state.worlds.mockResolvedValue([]);
  await expect(
    generateMetadata({
      params: Promise.resolve({ creatorId: 'requested-id', locale: 'en' }),
    })
  ).rejects.toThrow('not-found');
});
