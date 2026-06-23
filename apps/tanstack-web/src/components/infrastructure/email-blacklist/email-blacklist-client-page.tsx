'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VisibilityState } from '@tanstack/react-table';
import { Loader2 } from '@tuturuuu/icons';
import type {
  BackendInfrastructureEmailBlacklistEntry,
  BackendInfrastructureEmailBlacklistEntryType,
} from '@tuturuuu/internal-api/backend';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { getEmailBlacklistColumns } from './columns';
import EmailBlacklistFilters from './filters';
import EmailBlacklistForm, {
  type EmailBlacklistCreateValues,
  type EmailBlacklistUpdateValues,
} from './form';
import { emailBlacklistQueryKey } from './query-keys';

export type EmailBlacklistActionResult =
  | { ok: true; message?: string }
  | { code?: string; message: string; ok: false; status?: number };

export type EmailBlacklistClientPageProps = {
  count: number;
  createEntry: (
    values: EmailBlacklistCreateValues
  ) => Promise<EmailBlacklistActionResult>;
  data: BackendInfrastructureEmailBlacklistEntry[];
  deleteEntry: (entryId: string) => Promise<EmailBlacklistActionResult>;
  page: number;
  pageSize: number;
  q: string;
  type: BackendInfrastructureEmailBlacklistEntryType | '';
  updateEntry: (
    entryId: string,
    values: EmailBlacklistUpdateValues
  ) => Promise<EmailBlacklistActionResult>;
  workspaceId: string;
};

const DEFAULT_VISIBILITY: VisibilityState = {
  added_by: false,
  created_at: false,
  id: false,
  updated_at: false,
};

function assertActionResult(result: EmailBlacklistActionResult) {
  if (!result.ok) {
    throw new Error(result.message);
  }

  return result;
}

function getErrorDescription(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function EmailBlacklistClientPage({
  count,
  createEntry,
  data,
  deleteEntry,
  page,
  pageSize,
  q,
  type,
  updateEntry,
  workspaceId,
}: EmailBlacklistClientPageProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();
  const queryKey = useMemo(
    () => emailBlacklistQueryKey(workspaceId),
    [workspaceId]
  );

  const refreshRouteData = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
    router.refresh();
  }, [queryClient, queryKey, router]);

  const createMutation = useMutation({
    mutationFn: async (values: EmailBlacklistCreateValues) =>
      assertActionResult(await createEntry(values)),
    onError: (error) => {
      toast.error(t('email-blacklist.error'), {
        description: getErrorDescription(
          error,
          t('email-blacklist.operation-failed')
        ),
      });
    },
    onSuccess: async (result) => {
      toast.success(t('email-blacklist.entry-created'), {
        description:
          result.message || t('email-blacklist.entry-created-description'),
      });
      await refreshRouteData();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      entryId,
      values,
    }: {
      entryId: string;
      values: EmailBlacklistUpdateValues;
    }) => assertActionResult(await updateEntry(entryId, values)),
    onError: (error) => {
      toast.error(t('email-blacklist.error'), {
        description: getErrorDescription(
          error,
          t('email-blacklist.operation-failed')
        ),
      });
    },
    onSuccess: async (result) => {
      toast.success(t('email-blacklist.entry-updated'), {
        description:
          result.message || t('email-blacklist.entry-updated-description'),
      });
      await refreshRouteData();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) =>
      assertActionResult(await deleteEntry(entryId)),
    onError: (error) => {
      toast.error(t('email-blacklist.delete-failed'), {
        description: getErrorDescription(
          error,
          t('email-blacklist.delete-error')
        ),
      });
    },
    onSuccess: async (result) => {
      toast.success(t('email-blacklist.entry-deleted'), {
        description: result.message,
      });
      await refreshRouteData();
    },
  });

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const handleCreate = useCallback(
    async (values: EmailBlacklistCreateValues) => {
      await createMutation.mutateAsync(values);
    },
    [createMutation]
  );

  const handleUpdate = useCallback(
    async (entryId: string, values: EmailBlacklistUpdateValues) => {
      await updateMutation.mutateAsync({ entryId, values });
    },
    [updateMutation]
  );

  const handleDelete = useCallback(
    async (entryId: string) => {
      await deleteMutation.mutateAsync(entryId);
    },
    [deleteMutation]
  );

  return (
    <div className="relative">
      {isMutating ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md border bg-background/90 px-4 py-2 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-muted-foreground text-sm">
              {t('common.saving')}
            </span>
          </div>
        </div>
      ) : null}

      <FeatureSummary
        createDescription={t('email-blacklist.create_description')}
        createTitle={t('email-blacklist.create')}
        description={t('email-blacklist.description')}
        form={
          <EmailBlacklistForm
            isPending={createMutation.isPending}
            onCreate={handleCreate}
          />
        }
        pluralTitle={t('email-blacklist.plural')}
        singularTitle={t('email-blacklist.singular')}
      />
      <Separator className="my-4" />
      <CustomDataTable
        columnGenerator={getEmailBlacklistColumns}
        count={count}
        data={data}
        defaultQuery={q}
        defaultVisibility={DEFAULT_VISIBILITY}
        extraData={{
          isDeleting: deleteMutation.isPending,
          isMutating,
          onDelete: handleDelete,
          onUpdate: handleUpdate,
        }}
        filters={<EmailBlacklistFilters type={type} />}
        namespace="email-blacklist-data-table"
        pageIndex={Math.max(page - 1, 0)}
        pageSize={pageSize}
      />
    </div>
  );
}
