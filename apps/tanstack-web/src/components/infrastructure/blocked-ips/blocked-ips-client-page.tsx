'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { VisibilityState } from '@tanstack/react-table';
import { Loader2 } from '@tuturuuu/icons';
import type {
  BlockBlockedIpPayload,
  BlockedIpEntry,
  BlockedIpStatus,
  UnblockBlockedIpPayload,
} from '@tuturuuu/internal-api/infrastructure';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { getBlockedIpsColumns } from './columns';
import BlockedIpFilters from './filters';
import BlockedIpForm, { type BlockedIpFormValues } from './form';
import { blockedIpsQueryKey } from './query-keys';

export type BlockedIpActionResult =
  | { message?: string; ok: true }
  | { code?: string; message: string; ok: false; status?: number };

export type BlockedIpsClientPageProps = {
  blockEntry: (values: BlockBlockedIpPayload) => Promise<BlockedIpActionResult>;
  count: number;
  data: BlockedIpEntry[];
  page: number;
  pageSize: number;
  q: string;
  status: BlockedIpStatus | '';
  unblockEntry: (
    values: UnblockBlockedIpPayload
  ) => Promise<BlockedIpActionResult>;
  workspaceId: string;
};

const DEFAULT_VISIBILITY: VisibilityState = {
  created_at: false,
  id: false,
  metadata: false,
  updated_at: false,
};

function assertActionResult(result: BlockedIpActionResult) {
  if (!result.ok) {
    throw new Error(result.message);
  }

  return result;
}

function getErrorDescription(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function BlockedIpsClientPage({
  blockEntry,
  count,
  data,
  page,
  pageSize,
  q,
  status,
  unblockEntry,
  workspaceId,
}: BlockedIpsClientPageProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();
  const queryKey = useMemo(
    () => blockedIpsQueryKey(workspaceId),
    [workspaceId]
  );

  const refreshRouteData = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
    await router.invalidate();
  }, [queryClient, queryKey, router]);

  const blockMutation = useMutation({
    mutationFn: async (values: BlockedIpFormValues) =>
      assertActionResult(await blockEntry(values)),
    onError: (error) => {
      toast.error(t('blocked-ips.error_blocking_ip'), {
        description: getErrorDescription(error, t('blocked-ips.network-error')),
      });
    },
    onSuccess: async (result) => {
      toast.success(t('blocked-ips.ip_blocked_success'), {
        description: result.message,
      });
      await refreshRouteData();
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async (values: UnblockBlockedIpPayload) =>
      assertActionResult(await unblockEntry(values)),
    onError: (error) => {
      toast.error(t('blocked-ips.unblock-failed'), {
        description: getErrorDescription(error, t('blocked-ips.network-error')),
      });
    },
    onSuccess: async (result) => {
      toast.success(t('blocked-ips.ip-unblocked'), {
        description: result.message,
      });
      await refreshRouteData();
    },
  });

  const isMutating = blockMutation.isPending || unblockMutation.isPending;

  const handleBlock = useCallback(
    async (values: BlockedIpFormValues) => {
      await blockMutation.mutateAsync(values);
    },
    [blockMutation]
  );

  const handleUnblock = useCallback(
    async (values: UnblockBlockedIpPayload) => {
      await unblockMutation.mutateAsync(values);
    },
    [unblockMutation]
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
        createDescription={t('blocked-ips.add_blocked_ip_description')}
        createTitle={t('blocked-ips.add_blocked_ip')}
        description={t('blocked-ips.description')}
        form={
          <BlockedIpForm
            isPending={blockMutation.isPending}
            onCreate={handleBlock}
          />
        }
        pluralTitle={t('blocked-ips.plural')}
        singularTitle={t('blocked-ips.add_blocked_ip_title')}
      />
      <Separator className="my-4" />
      <CustomDataTable
        columnGenerator={getBlockedIpsColumns}
        count={count}
        data={data}
        defaultQuery={q}
        defaultVisibility={DEFAULT_VISIBILITY}
        extraData={{
          isUnblocking: unblockMutation.isPending,
          onUnblock: handleUnblock,
        }}
        filters={<BlockedIpFilters status={status} />}
        namespace="blocked-ips-data-table"
        pageIndex={Math.max(page - 1, 0)}
        pageSize={pageSize}
      />
    </div>
  );
}
