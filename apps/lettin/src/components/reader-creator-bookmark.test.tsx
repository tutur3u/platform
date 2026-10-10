import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  connection: vi.fn(),
  redirect: vi.fn((value: string) => {
    throw new Error(value);
  }),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/i18n/navigation', () => ({ Link: () => null }));
vi.mock('./creator-bookmark', () => ({ CreatorBookmark: () => null }));
vi.mock('./saved-notebooks', () => ({ SavedNotebooks: () => null }));
vi.mock('./saved-creators', () => ({ SavedCreators: () => null }));
vi.mock('./brand', () => ({ Brand: () => null }));

import { ReaderCreatorBookmark } from './reader-creator-bookmark';

it('shows an anonymous sign-in intent without reading private saves', async () => {
  mocks.user.mockResolvedValue(null);
  const tree = await ReaderCreatorBookmark({ creatorId: 'world' });
  expect(mocks.connection).toHaveBeenCalled();
  expect(mocks.user).toHaveBeenCalledWith('lettin');
  expect(tree.props.children[1].props.href).toBe(
    '/login?next=%2Fcreators%2Fworld'
  );
});
it('binds signed-in bookmark controls to the app-session actor', async () => {
  mocks.user.mockResolvedValue({ id: 'actor-a' });
  const tree = await ReaderCreatorBookmark({ creatorId: 'world' });
  expect(tree.props.children[1].props.actorId).toBe('actor-a');
  expect(tree.props.children[1].key).toBe('actor-a:world');
});
