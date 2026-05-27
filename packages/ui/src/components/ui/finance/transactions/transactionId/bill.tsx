'use client';

import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import {
  deleteWorkspaceStorageObjects,
  listWorkspaceStorageObjects,
  uploadWorkspaceStorageFile,
  type WorkspaceStorageListItem,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { joinPath } from '@tuturuuu/utils/path-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  type TransactionAttachmentDraft,
  type TransactionAttachmentStatus,
  TransactionAttachmentsField,
} from '../transaction-attachments-field';

interface Props {
  wsId: string;
  transactionId: string;
}

const TRANSACTION_BILL_OBJECT_PAGE_SIZE = 100;

export function Bill({ wsId, transactionId }: Props) {
  const t = useTranslations('transaction-data-table');
  const [attachments, setAttachments] = useState<TransactionAttachmentDraft[]>(
    []
  );

  const attachmentQuery = useInfiniteQuery({
    queryKey: [
      'finance-transaction-bill-attachments',
      wsId,
      transactionId,
      TRANSACTION_BILL_OBJECT_PAGE_SIZE,
    ],
    queryFn: async ({ pageParam }) =>
      listWorkspaceStorageObjects(wsId, {
        limit: TRANSACTION_BILL_OBJECT_PAGE_SIZE,
        offset: pageParam,
        path: getTransactionBillPath(transactionId),
        sortBy: 'created_at',
        sortOrder: 'desc',
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.pagination.offset + lastPage.pagination.limit;

      return nextOffset < lastPage.pagination.total ? nextOffset : undefined;
    },
  });

  const existingAttachments =
    attachmentQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const existingAttachmentsTotal =
    attachmentQuery.data?.pages.at(-1)?.pagination.total ??
    existingAttachments.length;

  const updateAttachmentStatus = (
    attachmentId: string,
    status: TransactionAttachmentStatus
  ) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId ? { ...attachment, status } : attachment
      )
    );
  };

  const updateAttachmentProgress = (attachmentId: string, progress: number) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId
          ? { ...attachment, progress }
          : attachment
      )
    );
  };

  const uploadAttachmentsMutation = useMutation({
    mutationFn: async (pendingAttachments: TransactionAttachmentDraft[]) => {
      return Promise.all(
        pendingAttachments.map(async (attachment) => {
          updateAttachmentStatus(attachment.id, 'uploading');
          updateAttachmentProgress(attachment.id, 0);

          const { error } = await uploadBill(
            wsId,
            transactionId,
            attachment.file,
            (progress) => updateAttachmentProgress(attachment.id, progress)
          );

          if (error) {
            updateAttachmentStatus(attachment.id, 'error');

            return {
              attachmentId: attachment.id,
              ok: false,
            };
          }

          updateAttachmentProgress(attachment.id, 100);
          updateAttachmentStatus(attachment.id, 'uploaded');

          return {
            attachmentId: attachment.id,
            ok: true,
          };
        })
      );
    },
    onSuccess: async (results) => {
      const uploadedAttachmentIds = new Set(
        results
          .filter((result) => result.ok)
          .map((result) => result.attachmentId)
      );
      const failedCount = results.length - uploadedAttachmentIds.size;

      if (uploadedAttachmentIds.size > 0) {
        await attachmentQuery.refetch();
        setAttachments((current) =>
          current.filter(
            (attachment) => !uploadedAttachmentIds.has(attachment.id)
          )
        );
      }

      if (failedCount > 0) {
        toast.error(t('attachment_upload_failed'));
        return;
      }

      if (uploadedAttachmentIds.size > 0) {
        toast.success(
          t('attachment_upload_success', {
            count: uploadedAttachmentIds.size,
          })
        );
      }
    },
    onError: () => {
      toast.error(t('attachment_upload_failed'));
    },
  });

  const removeExistingAttachmentMutation = useMutation({
    mutationFn: async (attachment: WorkspaceStorageListItem) => {
      await deleteWorkspaceStorageObjects(wsId, [
        joinPath(getTransactionBillPath(transactionId), attachment.name),
      ]);

      return attachment;
    },
    onSuccess: async () => {
      await attachmentQuery.refetch();
      toast.success(t('attachment_delete_success'));
    },
    onError: () => {
      toast.error(t('attachment_delete_failed'));
    },
  });

  const handleAttachmentsChange = (
    nextAttachments: TransactionAttachmentDraft[]
  ) => {
    const previousAttachmentIds = new Set(
      attachments.map((attachment) => attachment.id)
    );
    const newPendingAttachments = nextAttachments.filter(
      (attachment) =>
        attachment.status === 'pending' &&
        !previousAttachmentIds.has(attachment.id)
    );

    setAttachments(nextAttachments);

    if (newPendingAttachments.length > 0) {
      uploadAttachmentsMutation.mutate(newPendingAttachments);
    }
  };

  return (
    <TransactionAttachmentsField
      attachments={attachments}
      existingAttachments={existingAttachments}
      existingAttachmentsError={attachmentQuery.isError}
      existingAttachmentsHasMore={attachmentQuery.hasNextPage}
      existingAttachmentsLoading={attachmentQuery.isLoading}
      existingAttachmentsLoadingMore={attachmentQuery.isFetchingNextPage}
      existingAttachmentsRefreshing={
        attachmentQuery.isFetching && !attachmentQuery.isFetchingNextPage
      }
      existingAttachmentsTotal={existingAttachmentsTotal}
      onChange={handleAttachmentsChange}
      onLoadMoreExisting={() => void attachmentQuery.fetchNextPage()}
      onRefreshExisting={() => void attachmentQuery.refetch()}
      onRemoveExistingAttachment={async (attachment) => {
        await removeExistingAttachmentMutation.mutateAsync(attachment);
      }}
      removingExistingAttachmentName={
        removeExistingAttachmentMutation.isPending
          ? (removeExistingAttachmentMutation.variables?.name ?? null)
          : null
      }
      transactionId={transactionId}
      wsId={wsId}
    />
  );
}

export async function uploadBill(
  wsId: string,
  transactionId: string,
  file: globalThis.File,
  onUploadProgress?: (percent: number) => void
): Promise<{
  data: Awaited<ReturnType<typeof uploadWorkspaceStorageFile>> | null;
  error: unknown;
}> {
  const fileName = file.name;
  const existingObjects: WorkspaceStorageListItem[] = [];
  let offset = 0;
  let total = 0;

  do {
    const result = await listWorkspaceStorageObjects(wsId, {
      path: getTransactionBillPath(transactionId),
      limit: TRANSACTION_BILL_OBJECT_PAGE_SIZE,
      offset,
    });

    existingObjects.push(...result.data);
    offset = result.pagination.offset + result.pagination.limit;
    total = result.pagination.total;
  } while (offset < total);

  const newFileName = getUniqueBillFileName(fileName, existingObjects);

  try {
    const renamedFile =
      newFileName === file.name
        ? file
        : new globalThis.File([file], newFileName, {
            type: file.type,
          });

    const data = await uploadWorkspaceStorageFile(wsId, renamedFile, {
      onUploadProgress: (progress) => onUploadProgress?.(progress.percent),
      path: getTransactionBillPath(transactionId),
    });

    if (!data.finalize?.success) {
      throw new Error(
        data.finalize?.error || 'Failed to finalize uploaded file'
      );
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

function getTransactionBillPath(transactionId: string) {
  return joinPath('finance', 'transactions', transactionId);
}

function getUniqueBillFileName(
  fileName: string,
  existingObjects: WorkspaceStorageListItem[]
) {
  const existingNames = new Set(existingObjects.map((entry) => entry.name));

  if (!existingNames.has(fileName)) {
    return fileName;
  }

  const extensionIndex = fileName.lastIndexOf('.');
  const hasExtension = extensionIndex > 0;
  const baseName = hasExtension ? fileName.slice(0, extensionIndex) : fileName;
  const extension = hasExtension ? fileName.slice(extensionIndex) : '';
  const duplicatePattern = new RegExp(
    `^${escapeRegExp(baseName)}\\((\\d+)\\)${escapeRegExp(extension)}$`,
    'i'
  );
  const highestExistingIndex = existingObjects.reduce((highest, entry) => {
    const match = duplicatePattern.exec(entry.name);
    if (!match?.[1]) {
      return highest;
    }

    const index = Number.parseInt(match[1], 10);

    return Number.isFinite(index) ? Math.max(highest, index) : highest;
  }, 0);

  return `${baseName}(${highestExistingIndex + 1})${extension}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
