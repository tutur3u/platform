import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), forwarded: vi.fn() }));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaces: mocks.list,
  withForwardedInternalApiAuth: mocks.forwarded,
}));

import { withMailRequest } from './request-context';
import { listMailWorkspaces } from './workspace-actions.server';

const load = (cookie: string) =>
  withMailRequest(
    {
      request: new Request(
        'https://mail.tuturuuu.com/_mail/functions/workspaces',
        { headers: { cookie } }
      ),
      responseHeaders: new Headers(),
      waitUntil: () => {},
    },
    listMailWorkspaces
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.forwarded.mockImplementation((headers: Headers) => ({ headers }));
});
describe('native shared workspace-list transport', () => {
  it('preserves canonical forwarded authentication and authorized results', async () => {
    const workspaces = [{ id: 'authorized' }];
    mocks.list.mockResolvedValueOnce(workspaces);
    expect(await load('app=original')).toBe(workspaces);
    expect(mocks.forwarded.mock.calls[0]?.[0].get('cookie')).toBe(
      'app=original'
    );
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });
  it('propagates denial without fabricating an empty list or retrying', async () => {
    mocks.list.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(load('app=denied')).rejects.toThrow('Forbidden');
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
});
