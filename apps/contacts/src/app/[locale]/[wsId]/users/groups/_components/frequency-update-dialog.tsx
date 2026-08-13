'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Repeat } from '@tuturuuu/icons';
import {
  listWorkspaceUserGroupSessions,
  updateWorkspaceUserGroupSession,
  type WorkspaceUserGroupScheduleGroup,
} from '@tuturuuu/internal-api';
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
import { toast } from '@tuturuuu/ui/sonner';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { FrequencyUpdateConfirmation } from './frequency-update-confirmation';
import { FrequencyUpdateFields } from './frequency-update-fields';
import {
  buildFrequencySeriesOptions,
  buildFrequencyUpdatePayload,
  buildFrequencyUpdatePreview,
  createFrequencyUpdateDraft,
  type FrequencyUpdateDraft,
} from './frequency-update-utils';

interface FrequencyUpdateDialogProps {
  canChooseGroup: boolean;
  defaultGroupId?: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  wsId: string;
}

export function FrequencyUpdateDialog({
  canChooseGroup,
  defaultGroupId,
  groups,
  wsId,
}: FrequencyUpdateDialogProps) {
  const t = useTranslations('ws-user-group-schedule');
  const commonT = useTranslations('common');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? '');
  const [seriesId, setSeriesId] = useState('');
  const [draft, setDraft] = useState<FrequencyUpdateDraft | null>(null);

  useEffect(() => {
    if (!open) return;
    setReviewing(false);
    setGroupId(defaultGroupId ?? groups[0]?.id ?? '');
  }, [defaultGroupId, groups, open]);

  const scheduleQuery = useQuery({
    enabled: open && !!groupId,
    queryKey: ['workspace-user-group-frequency-preview', wsId, groupId],
    queryFn: () =>
      listWorkspaceUserGroupSessions(wsId, {
        from: dayjs().startOf('day').toISOString(),
        groupId,
      }),
    staleTime: 30_000,
  });
  const seriesOptions = useMemo(
    () => buildFrequencySeriesOptions(scheduleQuery.data?.data ?? []),
    [scheduleQuery.data?.data]
  );
  const selectedSeries = useMemo(
    () =>
      seriesOptions.find((option) => option.id === seriesId) ??
      seriesOptions[0],
    [seriesId, seriesOptions]
  );

  useEffect(() => {
    if (!selectedSeries) {
      setSeriesId('');
      setDraft(null);
      return;
    }
    setSeriesId(selectedSeries.id);
    setDraft(createFrequencyUpdateDraft(selectedSeries));
  }, [selectedSeries]);

  const preview = useMemo(
    () =>
      selectedSeries && draft
        ? buildFrequencyUpdatePreview(selectedSeries, draft, locale)
        : null,
    [draft, locale, selectedSeries]
  );
  const changeCount = preview
    ? preview.added.length + preview.adjusted.length + preview.removed.length
    : 0;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedSeries || !draft)
        throw new Error('Missing schedule selection');
      return updateWorkspaceUserGroupSession(
        wsId,
        selectedSeries.firstSession.id,
        buildFrequencyUpdatePayload(draft, selectedSeries)
      );
    },
    onError: () => toast.error(t('frequency_update_failed')),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['workspace-user-group-sessions', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['workspace-user-group-schedule-group-summaries', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['group-schedule', groupId],
        }),
      ]);
      toast.success(t('frequency_update_success', { count: changeCount }));
      setOpen(false);
    },
  });

  const canReview =
    !!draft && draft.daysOfWeek.length > 0 && !!preview && changeCount > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarDays className="h-4 w-4" />
          {t('frequency_update')}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('frequency_update')}</DialogTitle>
          <DialogDescription>
            {reviewing
              ? t('frequency_review_description')
              : t('frequency_update_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto py-1">
          {scheduleQuery.isLoading ? (
            <div className="rounded-xl border bg-muted/20 p-6 text-center text-muted-foreground text-sm">
              {t('frequency_loading')}
            </div>
          ) : scheduleQuery.isError ? (
            <div className="rounded-xl border border-dynamic-red/30 bg-dynamic-red/5 p-4 text-sm">
              {t('frequency_load_failed')}
            </div>
          ) : !selectedSeries ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <Repeat className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
              <p className="font-medium">
                {t('frequency_no_recurring_schedule')}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('frequency_no_recurring_schedule_description')}
              </p>
            </div>
          ) : reviewing && preview ? (
            <FrequencyUpdateConfirmation
              draft={draft!}
              option={selectedSeries}
              preview={preview}
            />
          ) : (
            <div className="space-y-3">
              <FrequencyUpdateFields
                canChooseGroup={canChooseGroup}
                draft={draft}
                groupId={groupId}
                groups={groups}
                onDraftChange={setDraft}
                onGroupChange={(value) => {
                  setGroupId(value);
                  setSeriesId('');
                  setReviewing(false);
                }}
                onSeriesChange={(value) => {
                  setSeriesId(value);
                  setReviewing(false);
                }}
                selectedSeriesId={selectedSeries.id}
                seriesOptions={seriesOptions}
              />
              {draft && changeCount === 0 && (
                <p className="rounded-lg border bg-muted/20 px-3 py-2 text-muted-foreground text-sm">
                  {t('frequency_no_changes')}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {reviewing ? (
            <>
              <Button
                disabled={mutation.isPending}
                variant="outline"
                onClick={() => setReviewing(false)}
              >
                {t('quick_weekly_back')}
              </Button>
              <Button
                disabled={mutation.isPending || changeCount === 0}
                onClick={() => mutation.mutate()}
              >
                <CalendarDays className="h-4 w-4" />
                {t('frequency_apply_changes', { count: changeCount })}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {commonT('cancel')}
              </Button>
              <Button disabled={!canReview} onClick={() => setReviewing(true)}>
                {t('frequency_review_changes')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
