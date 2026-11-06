import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ from: vi.fn(), own: false }));
vi.mock('@/features/forms/route-utils', () => ({
  getWorkspaceRouteContext: async () => ({
    user: { id: 'actor' },
    isMember: true,
    canManageForms: true,
    wsId: 'workspace-a',
    adminClient: { from: state.from },
  }),
  parseFormIdParam: (id: string) => id,
}));
vi.mock('@/features/forms/server', () => ({
  getPrivateFormsClient: (client: unknown) => client,
  generateFormShareCode: () => 'new-code',
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET } from './route';

beforeEach(() => {
  state.own = false;
  state.from.mockReset().mockImplementation((table: string) => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        filters[key] = value;
        return query;
      },
      maybeSingle: async () => ({
        data:
          table === 'forms'
            ? state.own && filters.ws_id === 'workspace-a'
              ? { id: 'form' }
              : null
            : { code: 'private-code', active: true },
        error: null,
      }),
    };
    return query;
  });
});
it('denies a foreign form before reading or creating share links', async () => {
  const response = await GET(new NextRequest('http://localhost/share-link'), {
    params: Promise.resolve({ wsId: 'workspace-a', formId: 'form' }),
  });
  expect(response.status).toBe(404);
  expect(state.from).not.toHaveBeenCalledWith('form_share_links');
});
it('returns an existing share link for an owned form', async () => {
  state.own = true;
  const response = await GET(new NextRequest('http://localhost/share-link'), {
    params: Promise.resolve({ wsId: 'workspace-a', formId: 'form' }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    shareLink: { code: 'private-code', active: true },
  });
});
