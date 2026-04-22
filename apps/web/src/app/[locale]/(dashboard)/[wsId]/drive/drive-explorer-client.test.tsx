import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriveExplorerClient from './drive-explorer-client';

const {
  deleteWorkspaceStorageFolderMock,
  deleteWorkspaceStorageObjectsMock,
  invalidateDriveQueriesMock,
  queryState,
  setQueryStateMock,
  useWorkspaceStorageAnalyticsQueryMock,
  useWorkspaceStorageDirectoryQueryMock,
} = vi.hoisted(() => ({
  deleteWorkspaceStorageFolderMock: vi.fn(),
  deleteWorkspaceStorageObjectsMock: vi.fn(),
  invalidateDriveQueriesMock: vi.fn(),
  queryState: {
    path: '',
    q: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
    view: 'list',
  },
  setQueryStateMock: vi.fn(),
  useWorkspaceStorageAnalyticsQueryMock: vi.fn(),
  useWorkspaceStorageDirectoryQueryMock: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('nuqs', () => ({
  parseAsInteger: {
    withDefault() {
      return this;
    },
    withOptions() {
      return this;
    },
  },
  parseAsString: {
    withDefault() {
      return this;
    },
    withOptions() {
      return this;
    },
  },
  parseAsStringLiteral: () => ({
    withDefault() {
      return this;
    },
    withOptions() {
      return this;
    },
  }),
  useQueryStates: () => [queryState, setQueryStateMock],
}));

vi.mock('@tuturuuu/internal-api', () => ({
  deleteWorkspaceStorageFolder: (
    ...args: Parameters<typeof deleteWorkspaceStorageFolderMock>
  ) => deleteWorkspaceStorageFolderMock(...args),
  deleteWorkspaceStorageObjects: (
    ...args: Parameters<typeof deleteWorkspaceStorageObjectsMock>
  ) => deleteWorkspaceStorageObjectsMock(...args),
}));

vi.mock('./use-drive-queries', () => ({
  useInvalidateDriveQueries: () => invalidateDriveQueriesMock,
  useWorkspaceStorageAnalyticsQuery: (
    ...args: Parameters<typeof useWorkspaceStorageAnalyticsQueryMock>
  ) => useWorkspaceStorageAnalyticsQueryMock(...args),
  useWorkspaceStorageDirectoryQuery: (
    ...args: Parameters<typeof useWorkspaceStorageDirectoryQueryMock>
  ) => useWorkspaceStorageDirectoryQueryMock(...args),
}));

vi.mock('./breadcrumbs', () => ({
  default: ({
    path,
    onNavigate,
    onNavigateUp,
  }: {
    path: string;
    onNavigate: (path: string) => void;
    onNavigateUp?: () => void;
  }) => (
    <div data-testid="breadcrumbs">
      <button onClick={() => onNavigate(path)} type="button">
        breadcrumb-navigate
      </button>
      {onNavigateUp ? (
        <button onClick={onNavigateUp} type="button">
          go_back
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('./new-actions', () => ({
  default: () => <div data-testid="new-actions" />,
}));

vi.mock('./export-links-dialog', () => ({
  WorkspaceStorageExportLinksButton: () => <div data-testid="export-links" />,
}));

vi.mock('./file-preview-dialog', () => ({
  FilePreviewDialog: () => null,
}));

vi.mock('./rename-storage-object-dialog', () => ({
  RenameStorageObjectDialog: () => null,
}));

vi.mock('./drive-explorer-views', () => ({
  DriveLoadingState: () => <div data-testid="drive-loading" />,
  DriveErrorState: ({ onRetry }: { onRetry: () => void }) => (
    <button data-testid="drive-error" onClick={onRetry} type="button">
      retry
    </button>
  ),
  DriveEmptyState: ({
    hasSearch,
    hasPath,
    onResetSearch,
  }: {
    hasSearch: boolean;
    hasPath: boolean;
    onResetSearch: () => void;
  }) => (
    <button
      data-testid={`drive-empty-${hasSearch ? 'search' : hasPath ? 'folder' : 'root'}`}
      onClick={onResetSearch}
      type="button"
    >
      empty
    </button>
  ),
  DriveGridView: ({
    items,
    onNavigate,
    onRequestDelete,
    onSelectAll,
    onToggleSelection,
    selectedKeys,
  }: {
    items: Array<{ name?: string }>;
    onNavigate: (name: string) => void;
    onRequestDelete: (item: { name?: string }) => void;
    onSelectAll?: (checked: boolean) => void;
    onToggleSelection?: (
      item: { id?: string; name?: string },
      checked: boolean
    ) => void;
    selectedKeys?: string[];
  }) => (
    <div data-testid="drive-grid">
      <button onClick={() => onSelectAll?.(true)} type="button">
        select-all-grid
      </button>
      <button
        onClick={() =>
          onToggleSelection?.(
            items[0] as { id?: string; name?: string },
            !selectedKeys?.length
          )
        }
        type="button"
      >
        toggle-grid
      </button>
      <button onClick={() => onNavigate(items[0]?.name || '')} type="button">
        navigate-grid
      </button>
      <button
        onClick={() => onRequestDelete(items[0] as { name?: string })}
        type="button"
      >
        delete-grid
      </button>
    </div>
  ),
  DriveListView: ({
    items,
    onNavigate,
    onSelectAll,
    onToggleSelection,
    selectedKeys,
  }: {
    items: Array<{ name?: string }>;
    onNavigate: (name: string) => void;
    onSelectAll?: (checked: boolean) => void;
    onToggleSelection?: (
      item: { id?: string; name?: string },
      checked: boolean
    ) => void;
    selectedKeys?: string[];
  }) => (
    <div data-testid="drive-list">
      <button onClick={() => onSelectAll?.(true)} type="button">
        select-all-list
      </button>
      <button
        onClick={() =>
          onToggleSelection?.(
            items[0] as { id?: string; name?: string },
            !selectedKeys?.length
          )
        }
        type="button"
      >
        toggle-list
      </button>
      <button onClick={() => onNavigate(items[0]?.name || '')} type="button">
        navigate-list
      </button>
    </div>
  ),
}));

function renderWithQueryClient(node: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
  );
}

describe('DriveExplorerClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState.path = '';
    queryState.q = '';
    queryState.sortBy = 'created_at';
    queryState.sortOrder = 'desc';
    queryState.view = 'list';

    useWorkspaceStorageDirectoryQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'file-1',
            name: 'demo.txt',
            metadata: { size: 20 },
          },
        ],
        total: 1,
      },
      isPending: false,
      isFetching: false,
      isFetchingNextPage: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    useWorkspaceStorageAnalyticsQueryMock.mockReturnValue({
      data: {
        totalSize: 20,
        fileCount: 1,
        storageLimit: 100,
        usagePercentage: 20,
        largestFile: null,
        smallestFile: null,
      },
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });

    invalidateDriveQueriesMock.mockResolvedValue(undefined);
    deleteWorkspaceStorageObjectsMock.mockResolvedValue(undefined);
  });

  it('renders loading and error states from Drive queries', async () => {
    useWorkspaceStorageDirectoryQueryMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isFetching: false,
      isFetchingNextPage: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const { rerender } = renderWithQueryClient(
      <DriveExplorerClient wsId="ws-1" />
    );

    expect(screen.getByTestId('drive-loading')).toBeInTheDocument();

    const refetchMock = vi.fn();
    useWorkspaceStorageDirectoryQueryMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isFetching: false,
      isFetchingNextPage: false,
      isError: true,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: refetchMock,
    });

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <DriveExplorerClient wsId="ws-1" />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByTestId('drive-error'));
    expect(refetchMock).toHaveBeenCalled();
  });

  it('defaults to list view and keeps the summary compact until expanded', () => {
    renderWithQueryClient(<DriveExplorerClient wsId="ws-1" />);

    expect(screen.getByTestId('drive-list')).toBeInTheDocument();
    expect(screen.queryByTestId('drive-grid')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'summary_expand',
      })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', {
        name: 'summary_collapse',
      })
    ).not.toBeInTheDocument();
  });

  it('shows a back button for nested folders and navigates to the parent path', () => {
    queryState.path = 'assets/reports';

    renderWithQueryClient(<DriveExplorerClient wsId="ws-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'go_back' }));

    expect(setQueryStateMock).toHaveBeenCalledWith({
      path: 'assets',
    });
  });

  it('loads more items on demand instead of using page buttons', () => {
    const fetchNextPageMock = vi.fn();

    useWorkspaceStorageDirectoryQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'file-1',
            name: 'demo.txt',
            metadata: { size: 20 },
          },
        ],
        total: 10,
      },
      isPending: false,
      isFetching: false,
      isFetchingNextPage: false,
      isError: false,
      hasNextPage: true,
      fetchNextPage: fetchNextPageMock,
      refetch: vi.fn(),
    });

    renderWithQueryClient(<DriveExplorerClient wsId="ws-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'load_more' }));

    expect(fetchNextPageMock).toHaveBeenCalled();
    expect(screen.queryByText('previous_page')).not.toBeInTheDocument();
    expect(screen.queryByText('next_page')).not.toBeInTheDocument();
    expect(screen.queryByText('24 per page')).not.toBeInTheDocument();
  });

  it('switches between root, folder, and search empty states', () => {
    useWorkspaceStorageDirectoryQueryMock.mockReturnValue({
      data: {
        items: [],
        total: 0,
      },
      isPending: false,
      isFetching: false,
      isFetchingNextPage: false,
      isError: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const { rerender } = renderWithQueryClient(
      <DriveExplorerClient wsId="ws-1" />
    );

    expect(screen.getByTestId('drive-empty-root')).toBeInTheDocument();

    queryState.path = 'design';
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <DriveExplorerClient wsId="ws-1" />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('drive-empty-folder')).toBeInTheDocument();

    queryState.q = 'logo';
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <DriveExplorerClient wsId="ws-1" />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('drive-empty-search')).toBeInTheDocument();
  });

  it('updates URL state for search, view mode, and folder navigation', () => {
    renderWithQueryClient(<DriveExplorerClient wsId="ws-1" />);

    fireEvent.change(screen.getByPlaceholderText('search_placeholder'), {
      target: { value: 'roadmap' },
    });
    fireEvent.click(screen.getByText('grid_view'));
    fireEvent.click(screen.getByText('navigate-list'));

    expect(setQueryStateMock).toHaveBeenCalledWith({
      q: 'roadmap',
    });
    expect(setQueryStateMock).toHaveBeenCalledWith({
      view: 'grid',
    });
    expect(setQueryStateMock).toHaveBeenCalledWith({
      path: 'demo.txt',
    });
  });

  it('deletes a file and invalidates Drive queries', async () => {
    queryState.view = 'grid';

    renderWithQueryClient(<DriveExplorerClient wsId="ws-1" />);

    fireEvent.click(screen.getByText('delete-grid'));

    await waitFor(() => {
      const deleteButton = screen
        .getAllByRole('button')
        .find((button) => button.textContent?.includes('delete'));

      expect(deleteButton).toBeTruthy();
      fireEvent.click(deleteButton as HTMLElement);
    });

    await waitFor(() => {
      expect(deleteWorkspaceStorageObjectsMock).toHaveBeenCalledWith(
        'ws-1',
        ['demo.txt'],
        { fetch }
      );
    });

    await waitFor(() => {
      expect(invalidateDriveQueriesMock).toHaveBeenCalled();
    });
  });

  it('supports bulk selecting visible items and deleting them together', async () => {
    renderWithQueryClient(<DriveExplorerClient wsId="ws-1" />);

    fireEvent.click(screen.getByText('toggle-list'));

    expect(
      screen.getByText('bulk_selection_count:{"count":1}')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('bulk_delete_action'));

    await waitFor(() => {
      const deleteButton = screen
        .getAllByRole('button')
        .find((button) => button.textContent?.includes('delete'));

      expect(deleteButton).toBeTruthy();
      fireEvent.click(deleteButton as HTMLElement);
    });

    await waitFor(() => {
      expect(deleteWorkspaceStorageObjectsMock).toHaveBeenCalledWith(
        'ws-1',
        ['demo.txt'],
        { fetch }
      );
    });
  });
});
