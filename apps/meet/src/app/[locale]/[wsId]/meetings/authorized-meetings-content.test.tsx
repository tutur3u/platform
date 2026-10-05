import { isValidElement } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  policy: vi.fn(),
  context: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: mocks.identity } },
  }),
}));
vi.mock('@tuturuuu/utils/meet-hosting', () => ({
  canVerifiedAccountHostMeeting: mocks.policy,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../workspace-context', () => ({
  getMeetWorkspaceContext: mocks.context,
}));
vi.mock('./meetings-content', () => ({ MeetingsContent: () => null }));
vi.mock('@tuturuuu/ui/card', () => ({
  Card: () => null,
  CardContent: () => null,
  CardHeader: () => null,
}));

import { AuthorizedMeetingsContent } from './authorized-meetings-content';
import MeetingsPage from './page';

const props = {
  accountId: 'actor',
  wsId: 'workspace',
  page: 1,
  pageSize: 10,
  search: '',
};
function children(result: unknown) {
  if (!isValidElement<{ children: unknown[] }>(result))
    throw new Error('Expected element');
  return result.props.children;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ user: { id: 'actor' }, wsId: 'workspace' });
  mocks.identity.mockResolvedValue({
    data: { user: { email: 'test@example.com', email_confirmed_at: 'now' } },
    error: null,
  });
  mocks.policy.mockResolvedValue(true);
});
test('workspace heading resolves without waiting for hosting identity network read', async () => {
  mocks.identity.mockReturnValue(new Promise(() => {}));
  const page = await MeetingsPage({
    params: Promise.resolve({ wsId: 'workspace' }),
    searchParams: Promise.resolve({}),
  });
  expect(isValidElement(page)).toBe(true);
  expect(mocks.context).toHaveBeenCalledWith('workspace');
  expect(mocks.identity).not.toHaveBeenCalled();
});
test('workspace denial still aborts the page before streaming protected content', async () => {
  mocks.context.mockRejectedValue(new Error('workspace_denied'));
  await expect(
    MeetingsPage({
      params: Promise.resolve({ wsId: 'workspace' }),
      searchParams: Promise.resolve({}),
    })
  ).rejects.toThrow('workspace_denied');
  expect(mocks.identity).not.toHaveBeenCalled();
});
test('verified hosting eligibility enables controls for exactly the supplied actor', async () => {
  const result = children(await AuthorizedMeetingsContent(props));
  expect(mocks.identity).toHaveBeenCalledWith('actor');
  expect(mocks.policy).toHaveBeenCalledWith(
    'actor',
    expect.objectContaining({ email: 'test@example.com' })
  );
  expect(result[1]).toEqual(
    expect.objectContaining({
      props: expect.objectContaining({ canCreate: true, accountId: 'actor' }),
    })
  );
});
test.each(['identity', 'policy'])(
  'a %s failure keeps creation disabled with an unavailable warning',
  async (failure) => {
    if (failure === 'identity')
      mocks.identity.mockResolvedValue({
        data: { user: null },
        error: new Error('offline'),
      });
    else mocks.policy.mockRejectedValue(new Error('offline'));
    const result = children(await AuthorizedMeetingsContent(props));
    expect(result[0]).toEqual(
      expect.objectContaining({
        props: expect.objectContaining({
          role: 'alert',
          children: 'hosting_unavailable',
        }),
      })
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        props: expect.objectContaining({ canCreate: false }),
      })
    );
  }
);
test('ineligible accounts retain the restriction notice', async () => {
  mocks.policy.mockResolvedValue(false);
  const result = children(await AuthorizedMeetingsContent(props));
  expect(result[0]).toEqual(
    expect.objectContaining({
      props: expect.objectContaining({ children: 'creation_restricted' }),
    })
  );
  expect(result[1]).toEqual(
    expect.objectContaining({
      props: expect.objectContaining({ canCreate: false }),
    })
  );
});
