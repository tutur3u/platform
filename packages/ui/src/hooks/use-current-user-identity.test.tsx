import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { announceSessionEnding } from '@tuturuuu/utils/session-events';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserProfile = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/users', () => ({ getCurrentUserProfile }));

import {
  CURRENT_USER_IDENTITY_QUERY_KEY,
  fetchCurrentUserIdentity,
  shouldRetryIdentity,
  useCurrentUserIdentity,
} from './use-current-user-identity';

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { status });

describe('fetchCurrentUserIdentity', () => {
  beforeEach(() => {
    getCurrentUserProfile.mockReset();
  });

  it('returns only the id and email from the profile API', async () => {
    getCurrentUserProfile.mockResolvedValue({
      id: 'user-1',
      email: 'person@example.com',
      display_name: 'Person',
    });
    expect(await fetchCurrentUserIdentity()).toEqual({
      id: 'user-1',
      email: 'person@example.com',
    });
  });

  it.each([401, 403])('resolves to null on %i', async (status) => {
    getCurrentUserProfile.mockImplementation(() =>
      Promise.reject(httpError(status))
    );
    expect(await fetchCurrentUserIdentity()).toBeNull();
  });

  it.each([429, 503])(
    'rejects on a transient %i instead of signing out',
    async (status) => {
      getCurrentUserProfile.mockImplementation(() =>
        Promise.reject(httpError(status))
      );
      let rejected: unknown;
      try {
        await fetchCurrentUserIdentity();
      } catch (error) {
        rejected = error;
      }
      expect(rejected).toMatchObject({ status });
    }
  );
});

describe('shouldRetryIdentity', () => {
  it('retries transient failures a bounded number of times', () => {
    expect(shouldRetryIdentity(0, httpError(503))).toBe(true);
    expect(shouldRetryIdentity(1, new TypeError('network'))).toBe(true);
    expect(shouldRetryIdentity(2, httpError(503))).toBe(false);
  });

  it('never retries a signed-out response', () => {
    expect(shouldRetryIdentity(0, httpError(401))).toBe(false);
  });
});

describe('useCurrentUserIdentity', () => {
  beforeEach(() => {
    getCurrentUserProfile.mockReset();
  });

  it('drops the cached identity when the session ends and loads the next one', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    getCurrentUserProfile.mockResolvedValueOnce({
      id: 'account-a',
      email: 'a@example.com',
    });

    const { result, unmount } = renderHook(() => useCurrentUserIdentity(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data?.id).toBe('account-a'));

    getCurrentUserProfile.mockResolvedValueOnce({
      id: 'account-b',
      email: 'b@example.com',
    });
    announceSessionEnding();
    expect(
      queryClient.getQueryData(CURRENT_USER_IDENTITY_QUERY_KEY)
    ).toBeUndefined();

    unmount();
    const next = renderHook(() => useCurrentUserIdentity(), { wrapper });
    await waitFor(() => expect(next.result.current.data?.id).toBe('account-b'));
  });
});
