import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIndicators } from './use-indicators';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const fetchMock = vi.fn();

function createResponse(body: unknown = {}) {
  return {
    json: vi.fn().mockResolvedValue(body),
    ok: true,
  } as unknown as Response;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function renderIndicators() {
  return renderHook(
    () =>
      useIndicators({
        wsId: 'ws-1',
        groupId: 'group-1',
        initialGroupIndicators: [],
        initialMetricCategories: [],
        initialUserIndicators: [],
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      }),
    { wrapper: createWrapper() }
  );
}

function findRequest(method: string) {
  return fetchMock.mock.calls.find(
    ([, options]) => (options as RequestInit | undefined)?.method === method
  );
}

describe('useIndicators mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(
      createResponse({
        groupIndicators: [],
        managerUserIds: [],
        metricCategories: [],
        userIndicators: [],
      })
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  it('creates score columns through the Contacts indicator API', async () => {
    const { result } = renderIndicators();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await result.current.createVitalMutation.mutateAsync({
        name: 'Quiz 1',
        unit: 'points',
        factor: 1,
        categoryIds: ['category-1'],
        isWeighted: true,
      });
    });

    expect(findRequest('POST')).toEqual([
      '/api/v1/workspaces/ws-1/user-groups/group-1/indicators',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Quiz 1',
          unit: 'points',
          factor: 1,
          categoryIds: ['category-1'],
          isWeighted: true,
        }),
      }),
    ]);
  });

  it('updates score columns through the Contacts indicator API', async () => {
    const { result } = renderIndicators();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await result.current.updateIndicatorMutation.mutateAsync({
        indicatorId: 'indicator-1',
        name: 'Quiz 1 revised',
        unit: 'points',
        factor: 2,
        categoryIds: [],
        isWeighted: false,
      });
    });

    expect(findRequest('PUT')).toEqual([
      '/api/v1/workspaces/ws-1/user-groups/group-1/indicators/indicator-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          name: 'Quiz 1 revised',
          factor: 2,
          unit: 'points',
          categoryIds: [],
          isWeighted: false,
        }),
      }),
    ]);
  });

  it('deletes score columns through the Contacts indicator API', async () => {
    const { result } = renderIndicators();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await result.current.deleteIndicatorMutation.mutateAsync('indicator-1');
    });

    expect(findRequest('DELETE')).toEqual([
      '/api/v1/workspaces/ws-1/user-groups/group-1/indicators/indicator-1',
      expect.objectContaining({ method: 'DELETE' }),
    ]);
  });

  it('saves score values through the Contacts indicator API', async () => {
    const { result } = renderIndicators();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    act(() => {
      result.current.handleValueChange('user-1', 'indicator-1', '9.5');
    });
    await waitFor(() => expect(result.current.hasChanges).toBe(true));
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(findRequest('PATCH')).toEqual([
      '/api/v1/workspaces/ws-1/user-groups/group-1/indicators',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify([
          {
            user_id: 'user-1',
            indicator_id: 'indicator-1',
            value: 9.5,
          },
        ]),
      }),
    ]);
  });
});
