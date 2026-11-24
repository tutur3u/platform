import { describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  })
);
vi.mock('next/navigation', () => ({ redirect }));

import WorkspaceMembersPage from './page';

describe('legacy workspace members route', () => {
  it('opens Settings -> Members over the workspace', async () => {
    await expect(
      WorkspaceMembersPage({ params: Promise.resolve({ wsId: 'ws-1' }) })
    ).rejects.toThrow(
      'redirect:/ws-1?settingsDialog=open&settingsTab=workspace_members'
    );
  });
});
