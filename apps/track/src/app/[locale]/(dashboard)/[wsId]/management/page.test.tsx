/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TimeTrackerManagementPage from './page';

const mocks = vi.hoisted(() => ({
  getGroupedSessionsPaginated: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  getTimeTrackingStats: vi.fn(),
  createAdminClient: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/email/client', () => ({
  isValidTuturuuuEmail: () => true,
}));
vi.mock('@/lib/time-tracking-helper', () => ({
  getGroupedSessionsPaginated: mocks.getGroupedSessionsPaginated,
  getTimeTrackingStats: mocks.getTimeTrackingStats,
}));
vi.mock('@/components/workspace-wrapper', () => ({ default: vi.fn() }));
vi.mock('./client', () => ({
  default: ({ wsId }: { wsId: string }) => <div>Management {wsId}</div>,
}));

describe('TimeTrackerManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue({
      email: 'member@tuturuuu.com',
      id: 'user-1',
    });
    mocks.getGroupedSessionsPaginated.mockResolvedValue({
      data: [],
      pagination: { limit: 20, page: 1, pages: 0, total: 0 },
    });
    mocks.getTimeTrackingStats.mockResolvedValue(undefined);
    mocks.createAdminClient.mockResolvedValue({ client: 'admin' });
  });

  it('renders management for a root member in the selected workspace', async () => {
    const page = (await TimeTrackerManagementPage({
      params: Promise.resolve({ wsId: 'workspace-1' }),
      searchParams: Promise.resolve({}),
    })) as ReactElement<{
      children: (value: { wsId: string }) => Promise<ReactNode>;
    }>;
    const content = await page.props.children({ wsId: 'workspace-1' });
    render(content);

    expect(screen.getByText('Management workspace-1')).toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.getGroupedSessionsPaginated).toHaveBeenCalledWith(
      'workspace-1',
      'day',
      expect.objectContaining({ limit: 20, page: 1 }),
      { client: 'admin' }
    );
    expect(mocks.getTimeTrackingStats).toHaveBeenCalledWith(
      'workspace-1',
      undefined,
      { client: 'admin' }
    );
  });
});
