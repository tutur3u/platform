import {
  deleteWorkspaceStorageObjectByPath,
  getWorkspaceStorageObjectMetadataForProvider,
  listWorkspaceStorageRawObjectsForProvider,
  resolveWorkspaceStorageProvider,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { getFinanceTransactionIdFromStoragePath } from './finance-transaction-storage-access';

export const FINANCE_TRANSACTION_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
export const FINANCE_TRANSACTION_ATTACHMENT_MAX_FILES = 10;

type FinanceTransactionAttachmentValidationResult =
  | { ok: true }
  | { ok: false; message: string; status: number };

function getFinanceTransactionAttachmentPrefix(path: string) {
  const transactionId = getFinanceTransactionIdFromStoragePath(path);
  return transactionId ? `finance/transactions/${transactionId}` : null;
}

function validateFinanceTransactionAttachmentSize(
  size: number | undefined
): FinanceTransactionAttachmentValidationResult {
  if (size === undefined || !Number.isFinite(size) || !Number.isInteger(size)) {
    return {
      ok: false,
      message: 'A valid file size is required',
      status: 400,
    };
  }

  if (size <= 0) {
    return {
      ok: false,
      message: 'File is empty',
      status: 400,
    };
  }

  if (size > FINANCE_TRANSACTION_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      message: 'Finance attachment exceeds 50 MB limit',
      status: 413,
    };
  }

  return { ok: true };
}

async function countFinanceTransactionAttachments({
  path,
  wsId,
}: {
  path: string;
  wsId: string;
}) {
  const pathPrefix = getFinanceTransactionAttachmentPrefix(path);

  if (!pathPrefix) {
    return null;
  }

  const { provider } = await resolveWorkspaceStorageProvider(wsId);
  const objects = await listWorkspaceStorageRawObjectsForProvider(
    wsId,
    provider,
    {
      limit: FINANCE_TRANSACTION_ATTACHMENT_MAX_FILES + 1,
      pathPrefix,
    }
  );

  return objects.filter((object) => !object.isFolderPlaceholder).length;
}

function validateFinanceTransactionAttachmentCount(
  count: number
): FinanceTransactionAttachmentValidationResult {
  if (count >= FINANCE_TRANSACTION_ATTACHMENT_MAX_FILES) {
    return {
      ok: false,
      message: 'Finance transaction attachment limit reached',
      status: 409,
    };
  }

  return { ok: true };
}

export async function validateFinanceTransactionAttachmentUploadRequest({
  path,
  size,
  wsId,
}: {
  path: string;
  size?: number;
  wsId: string;
}): Promise<FinanceTransactionAttachmentValidationResult> {
  if (!getFinanceTransactionAttachmentPrefix(path)) {
    return { ok: true };
  }

  const sizeValidation = validateFinanceTransactionAttachmentSize(size);
  if (!sizeValidation.ok) {
    return sizeValidation;
  }

  const attachmentCount = await countFinanceTransactionAttachments({
    path,
    wsId,
  });

  return attachmentCount === null
    ? { ok: true }
    : validateFinanceTransactionAttachmentCount(attachmentCount);
}

export async function validateFinalizedFinanceTransactionAttachment({
  path,
  wsId,
}: {
  path: string;
  wsId: string;
}): Promise<FinanceTransactionAttachmentValidationResult> {
  if (!getFinanceTransactionAttachmentPrefix(path)) {
    return { ok: true };
  }

  const { provider } = await resolveWorkspaceStorageProvider(wsId);
  const metadata = await getWorkspaceStorageObjectMetadataForProvider(
    wsId,
    provider,
    path
  );
  const sizeValidation = validateFinanceTransactionAttachmentSize(
    metadata.size
  );

  if (!sizeValidation.ok) {
    await deleteWorkspaceStorageObjectByPath(wsId, path);
    return sizeValidation;
  }

  const attachmentCount = await countFinanceTransactionAttachments({
    path,
    wsId,
  });
  const countValidation =
    attachmentCount === null
      ? { ok: true as const }
      : attachmentCount > FINANCE_TRANSACTION_ATTACHMENT_MAX_FILES
        ? {
            ok: false as const,
            message: 'Finance transaction attachment limit reached',
            status: 409,
          }
        : { ok: true as const };

  if (!countValidation.ok) {
    await deleteWorkspaceStorageObjectByPath(wsId, path);
  }

  return countValidation;
}
