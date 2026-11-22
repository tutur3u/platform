import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveMoveDialog } from './drive-move-dialog';

const api = vi.hoisted(() => ({ list: vi.fn(), move: vi.fn() }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('@tuturuuu/internal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api')>()),
  listWorkspaceStorageObjects: api.list,
  moveWorkspaceStorageEntries: api.move,
}));

describe('DriveMoveDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockImplementation(
      async (_ws: string, query: { path?: string }) => ({
        data: query.path
          ? []
          : [{ name: 'docs' }, { name: 'archive' }, { id: 'f', name: 'x.png' }],
        pagination: { limit: 100, offset: 0, total: 3 },
      })
    );
    api.move.mockResolvedValue([
      {
        name: 'report.pdf',
        status: 'moved',
        totalFiles: 1,
        movedFiles: 1,
        movedMarkers: 0,
      },
    ]);
  });

  it('picks a destination folder and moves the entries there', async () => {
    const onMoved = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DriveMoveDialog
          items={[{ id: '1', name: 'report.pdf' }]}
          onMoved={onMoved}
          onOpenChange={vi.fn()}
          sourcePath=""
          wsId="ws-1"
        />
      </QueryClientProvider>
    );

    const confirmAtRoot = screen.getByRole('button', {
      name: 'move.confirm:{"folder":"files"}',
    });
    expect(confirmAtRoot).toBeDisabled();
    expect(screen.getByText('move.blocked_same')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'archive' }));
    expect(
      screen.queryByRole('button', { name: 'x.png' })
    ).not.toBeInTheDocument();
    expect(await screen.findByText('move.no_subfolders')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'move.confirm:{"folder":"archive"}' })
    );

    await waitFor(() =>
      expect(api.move).toHaveBeenCalledWith(
        'ws-1',
        {
          sourcePath: '',
          destinationPath: 'archive',
          entries: [{ name: 'report.pdf', isFolder: false }],
        },
        expect.anything()
      )
    );
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
  });
});

describe('getMoveFailureKey', () => {
  it('maps route codes and statuses to their messages', async () => {
    const { InternalApiError } = await import('@tuturuuu/internal-api');
    const { getMoveFailureKey } = await import('./drive-move-dialog');
    expect(
      getMoveFailureKey(new InternalApiError('x', 409, 'DRIVE_MOVE_CONFLICT'))
    ).toBe('failed_conflict');
    expect(getMoveFailureKey(new InternalApiError('too large', 413))).toBe(
      'failed_size'
    );
    expect(getMoveFailureKey(new InternalApiError('gone', 404))).toBe(
      'failed_missing'
    );
    expect(getMoveFailureKey(new Error('offline'))).toBe('failed');
  });
});
