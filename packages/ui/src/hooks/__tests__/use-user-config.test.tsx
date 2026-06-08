import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserBooleanConfig } from '../use-user-config';

const { mockGetUserConfig, mockUpdateUserConfig } = vi.hoisted(() => ({
  mockGetUserConfig: vi.fn(),
  mockUpdateUserConfig: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/users', () => ({
  getUserConfig: (...args: unknown[]) => mockGetUserConfig(...args),
  updateUserConfig: (...args: unknown[]) => mockUpdateUserConfig(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useUserBooleanConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the requested boolean default while the config is loading', () => {
    mockGetUserConfig.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => useUserBooleanConfig('EXPAND_SETTINGS_ACCORDIONS', true),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.value).toBe(true);
  });

  it('lets a saved false value override a default true value after loading', async () => {
    mockGetUserConfig.mockResolvedValue({ value: 'false' });

    const { result } = renderHook(
      () => useUserBooleanConfig('EXPAND_SETTINGS_ACCORDIONS', true),
      { wrapper: createWrapper() }
    );

    expect(result.current.value).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.value).toBe(false);
    });
  });
});
