'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  cloneTopicScheduleMonth,
  type TopicScheduleCloneItem,
} from '@tuturuuu/internal-api/topic-announcements';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { shiftScheduleMonth } from '@tuturuuu/utils/topic-schedule';
import { useLocale, useTranslations } from 'next-intl';
import { ScheduleClonePreview } from './schedule-clone-preview';
import { formatScheduleMonth } from './schedule-format';
import { topicScheduleQueryKey } from './use-schedule-editor';

/**
 * "Clone from previous month": previews the mapping (same nth weekday) and
 * commits it. The server recomputes the plan on commit and skips slots that
 * already exist, so retrying or cloning twice never duplicates sessions.
 */
export function ScheduleCloneDialog({
  disabled,
  month,
  onOpenChange,
  open,
  wsId,
}: {
  disabled: boolean;
  month: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const sourceMonth = shiftScheduleMonth(month, -1);
  const request = { sourceMonth, targetMonth: month };

  const previewKey = ['topic-schedule-clone-preview', wsId, month] as const;
  const preview = useQuery({
    enabled: open && !disabled,
    gcTime: 0,
    queryFn: () => cloneTopicScheduleMonth(wsId, { ...request, dryRun: true }),
    queryKey: previewKey,
    staleTime: 0,
  });
  const handleOpenChange = (next: boolean) => {
    if (!next) queryClient.removeQueries({ queryKey: previewKey });
    onOpenChange(next);
  };
  const commit = useMutation({
    mutationFn: () =>
      cloneTopicScheduleMonth(wsId, { ...request, dryRun: false }),
    onError: () => toast.error(t('schedule_clone_failed')),
    onSuccess: async ({ data }) => {
      toast.success(t('schedule_cloned', { count: data.createdIds.length }));
      await queryClient.invalidateQueries({
        queryKey: topicScheduleQueryKey(wsId, month),
      });
      handleOpenChange(false);
    },
  });

  const items: TopicScheduleCloneItem[] = preview.data?.data.items ?? [];
  const createCount = items.filter((item) => item.status === 'create').length;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('schedule_clone_title', {
              source: formatScheduleMonth(sourceMonth, locale),
              target: formatScheduleMonth(month, locale),
            })}
          </DialogTitle>
          <DialogDescription>
            {t('schedule_clone_description')}
          </DialogDescription>
        </DialogHeader>

        {disabled ? (
          <p className="rounded-md border border-dynamic-orange/30 bg-dynamic-orange/5 p-3 text-sm">
            {t('schedule_clone_unsaved')}
          </p>
        ) : preview.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('schedule_clone_loading')}
          </div>
        ) : preview.isError ? (
          <div className="flex items-center justify-between rounded-md border border-dynamic-red/30 p-3 text-sm">
            {t('schedule_clone_failed')}
            <Button
              onClick={() => preview.refetch()}
              size="sm"
              variant="outline"
            >
              {t('schedule_retry')}
            </Button>
          </div>
        ) : (
          <ScheduleClonePreview items={items} />
        )}

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} variant="ghost">
            {t('schedule_cancel')}
          </Button>
          <Button
            className="gap-2"
            disabled={
              disabled ||
              createCount === 0 ||
              commit.isPending ||
              preview.isLoading
            }
            onClick={() => commit.mutate()}
          >
            {commit.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {t('schedule_clone_confirm', { count: createCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
