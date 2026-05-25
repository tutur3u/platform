import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateTransactionAttachmentQueries } from './query-invalidation';

describe('transaction query invalidation', () => {
  it('invalidates attachment caches for the selected transaction', async () => {
    const queryClient = new QueryClient();
    const editFormAttachmentsKey = [
      'finance-transaction-attachments',
      'ws-1',
      'txn-1',
      null,
      20,
    ];
    const billAttachmentsKey = [
      'finance-transaction-bill-attachments',
      'ws-1',
      'txn-1',
      100,
    ];
    const signedUrlKey = [
      'finance-transaction-attachment-url',
      'ws-1',
      'finance/transactions/txn-1/receipt.pdf',
    ];
    const textPreviewKey = [
      'finance-transaction-attachment-text',
      'ws-1',
      'finance/transactions/txn-1/receipt.txt',
      'https://storage.example/receipt.txt',
    ];
    const legacyTextPreviewKey = [
      'finance-transaction-attachment-text',
      'https://storage.example/legacy-receipt.txt',
    ];
    const otherTransactionKey = [
      'finance-transaction-bill-attachments',
      'ws-1',
      'txn-2',
      100,
    ];
    const otherWorkspaceKey = [
      'finance-transaction-bill-attachments',
      'ws-2',
      'txn-1',
      100,
    ];
    const otherWorkspaceTextPreviewKey = [
      'finance-transaction-attachment-text',
      'ws-2',
      'finance/transactions/txn-1/receipt.txt',
      'https://storage.example/other-workspace-receipt.txt',
    ];

    for (const key of [
      editFormAttachmentsKey,
      billAttachmentsKey,
      signedUrlKey,
      textPreviewKey,
      legacyTextPreviewKey,
      otherTransactionKey,
      otherWorkspaceKey,
      otherWorkspaceTextPreviewKey,
    ]) {
      queryClient.setQueryData(key, true);
    }

    await invalidateTransactionAttachmentQueries(queryClient, 'ws-1', 'txn-1');

    expect(
      queryClient.getQueryState(editFormAttachmentsKey)?.isInvalidated
    ).toBe(true);
    expect(queryClient.getQueryState(billAttachmentsKey)?.isInvalidated).toBe(
      true
    );
    expect(queryClient.getQueryState(signedUrlKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(textPreviewKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(legacyTextPreviewKey)?.isInvalidated).toBe(
      true
    );
    expect(queryClient.getQueryState(otherTransactionKey)?.isInvalidated).toBe(
      false
    );
    expect(queryClient.getQueryState(otherWorkspaceKey)?.isInvalidated).toBe(
      false
    );
    expect(
      queryClient.getQueryState(otherWorkspaceTextPreviewKey)?.isInvalidated
    ).toBe(false);
  });
});
