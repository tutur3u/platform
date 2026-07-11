'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backfillWorkspaceUserStatusChanges } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface Props {
  wsId: string;
}

const PREVIEW_LIMIT = 50;

export function AuditLogBackfillDialogContent({ wsId }: Props) {
  const t = useTranslations('audit-log-insights');
  const queryClient = useQueryClient();
  const router = useRouter();
  const previewQuery = useQuery({
    queryKey: ['workspace-user-audit-backfill-preview', wsId],
    queryFn: () =>
      backfillWorkspaceUserStatusChanges(wsId, {
        dryRun: true,
        limit: PREVIEW_LIMIT,
      }),
  });

  const repairMutation = useMutation({
    mutationFn: () =>
      backfillWorkspaceUserStatusChanges(wsId, {
        dryRun: false,
        limit: PREVIEW_LIMIT,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['workspace-user-audit-backfill-preview', wsId],
      });
      router.refresh();
    },
  });

  const previewRows = previewQuery.data?.rows ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('repair_button')}</DialogTitle>
        <DialogDescription>{t('repair_description')}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
          <p className="font-medium">{t('repair_preview_title')}</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {previewQuery.isLoading
              ? t('repair_loading')
              : t('repair_preview_count', {
                  count: previewQuery.data?.count ?? 0,
                })}
          </p>
        </div>

        <Separator />

        <div className="max-h-80 space-y-3 overflow-y-auto">
          {previewRows.length > 0 ? (
            previewRows.map((row) => (
              <div
                key={row.audit_record_version_id}
                className="rounded-2xl border border-border/60 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">
                    {t(`repair_event_kind.${row.event_kind}`)}
                  </p>
                  <span className="text-muted-foreground text-xs">
                    #{row.audit_record_version_id}
                  </span>
                </div>
                <p className="mt-2 text-muted-foreground text-sm">
                  {t('repair_preview_row', {
                    userId: row.user_id,
                    source: row.source,
                  })}
                </p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              {previewQuery.isLoading
                ? t('repair_loading')
                : t('repair_preview_empty')}
            </p>
          )}
        </div>
      </div>

      <DialogFooter className="justify-between">
        <DialogClose asChild>
          <Button variant="secondary" type="button">
            {t('repair_close')}
          </Button>
        </DialogClose>
        <Button
          onClick={() => repairMutation.mutate()}
          disabled={
            repairMutation.isPending ||
            previewQuery.isLoading ||
            (previewQuery.data?.count ?? 0) === 0
          }
        >
          {repairMutation.isPending ? t('repair_running') : t('repair_confirm')}
        </Button>
      </DialogFooter>
    </>
  );
}
