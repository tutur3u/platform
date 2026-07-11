import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformLinkRepairDialog } from './platform-link-repair-dialog';

const repairWorkspaceUserPlatformLinksMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastInfoMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('@tuturuuu/internal-api/users', () => ({
  repairWorkspaceUserPlatformLinks: (
    ...args: Parameters<typeof repairWorkspaceUserPlatformLinksMock>
  ) => repairWorkspaceUserPlatformLinksMock(...args),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: (...args: Parameters<typeof toastErrorMock>) =>
      toastErrorMock(...args),
    info: (...args: Parameters<typeof toastInfoMock>) => toastInfoMock(...args),
    success: (...args: Parameters<typeof toastSuccessMock>) =>
      toastSuccessMock(...args),
  },
}));

function renderWithQueryClient(node: ReactNode) {
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
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  );

  return { invalidateSpy };
}

describe('PlatformLinkRepairDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs bulk repair and invalidates workspace users on success', async () => {
    repairWorkspaceUserPlatformLinksMock.mockResolvedValue({
      linked: [
        {
          email: 'student@example.com',
          platformUserId: 'platform-1',
          workspaceUserId: 'workspace-user-1',
          workspaceUserName: 'Student One',
        },
      ],
      skipped: [],
      summary: {
        linked: 1,
        scanned: 1,
        skipped: 0,
      },
    });

    const { invalidateSpy } = renderWithQueryClient(
      <PlatformLinkRepairDialog wsId="ws-1" />
    );

    expect(
      screen.getByRole('button', {
        name: 'ws-users.platform_link_repair_open',
      })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-users.platform_link_repair_open',
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-users.platform_link_repair_run',
      })
    );

    await waitFor(() => {
      expect(repairWorkspaceUserPlatformLinksMock).toHaveBeenCalledWith('ws-1');
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['workspace-users', 'ws-1'],
      });
    });

    expect(toastSuccessMock).toHaveBeenCalled();
    expect(screen.getByText('Student One · student@example.com')).toBeVisible();
  });

  it('renders skipped repair results', async () => {
    repairWorkspaceUserPlatformLinksMock.mockResolvedValue({
      linked: [],
      skipped: [
        {
          email: 'student@example.com',
          reason: 'platform_already_linked',
          workspaceUserId: 'workspace-user-1',
          workspaceUserName: 'Student One',
        },
      ],
      summary: {
        linked: 0,
        scanned: 1,
        skipped: 1,
      },
    });

    renderWithQueryClient(<PlatformLinkRepairDialog wsId="ws-1" />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-users.platform_link_repair_open',
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-users.platform_link_repair_run',
      })
    );

    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalled();
    });

    expect(screen.getByText('Student One')).toBeVisible();
    expect(
      screen.getByText((content) =>
        content.includes(
          'ws-users.platform_link_repair_reason_platform_already_linked'
        )
      )
    ).toBeVisible();
  });
});
