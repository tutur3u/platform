import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  listWorkspaceStorageRawObjectsForProvider: vi.fn(),
  resolveWorkspaceStorageProvider: vi.fn(),
}));

vi.mock('./workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: mocks.deleteWorkspaceStorageObjectByPath,
  getWorkspaceStorageObjectMetadataForProvider:
    mocks.getWorkspaceStorageObjectMetadataForProvider,
  listWorkspaceStorageRawObjectsForProvider:
    mocks.listWorkspaceStorageRawObjectsForProvider,
  resolveWorkspaceStorageProvider: mocks.resolveWorkspaceStorageProvider,
}));

function storageObjects(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    fullPath: `ws-1/finance/transactions/tx-1/file-${index}.pdf`,
    isFolderPlaceholder: false,
    path: `finance/transactions/tx-1/file-${index}.pdf`,
    size: 1024,
  }));
}

describe('finance transaction storage limits', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.resolveWorkspaceStorageProvider.mockResolvedValue({
      provider: 'supabase',
    });
    mocks.listWorkspaceStorageRawObjectsForProvider.mockResolvedValue(
      storageObjects(0)
    );
    mocks.getWorkspaceStorageObjectMetadataForProvider.mockResolvedValue({
      contentType: 'application/pdf',
      fullPath: 'ws-1/finance/transactions/tx-1/receipt.pdf',
      path: 'finance/transactions/tx-1/receipt.pdf',
      provider: 'supabase',
      size: 1024,
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    mocks.deleteWorkspaceStorageObjectByPath.mockResolvedValue({
      provider: 'supabase',
    });
  });

  it('ignores non-finance storage paths', async () => {
    const { validateFinanceTransactionAttachmentUploadRequest } = await import(
      './finance-transaction-storage-limits'
    );

    await expect(
      validateFinanceTransactionAttachmentUploadRequest({
        path: 'documents/receipt.pdf',
        size: 100 * 1024 * 1024,
        wsId: 'ws-1',
      })
    ).resolves.toEqual({ ok: true });
    expect(mocks.resolveWorkspaceStorageProvider).not.toHaveBeenCalled();
  });

  it('rejects declared finance attachment uploads over 50 MB before signing', async () => {
    const {
      FINANCE_TRANSACTION_ATTACHMENT_MAX_BYTES,
      validateFinanceTransactionAttachmentUploadRequest,
    } = await import('./finance-transaction-storage-limits');

    await expect(
      validateFinanceTransactionAttachmentUploadRequest({
        path: 'finance/transactions/tx-1',
        size: FINANCE_TRANSACTION_ATTACHMENT_MAX_BYTES + 1,
        wsId: 'ws-1',
      })
    ).resolves.toEqual({
      message: 'Finance attachment exceeds 50 MB limit',
      ok: false,
      status: 413,
    });
    expect(mocks.resolveWorkspaceStorageProvider).not.toHaveBeenCalled();
  });

  it('rejects finance upload signing when the transaction already has 10 attachments', async () => {
    mocks.listWorkspaceStorageRawObjectsForProvider.mockResolvedValue(
      storageObjects(10)
    );

    const { validateFinanceTransactionAttachmentUploadRequest } = await import(
      './finance-transaction-storage-limits'
    );

    await expect(
      validateFinanceTransactionAttachmentUploadRequest({
        path: 'finance/transactions/tx-1',
        size: 1024,
        wsId: 'ws-1',
      })
    ).resolves.toEqual({
      message: 'Finance transaction attachment limit reached',
      ok: false,
      status: 409,
    });
  });

  it('deletes finalized finance attachments whose actual stored size exceeds 50 MB', async () => {
    const {
      FINANCE_TRANSACTION_ATTACHMENT_MAX_BYTES,
      validateFinalizedFinanceTransactionAttachment,
    } = await import('./finance-transaction-storage-limits');

    mocks.getWorkspaceStorageObjectMetadataForProvider.mockResolvedValue({
      contentType: 'application/pdf',
      fullPath: 'ws-1/finance/transactions/tx-1/receipt.pdf',
      path: 'finance/transactions/tx-1/receipt.pdf',
      provider: 'supabase',
      size: FINANCE_TRANSACTION_ATTACHMENT_MAX_BYTES + 1,
      updatedAt: '2026-06-03T00:00:00.000Z',
    });

    await expect(
      validateFinalizedFinanceTransactionAttachment({
        path: 'finance/transactions/tx-1/receipt.pdf',
        wsId: 'ws-1',
      })
    ).resolves.toEqual({
      message: 'Finance attachment exceeds 50 MB limit',
      ok: false,
      status: 413,
    });
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledWith(
      'ws-1',
      'finance/transactions/tx-1/receipt.pdf'
    );
  });

  it('deletes finalized finance attachments that exceed the transaction count limit', async () => {
    mocks.listWorkspaceStorageRawObjectsForProvider.mockResolvedValue(
      storageObjects(11)
    );

    const { validateFinalizedFinanceTransactionAttachment } = await import(
      './finance-transaction-storage-limits'
    );

    await expect(
      validateFinalizedFinanceTransactionAttachment({
        path: 'finance/transactions/tx-1/receipt.pdf',
        wsId: 'ws-1',
      })
    ).resolves.toEqual({
      message: 'Finance transaction attachment limit reached',
      ok: false,
      status: 409,
    });
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledWith(
      'ws-1',
      'finance/transactions/tx-1/receipt.pdf'
    );
  });
});
