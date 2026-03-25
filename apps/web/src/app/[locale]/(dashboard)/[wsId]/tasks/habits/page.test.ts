import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('legacy habits page redirect', () => {
  it('redirects to the dedicated habits route', async () => {
    const Page = (await import('./page')).default;

    await Page({
      params: Promise.resolve({
        locale: 'en',
        wsId: 'workspace-123',
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/workspace-123/habits');
  });
});
