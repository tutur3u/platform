import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((_target?: { href: string; locale: string }) => {
    throw new Error('NEXT_REDIRECT');
  })
);
vi.mock('@/i18n/routing', () => ({ redirect }));

import WorkspaceMembersPage from './page';

async function visit(tab?: string) {
  await expect(
    WorkspaceMembersPage({
      params: Promise.resolve({ locale: 'vi', wsId: 'ws-1' }),
      searchParams: Promise.resolve({ tab }),
    })
  ).rejects.toThrow();
  return redirect.mock.calls[0]?.[0];
}

beforeEach(() => redirect.mockClear());

describe('legacy workspace members route', () => {
  it('opens Settings -> Members over the workspace in the same locale', async () => {
    expect(await visit()).toEqual({
      href: '/ws-1?settingsDialog=open&settingsTab=workspace_members',
      locale: 'vi',
    });
  });

  it('keeps the old ?tab= view', async () => {
    expect((await visit('roles'))?.href).toBe(
      '/ws-1?settingsDialog=open&settingsTab=workspace_members&settingsMembersTab=roles'
    );
  });

  it('drops an unknown ?tab= value', async () => {
    expect((await visit('everything'))?.href).toBe(
      '/ws-1?settingsDialog=open&settingsTab=workspace_members'
    );
  });
});
