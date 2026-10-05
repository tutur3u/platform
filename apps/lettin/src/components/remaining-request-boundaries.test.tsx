import { Suspense } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import ModerationPage from '../app/[locale]/[wsId]/moderation/page';
import ProfilePage from '../app/[locale]/[wsId]/profile/page';
import WikiPage from '../app/[locale]/[wsId]/wiki/[worldId]/[section]/page';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  actor: vi.fn(),
  creator: vi.fn(),
  worlds: vi.fn(),
  bindings: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
vi.mock('../server/identity', () => ({ resolveActor: mocks.actor }));
vi.mock('../server/context', () => ({ isCreator: mocks.creator }));
vi.mock('../server/bindings', () => ({ bindings: mocks.bindings }));
vi.mock('../lib/public-worlds', () => ({ publicWorlds: mocks.worlds }));
vi.mock('./blacklist-manager', () => ({ BlacklistManager: () => null }));
vi.mock('./creator-profile-editor', () => ({
  CreatorProfileEditor: () => null,
}));
vi.mock('./world-studio', () => ({ WorldStudio: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: 'actor', canManage: true });
  mocks.bindings.mockResolvedValue({ db: 'database' });
  mocks.creator.mockResolvedValue(true);
  mocks.worlds.mockResolvedValue([{ id: 'published' }]);
});

for (const [name, page] of [
  ['moderation', ModerationPage],
  ['profile', ProfilePage],
  ['wiki', WikiPage],
] as const) {
  test(`${name} emits its loading boundary before reading request data`, async () => {
    let release!: () => void;
    mocks.connection.mockImplementation(
      () =>
        new Promise<void>((done) => {
          release = done;
        })
    );
    const params = Promise.resolve({
      wsId: 'workspace',
      worldId: '00000000-0000-4000-8000-000000000000',
      section: 'overview',
    });
    const paramsRead = vi.spyOn(params, 'then');
    const shell = page({
      params,
      searchParams: Promise.resolve({ entry: 'entry' }),
    });
    expect(shell.type).toBe(Suspense);
    expect(shell.props.fallback).toBeTruthy();
    expect(mocks.connection).not.toHaveBeenCalled();
    const child = shell.props.children;
    const pending = child.type(child.props);
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(paramsRead).not.toHaveBeenCalled();
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.worlds).not.toHaveBeenCalled();
    release();
    const result = await pending;
    expect(result.props.wsId).toBe('workspace');
    if (name === 'wiki') expect(result.props.initialEntry).toBe('entry');
    if (name === 'profile') {
      expect(mocks.actor).toHaveBeenCalledWith('workspace');
      expect(mocks.worlds).toHaveBeenCalledWith(undefined, {
        creatorId: 'actor',
      });
      expect(result.props.canEditAbout).toBe(true);
      expect(result.props.hasPublishedWorlds).toBe(true);
    }
  });
}
