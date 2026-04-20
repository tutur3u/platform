import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExternalProjectLivePreview } from './use-external-project-live-preview';

const { getWorkspaceExternalProjectDeliveryMock } = vi.hoisted(() => ({
  getWorkspaceExternalProjectDeliveryMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getWorkspaceExternalProjectDelivery: getWorkspaceExternalProjectDeliveryMock,
}));

describe('useExternalProjectLivePreview', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 0,
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  it('loads preview delivery data with preview mode enabled', async () => {
    getWorkspaceExternalProjectDeliveryMock.mockResolvedValue({
      adapter: 'yoola',
      canonicalProjectId: 'project-1',
      collections: [],
      generatedAt: '2026-04-18T00:00:00.000Z',
      loadingData: null,
      profileData: {},
      workspaceId: 'ws_123',
    });

    const { result } = renderHook(
      () =>
        useExternalProjectLivePreview({
          enabled: true,
          refreshToken: 0,
          selectedEntryId: 'entry-1',
          workspaceId: 'ws_123',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getWorkspaceExternalProjectDeliveryMock).toHaveBeenCalledWith(
      'ws_123',
      true,
      { fetch: undefined }
    );
  });
});
