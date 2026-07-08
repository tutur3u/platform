import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteTransaction: vi.fn(),
  deleteWorkspaceStorageFolderByPath: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/transactions/transactionId/route', () => ({
  GET: vi.fn(),
  PUT: vi.fn(),
  deleteTransaction: (...args: Parameters<typeof mocks.deleteTransaction>) =>
    mocks.deleteTransaction(...args),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  },
  deleteWorkspaceStorageFolderByPath: (
    ...args: Parameters<typeof mocks.deleteWorkspaceStorageFolderByPath>
  ) => mocks.deleteWorkspaceStorageFolderByPath(...args),
}));

describe('workspace transaction detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.deleteWorkspaceStorageFolderByPath.mockResolvedValue({
      deleted: 1,
      provider: 'supabase',
    });
    mocks.deleteTransaction.mockImplementation(
      async (
        request: Request,
        context: {
          params: Promise<{
            transactionId: string;
            wsId: string;
          }>;
        },
        options: {
          onBeforeDeleteFiles: (input: {
            request: Request;
            transactionId: string;
            wsId: string;
          }) => Promise<void> | void;
        }
      ) => {
        const params = await context.params;
        await options.onBeforeDeleteFiles({
          request,
          transactionId: params.transactionId,
          wsId: params.wsId,
        });

        return Response.json({ message: 'success' });
      }
    );
  });

  it('deletes the transaction attachment folder during transaction deletion', async () => {
    const { DELETE } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/transactions/[transactionId]/route'
    );

    const response = await DELETE(
      new Request('http://localhost/api/workspaces/ws-1/transactions/tx-1', {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({
          transactionId: 'tx-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteWorkspaceStorageFolderByPath).toHaveBeenCalledWith(
      'ws-1',
      'finance/transactions',
      'tx-1'
    );
  });

  it('continues deleting when the transaction has no attachment folder', async () => {
    const { WorkspaceStorageError } = await import(
      '@tuturuuu/storage-core/workspace-storage-provider'
    );
    mocks.deleteWorkspaceStorageFolderByPath.mockRejectedValueOnce(
      new WorkspaceStorageError('Folder not found', 404)
    );

    const { DELETE } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/transactions/[transactionId]/route'
    );

    const response = await DELETE(
      new Request('http://localhost/api/workspaces/ws-1/transactions/tx-1', {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({
          transactionId: 'tx-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
  });
});
