import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((target: { href: string; locale: string }) => {
    throw new Error(`redirect:${target.locale}:${target.href}`);
  })
);
vi.mock('@/i18n/routing', () => ({ redirect }));

import WorkspaceMembersPage from './page';

function visit(tab?: string) {
  return WorkspaceMembersPage({
    params: Promise.resolve({ locale: 'vi', wsId: 'ws-1' }),
    searchParams: Promise.resolve({ tab }),
  });
}

beforeEach(() => redirect.mockClear());

describe('legacy workspace members route', () => {
  it('opens Settings -> Members over the workspace in the same locale', async () => {
    await expect(visit()).rejects.toThrow(
      'redirect:vi:/ws-1?settingsDialog=open&settingsTab=workspace_members'
    );
  });

  it('keeps the old ?tab= view', async () => {
    await expect(visit('roles')).rejects.toThrow(
      'settingsTab=workspace_members&settingsMembersTab=roles'
    );
  });

  it('drops an unknown ?tab= value', async () => {
    await expect(visit('everything')).rejects.toThrow(
      /settingsTab=workspace_members$/
    );
  });
});
