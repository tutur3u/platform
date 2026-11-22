import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriveExplorerClient from './drive-explorer-client';

const mocks = vi.hoisted(() => ({
  analytics: vi.fn(),
  deleteFolder: vi.fn(),
  deleteObjects: vi.fn(),
  directory: vi.fn(),
  invalidate: vi.fn(),
  queryState: {} as Record<string, unknown>,
  setQueryState: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useFormatter: () => ({ dateTime: () => 'date' }),
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('nuqs', () => {
  const parser = {
    withDefault() {
      return this;
    },
    withOptions() {
      return this;
    },
  };
  return {
    parseAsString: parser,
    parseAsStringLiteral: () => parser,
    useQueryStates: () => [mocks.queryState, mocks.setQueryState],
  };
});

vi.mock('@tuturuuu/internal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api')>()),
  deleteWorkspaceStorageFolder: mocks.deleteFolder,
  deleteWorkspaceStorageObjects: mocks.deleteObjects,
}));

vi.mock('./use-drive-queries', () => ({
  useInvalidateDriveQueries: () => mocks.invalidate,
  useWorkspaceStorageAnalyticsQuery: mocks.analytics,
  useWorkspaceStorageDirectoryQuery: mocks.directory,
}));

vi.mock('./drive-grid-thumbnail', () => ({ DriveGridThumbnail: () => null }));
vi.mock('./export-links-dialog', () => ({
  WorkspaceStorageExportLinksDialog: () => null,
}));

const file = {
  id: 'f1',
  name: '123e4567-e89b-12d3-a456-426614174000-hero.png',
  metadata: { size: 2048 },
};
const folder = { name: 'Logos' };

function directory(overrides: Record<string, unknown> = {}) {
  return {
    data: { items: [folder, file], total: 2 },
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    status: 'success',
    ...overrides,
  };
}

function renderExplorer(access: 'manage' | 'denied' = 'manage') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DriveExplorerClient access={access} wsId="ws-1" />
    </QueryClientProvider>
  );
}

describe('DriveExplorerClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.queryState, {
      path: '',
      q: '',
      sortBy: 'created_at',
      sortOrder: 'desc',
      type: null,
      view: 'grid',
    });
    mocks.directory.mockReturnValue(directory());
    mocks.analytics.mockReturnValue({
      data: { storageLimit: 100, totalSize: 10, usagePercentage: 10 },
      refetch: vi.fn(),
      status: 'success',
    });
    mocks.deleteObjects.mockResolvedValue({});
  });

  it('renders folders and files in separate sections', () => {
    renderExplorer();
    expect(
      screen.getByRole('heading', { name: 'sections.folders' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'sections.files' })
    ).toBeInTheDocument();
    expect(screen.getByText('hero.png')).toBeInTheDocument();
  });

  it('shows a geometry-matched skeleton while loading', () => {
    mocks.directory.mockReturnValue(
      directory({ data: undefined, status: 'pending' })
    );
    renderExplorer();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('offers a retry on a failed first load', () => {
    const refetch = vi.fn();
    mocks.directory.mockReturnValue(
      directory({
        data: undefined,
        error: new Error('x'),
        refetch,
        status: 'error',
      })
    );
    renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: 'states.retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('explains a missing permission and disables write controls', () => {
    mocks.directory.mockReturnValue(
      directory({
        data: undefined,
        error: new InternalApiError('Forbidden', 403),
        status: 'error',
      })
    );
    renderExplorer('denied');
    expect(screen.getByRole('alert')).toHaveTextContent('denied.title');
    expect(
      screen.getByRole('button', { name: 'actions.upload' })
    ).toBeDisabled();
  });

  it('distinguishes an empty root from no search results', () => {
    mocks.directory.mockReturnValue(
      directory({ data: { items: [], total: 0 } })
    );
    const { unmount } = renderExplorer();
    expect(screen.getByText('states.empty_root_title')).toBeInTheDocument();
    unmount();

    mocks.queryState.q = 'invoice';
    renderExplorer();
    expect(
      screen.getByText('states.no_results_query:{"query":"invoice"}')
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'states.clear_filters' })
    );
    expect(mocks.setQueryState).toHaveBeenCalledWith({ q: null, type: null });
  });

  it('filters loaded files by the type chip and says the search scope', () => {
    mocks.queryState.type = 'pdf';
    renderExplorer();
    expect(screen.queryByText('hero.png')).not.toBeInTheDocument();
    expect(screen.getByText('Logos')).toBeInTheDocument();
    expect(
      screen.getByText('search.scope:{"folder":"files"}')
    ).toBeInTheDocument();
  });

  it('selects only the files a type chip leaves visible', () => {
    mocks.queryState.type = 'pdf';
    mocks.queryState.view = 'list';
    mocks.directory.mockReturnValue(
      directory({
        data: {
          items: [file, { id: 'f2', name: 'guide.pdf', metadata: { size: 1 } }],
          total: 2,
        },
      })
    );
    renderExplorer();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'selection.select_all' })
    );
    expect(screen.getByText('selection.count:{"count":1}')).toBeInTheDocument();
  });

  it('opens the selection bar and deletes forever after confirmation', async () => {
    renderExplorer();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'selection.select_item:{"name":"hero.png"}',
      })
    );
    expect(
      screen.getByRole('toolbar', { name: 'selection.toolbar' })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'actions.delete_forever' })
    );
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(
        (button) => button.textContent === 'actions.delete_forever'
      ) as HTMLButtonElement
    );

    await waitFor(() =>
      expect(mocks.deleteObjects).toHaveBeenCalledWith(
        'ws-1',
        ['123e4567-e89b-12d3-a456-426614174000-hero.png'],
        expect.anything()
      )
    );
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it('switches to the list view through the URL state', () => {
    renderExplorer();
    fireEvent.click(screen.getByRole('radio', { name: 'filters.list' }));
    expect(mocks.setQueryState).toHaveBeenCalledWith({ view: 'list' });
  });

  it('warns when storage is nearly full', () => {
    mocks.analytics.mockReturnValue({
      data: { storageLimit: 100, totalSize: 95, usagePercentage: 95 },
      refetch: vi.fn(),
      status: 'success',
    });
    renderExplorer();
    expect(screen.getByText('storage.almost_full_banner')).toBeInTheDocument();
  });
});
