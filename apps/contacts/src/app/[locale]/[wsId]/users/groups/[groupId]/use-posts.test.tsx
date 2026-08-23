// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpsertPostMutation } from './use-posts';

const { createUserGroupPost, toastError } = vi.hoisted(() => ({
  createUserGroupPost: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/posts', () => ({
  createUserGroupPost: (...args: unknown[]) => createUserGroupPost(...args),
  deleteUserGroupPost: vi.fn(),
  listUserGroupPosts: vi.fn(),
  updateUserGroupPost: vi.fn(),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: toastError, success: vi.fn() },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useUpsertPostMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a localized safe error instead of raw server details', async () => {
    createUserGroupPost.mockRejectedValueOnce(
      new Error('TEXT_FIELD_LENGTH_EXCEEDED: internal database details')
    );
    const { result } = renderHook(
      () => useUpsertPostMutation('group-1', 'workspace-1'),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({ content: 'post', notes: '', title: '' })
      ).rejects.toThrow('TEXT_FIELD_LENGTH_EXCEEDED');
    });

    expect(toastError).toHaveBeenCalledWith('ws-user-groups.post_save_failed');
  });
});
