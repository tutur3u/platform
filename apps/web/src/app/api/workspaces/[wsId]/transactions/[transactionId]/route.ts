import {
  deleteTransaction,
  GET,
  PUT,
} from '@tuturuuu/apis/finance/transactions/transactionId/route';
import { joinPath } from '@tuturuuu/utils/path-helper';
import {
  deleteWorkspaceStorageFolderByPath,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

export { GET, PUT };

async function deleteTransactionFiles(wsId: string, transactionId: string) {
  try {
    await deleteWorkspaceStorageFolderByPath(
      wsId,
      joinPath('finance', 'transactions'),
      transactionId
    );
  } catch (error) {
    if (error instanceof WorkspaceStorageError && error.status === 404) {
      return;
    }

    throw error;
  }
}

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      transactionId: string;
      wsId: string;
    }>;
  }
) {
  return deleteTransaction(request, context, {
    onBeforeDeleteFiles: ({ transactionId, wsId }) =>
      deleteTransactionFiles(wsId, transactionId),
  });
}
