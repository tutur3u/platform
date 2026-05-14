import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  getMyHiveAccessRequestStatus,
  requestHiveAccess,
} from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../messages/en.json';
import { AccessRequestCard } from './access-request-card';

const router = {
  replace: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getMyHiveAccessRequestStatus: vi.fn(),
  requestHiveAccess: vi.fn(),
}));

function renderCard(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('AccessRequestCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    router.replace.mockReset();
    vi.mocked(getMyHiveAccessRequestStatus).mockReset();
    vi.mocked(requestHiveAccess).mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('requests Hive access and polls every 5 seconds until approved', async () => {
    vi.mocked(getMyHiveAccessRequestStatus)
      .mockResolvedValueOnce({
        hasAccess: false,
        member: null,
        request: null,
        status: 'none',
      })
      .mockResolvedValueOnce({
        hasAccess: true,
        member: {
          createdAt: '2026-05-14T00:01:00.000Z',
          enabled: true,
          id: '00000000-0000-4000-8000-000000000004',
          notes: 'Approved from Platform Roles',
          userId: '00000000-0000-4000-8000-000000000002',
        },
        request: null,
        status: 'approved',
      });
    vi.mocked(requestHiveAccess).mockResolvedValue({
      hasAccess: false,
      member: null,
      request: {
        createdAt: '2026-05-14T00:00:00.000Z',
        email: 'researcher@example.com',
        id: '00000000-0000-4000-8000-000000000003',
        note: 'I run research',
        requestedAt: '2026-05-14T00:00:00.000Z',
        resolutionNote: null,
        resolvedAt: null,
        resolvedBy: null,
        status: 'pending',
        updatedAt: '2026-05-14T00:00:00.000Z',
        userId: '00000000-0000-4000-8000-000000000002',
      },
      status: 'pending',
    });

    renderCard(<AccessRequestCard email="researcher@example.com" />);

    expect(screen.getByText('Request researcher access')).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });
    expect(getMyHiveAccessRequestStatus).toHaveBeenCalledTimes(1);
    fireEvent.change(
      screen.getByPlaceholderText('Optional note for the platform admin'),
      {
        target: { value: 'I run research' },
      }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Request Hive access' })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(requestHiveAccess).toHaveBeenCalledWith({
      note: 'I run research',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getMyHiveAccessRequestStatus).toHaveBeenCalledTimes(2);
  });

  it('redirects once the access status is approved', async () => {
    vi.mocked(getMyHiveAccessRequestStatus).mockResolvedValueOnce({
      hasAccess: true,
      member: {
        createdAt: '2026-05-14T00:01:00.000Z',
        enabled: true,
        id: '00000000-0000-4000-8000-000000000004',
        notes: 'Approved from Platform Roles',
        userId: '00000000-0000-4000-8000-000000000002',
      },
      request: null,
      status: 'approved',
    });

    renderCard(<AccessRequestCard email="researcher@example.com" />);

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
