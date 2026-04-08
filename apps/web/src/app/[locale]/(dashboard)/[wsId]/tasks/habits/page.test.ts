import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn();
const isHabitsEnabledMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/habits/access', () => ({
  isHabitsEnabled: isHabitsEnabledMock,
}));

beforeEach(() => {
  redirectMock.mockClear();
  isHabitsEnabledMock.mockReset();
});

describe('legacy habits page redirect', () => {
  it('redirects to the dedicated habits route when enabled', async () => {
    isHabitsEnabledMock.mockResolvedValue(true);

    const Page = (await import('./page')).default;

    await Page({
      params: Promise.resolve({
        locale: 'en',
        wsId: 'workspace-123',
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/workspace-123/habits');
  });

  it('falls back to the workspace root when disabled', async () => {
    isHabitsEnabledMock.mockResolvedValue(false);

    const Page = (await import('./page')).default;

    await Page({
      params: Promise.resolve({
        locale: 'en',
        wsId: 'workspace-123',
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/workspace-123');
  });
});
