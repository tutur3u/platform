import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceUsersTable } from './workspace-users-table';

const {
  dataTableMock,
  parser,
  querySetters,
  queryState,
  useWorkspaceUsersMock,
} = vi.hoisted(() => {
  const nextParser = {
    withDefault() {
      return this;
    },
    withOptions() {
      return this;
    },
  };

  return {
    useWorkspaceUsersMock: vi.fn(),
    dataTableMock: vi.fn(),
    querySetters: {
      excludedGroups: vi.fn(),
      groupMembership: vi.fn(),
      includedGroups: vi.fn(),
      linkStatus: vi.fn(),
      page: vi.fn(),
      pageSize: vi.fn(),
      q: vi.fn(),
      requireAttention: vi.fn(),
      status: vi.fn(),
    } as Record<string, ReturnType<typeof vi.fn>>,
    queryState: {
      q: '',
      page: 1,
      pageSize: 10,
      status: 'active',
      linkStatus: null,
      requireAttention: 'all',
      groupMembership: null,
      includedGroups: [],
      excludedGroups: null,
    } as Record<string, unknown>,
    parser: nextParser,
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('nuqs', () => ({
  parseAsArrayOf: () => parser,
  parseAsInteger: parser,
  parseAsString: parser,
  useQueryState: (key: string) => [queryState[key] ?? null, querySetters[key]],
}));

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserConfig: (_configId: string, defaultValue: string) => ({
    data: defaultValue,
    isLoading: false,
  }),
}));

vi.mock('@tuturuuu/users-ui/database/hooks', () => ({
  useDefaultIncludedGroups: vi.fn(() => ({
    data: ['default-included-group'],
    isLoading: false,
  })),
  useDefaultExcludedGroups: vi.fn(() => ({
    data: ['default-group'],
    isLoading: false,
  })),
  useWorkspaceUserFields: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useWorkspaceUsers: (...args: unknown[]) => useWorkspaceUsersMock(...args),
}));

vi.mock('./export-dialog-content', () => ({
  default: ({ filters }: { filters: unknown }) => (
    <div data-testid="export-dialog-content">{JSON.stringify(filters)}</div>
  ),
}));

vi.mock('@tuturuuu/ui/custom/tables/data-table', () => ({
  DataTable: (props: Record<string, unknown>) => {
    dataTableMock(props);
    return <div data-testid="users-data-table" />;
  },
}));

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient();
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    ),
  };
}

describe('WorkspaceUsersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(querySetters).forEach((setter) => {
      setter.mockClear();
    });
    queryState.q = '';
    queryState.page = 1;
    queryState.pageSize = 10;
    queryState.status = 'active';
    queryState.linkStatus = null;
    queryState.requireAttention = 'all';
    queryState.groupMembership = null;
    queryState.includedGroups = [];
    queryState.excludedGroups = null;

    useWorkspaceUsersMock.mockReturnValue({
      data: {
        data: [],
        count: 42,
      },
      isLoading: false,
      isFetching: false,
      error: null,
    });
  });

  it('uses resolved default excluded groups when included groups are empty', async () => {
    renderWithQueryClient(
      <WorkspaceUsersTable
        wsId="ws-123"
        locale="en"
        canExport
        permissions={{
          hasPrivateInfo: true,
          hasPublicInfo: true,
          canCreateUsers: true,
          canUpdateUsers: true,
          canDeleteUsers: true,
          canCheckUserAttendance: true,
        }}
      />
    );

    await waitFor(() => {
      expect(useWorkspaceUsersMock).toHaveBeenCalled();
    });

    expect(useWorkspaceUsersMock.mock.calls[0]?.[1]).toMatchObject({
      includedGroups: ['default-included-group'],
      excludedGroups: ['default-group'],
      status: 'active',
      linkStatus: 'all',
      requireAttention: 'all',
      groupMembership: 'all',
    });

    const dataTableProps = dataTableMock.mock.calls.at(-1)?.[0] as {
      count: number;
      toolbarExportContent?: React.ReactElement<{ filters: unknown }>;
    };

    expect(dataTableProps.count).toBe(42);
    expect(dataTableProps.toolbarExportContent?.props.filters).toMatchObject({
      excludedGroups: ['default-group'],
    });
    expect(querySetters.includedGroups).not.toHaveBeenCalled();
    expect(querySetters.excludedGroups).not.toHaveBeenCalled();
  });

  it('preserves explicit included and excluded groups', async () => {
    queryState.includedGroups = ['included-group'];
    queryState.excludedGroups = ['excluded-group'];

    renderWithQueryClient(
      <WorkspaceUsersTable
        wsId="ws-123"
        locale="en"
        permissions={{
          hasPrivateInfo: true,
          hasPublicInfo: true,
          canCreateUsers: true,
          canUpdateUsers: true,
          canDeleteUsers: true,
          canCheckUserAttendance: true,
        }}
      />
    );

    await waitFor(() => {
      expect(useWorkspaceUsersMock).toHaveBeenCalled();
    });

    expect(useWorkspaceUsersMock.mock.calls[0]?.[1]).toMatchObject({
      includedGroups: ['included-group'],
      excludedGroups: ['excluded-group'],
    });
  });

  it('passes compact filter values through to the users query and filter panel', async () => {
    queryState.status = 'archived_until';
    queryState.linkStatus = 'virtual';
    queryState.requireAttention = 'true';
    queryState.groupMembership = 'none';
    queryState.includedGroups = ['included-group'];
    queryState.excludedGroups = ['excluded-group'];

    renderWithQueryClient(
      <WorkspaceUsersTable
        wsId="ws-123"
        locale="en"
        permissions={{
          hasPrivateInfo: true,
          hasPublicInfo: true,
          canCreateUsers: true,
          canUpdateUsers: true,
          canDeleteUsers: true,
          canCheckUserAttendance: true,
        }}
      />
    );

    await waitFor(() => {
      expect(useWorkspaceUsersMock).toHaveBeenCalled();
    });

    expect(useWorkspaceUsersMock.mock.calls[0]?.[1]).toMatchObject({
      status: 'archived_until',
      linkStatus: 'virtual',
      requireAttention: 'true',
      groupMembership: 'none',
      includedGroups: ['included-group'],
      excludedGroups: ['excluded-group'],
    });

    const dataTableProps = dataTableMock.mock.calls.at(-1)?.[0] as {
      filters?: React.ReactElement<Record<string, unknown>>;
    };

    expect(dataTableProps.filters?.props).toMatchObject({
      status: 'archived_until',
      linkStatus: 'virtual',
      requireAttention: 'true',
      groupMembership: 'none',
      effectiveExcludedGroups: ['excluded-group'],
    });
  });

  it('renders core user rows without waiting for optional field definitions', async () => {
    const hooks = await import('@tuturuuu/users-ui/database/hooks');
    vi.mocked(hooks.useWorkspaceUserFields).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof hooks.useWorkspaceUserFields>);

    renderWithQueryClient(
      <WorkspaceUsersTable
        wsId="ws-123"
        locale="en"
        permissions={{
          hasPrivateInfo: true,
          hasPublicInfo: true,
          canCreateUsers: true,
          canUpdateUsers: true,
          canDeleteUsers: true,
          canCheckUserAttendance: true,
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('users-data-table')).toBeInTheDocument();
    });

    expect(dataTableMock.mock.calls.at(-1)?.[0]).toMatchObject({
      extraColumns: [],
    });
  });

  it('keeps search controls available when the users query errors', async () => {
    useWorkspaceUsersMock.mockReturnValue({
      data: {
        data: [{ id: 'user-1' }],
        count: 1,
      },
      isLoading: false,
      isFetching: false,
      error: new Error('Rate limit exceeded'),
    });

    const { queryClient } = renderWithQueryClient(
      <WorkspaceUsersTable
        wsId="ws-123"
        locale="en"
        permissions={{
          hasPrivateInfo: true,
          hasPublicInfo: true,
          canCreateUsers: true,
          canUpdateUsers: true,
          canDeleteUsers: true,
          canCheckUserAttendance: true,
        }}
      />
    );
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => {
      expect(dataTableMock).toHaveBeenCalled();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'common.error: Rate limit exceeded'
    );
    expect(screen.getByTestId('users-data-table')).toBeInTheDocument();

    const dataTableProps = dataTableMock.mock.calls.at(-1)?.[0] as {
      data?: Array<{ href?: string; id: string }>;
      count: number;
      onSearch?: (query: string) => void;
      resetParams?: () => void;
    };

    expect(dataTableProps.count).toBe(1);
    expect(dataTableProps.data).toEqual([
      expect.objectContaining({
        href: '/ws-123/users/database/user-1',
        id: 'user-1',
      }),
    ]);

    dataTableProps.onSearch?.('alice');
    expect(querySetters.q).toHaveBeenCalledWith('alice');
    expect(querySetters.page).toHaveBeenCalledWith(1);

    dataTableProps.resetParams?.();
    expect(querySetters.q).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: /common.retry/u }));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['workspace-users', 'ws-123'],
    });
  });
});
