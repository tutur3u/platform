import { Suspense } from 'react';
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
vi.mock('./notebook-bookmark', () => ({ NotebookBookmark: () => null }));
vi.mock('./saved-notebooks', () => ({ SavedNotebooks: () => null }));
vi.mock('./brand', () => ({ Brand: () => null }));

import SavedPage from '../app/[locale]/saved/page';
import { ReaderBookmark } from './reader-bookmark';

it('shows an anonymous sign-in intent without reading private saves', async () => {
  mocks.user.mockResolvedValue(null);
  const tree = await ReaderBookmark({ worldId: 'world' });
  expect(mocks.connection).toHaveBeenCalled();
  expect(mocks.user).toHaveBeenCalledWith('lettin');
  expect(tree.props.children[0].props.href).toBe(
    '/login?next=%2Fworlds%2Fworld'
  );
});
it('binds signed-in bookmark controls to the app-session actor', async () => {
  mocks.user.mockResolvedValue({ id: 'actor-a' });
  const tree = await ReaderBookmark({ worldId: 'world' });
  expect(tree.props.children[0].props.actorId).toBe('actor-a');
  expect(tree.props.children[0].key).toBe('actor-a');
});
it('suspends request-time private library and preserves login destination', async () => {
  const page = SavedPage();
  const boundary = page.props.children[1];
  expect(boundary.type).toBe(Suspense);
  mocks.user.mockResolvedValue(null);
  await expect(boundary.props.children.type()).rejects.toThrow(
    '/login?next=%2Fsaved'
  );
  mocks.user.mockResolvedValue({ id: 'actor-b' });
  const library = await boundary.props.children.type();
  expect(library.props.actorId).toBe('actor-b');
  expect(library.key).toBe('actor-b');
});
