'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, RefreshCw } from '@tuturuuu/icons';
import {
  repairWorkspaceUserPlatformLinks,
  type WorkspaceUserPlatformLinkRepairResponse,
} from '@tuturuuu/internal-api/users';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PlatformLinkRepairResults } from './platform-link-repair-results';

interface PlatformLinkRepairDialogProps {
  wsId: string;
}

export function PlatformLinkRepairDialog({
  wsId,
}: PlatformLinkRepairDialogProps) {
  const t = useTranslations('ws-users');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [result, setResult] =
    useState<WorkspaceUserPlatformLinkRepairResponse | null>(null);

  const repairMutation = useMutation({
    mutationFn: () => repairWorkspaceUserPlatformLinks(wsId),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({
        queryKey: ['workspace-users', wsId],
      });

      if (data.linked.length > 0) {
        toast.success(t('platform_link_repair_success'), {
          description: t('platform_link_repair_result_summary', {
            linked: data.summary.linked,
            skipped: data.summary.skipped,
          }),
        });
      } else {
        toast.info(t('platform_link_repair_no_links'), {
          description: t('platform_link_repair_result_summary', {
            linked: data.summary.linked,
            skipped: data.summary.skipped,
          }),
        });
      }
    },
    onError: (error) => {
      toast.error(t('platform_link_repair_failed'), {
        description:
          error instanceof Error
            ? error.message
            : t('platform_link_repair_failed_description'),
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          repairMutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Link2 className="mr-2 h-4 w-4" />
          {t('platform_link_repair_open')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('platform_link_repair_title')}</DialogTitle>
          <DialogDescription>
            {t('platform_link_repair_description')}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <>
            <Separator />
            <PlatformLinkRepairResults result={result} />
          </>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={repairMutation.isPending}
          >
            {t('platform_link_repair_close')}
          </Button>
          <Button
            onClick={() => {
              setResult(null);
              repairMutation.mutate();
            }}
            disabled={repairMutation.isPending}
          >
            {repairMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('platform_link_repair_running')}
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('platform_link_repair_run')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
