import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceUsersTable } from './workspace-users-table';

const { dataTableMock, parser, queryState, useWorkspaceUsersMock } = vi.hoisted(
  () => {
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
  }
);

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('nuqs', () => ({
  parseAsArrayOf: () => parser,
  parseAsInteger: parser,
  parseAsString: parser,
  useQueryState: (key: string) => [queryState[key] ?? null, vi.fn()],
}));

vi.mock('@/hooks/use-user-config', () => ({
  useUserConfig: (_configId: string, defaultValue: string) => ({
    data: defaultValue,
    isLoading: false,
  }),
}));

vi.mock('./hooks', () => ({
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
  return render(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
  );
}

describe('WorkspaceUsersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      includedGroups: [],
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
});
