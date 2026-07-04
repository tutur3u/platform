import {
  deleteTransaction,
  GET as handleTransactionGET,
  PUT as handleTransactionPUT,
} from '@tuturuuu/apis/finance/transactions/transactionId/route';
import { joinPath } from '@tuturuuu/utils/path-helper';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';
import {
  deleteWorkspaceStorageFolderByPath,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

type Params = {
  params: Promise<{
    transactionId: string;
    wsId: string;
  }>;
};

export async function GET(request: Request, context: Params) {
  return handleTransactionGET(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

export async function PUT(request: Request, context: Params) {
  return handleTransactionPUT(
    request,
    context,
    await resolveFinanceRouteAuthContext(request)
  );
}

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

export async function DELETE(request: Request, context: Params) {
  return deleteTransaction(request, context, {
    authContext: await resolveFinanceRouteAuthContext(request),
    onBeforeDeleteFiles: ({ transactionId, wsId }) =>
      deleteTransactionFiles(wsId, transactionId),
  });
}
