'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, CalendarPlus } from '@tuturuuu/icons';
import {
  type CreateWorkspaceUserGroupSessionPayload,
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
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { FrequencyUpdateConfirmation } from './frequency-update-confirmation';
import {
  buildFrequencySeriesOptions,
  buildFrequencyUpdatePayload,
  buildFrequencyUpdatePreview,
  createFrequencyUpdateDraft,
  type FrequencyUpdateDraft,
} from './frequency-update-utils';
import { QuickWeeklyScheduleConfirmation } from './quick-weekly-schedule-confirmation';
import {
  buildQuickWeeklySchedulePayload,
  buildQuickWeeklySchedulePreview,
  createQuickWeeklyScheduleDraft,
} from './quick-weekly-schedule-utils';
import {
  ScheduleSetupEditor,
  type ScheduleSetupMode,
} from './schedule-setup-editor';
import { SESSION_EDITOR_DAYS } from './session-editor-utils';

interface ScheduleSetupDialogProps {
  canChooseGroup: boolean;
  defaultGroupId?: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  isPending?: boolean;
  onCreate: (payload: CreateWorkspaceUserGroupSessionPayload) => unknown;
  trigger?: ReactNode;
  wsId: string;
}

export function ScheduleSetupDialog({
  canChooseGroup,
  defaultGroupId,
  groups,
  isPending,
  onCreate,
  trigger,
  wsId,
}: ScheduleSetupDialogProps) {
  const t = useTranslations('ws-user-group-schedule');
  const commonT = useTranslations('common');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const fallbackGroupId = groups[0]?.id ?? '';
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [mode, setMode] = useState<ScheduleSetupMode>('create');
  const [groupId, setGroupId] = useState(defaultGroupId ?? fallbackGroupId);
  const [initializedGroupId, setInitializedGroupId] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const [updateDraft, setUpdateDraft] = useState<FrequencyUpdateDraft | null>(
    null
  );
  const [createDraft, setCreateDraft] = useState(() =>
    createQuickWeeklyScheduleDraft()
  );

  useEffect(() => {
    if (!open) return;
    setGroupId(defaultGroupId ?? fallbackGroupId);
    setInitializedGroupId('');
    setReviewing(false);
    setCreateDraft(createQuickWeeklyScheduleDraft());
  }, [defaultGroupId, fallbackGroupId, open]);

  const scheduleQuery = useQuery({
    enabled: open && !!groupId,
    queryKey: ['workspace-user-group-schedule-setup', wsId, groupId],
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
    if (!open || !scheduleQuery.isSuccess || initializedGroupId === groupId)
      return;
    const firstSeries = seriesOptions[0];
    setSeriesId(firstSeries?.id ?? '');
    setUpdateDraft(
      firstSeries ? createFrequencyUpdateDraft(firstSeries) : null
    );
    setMode(firstSeries ? 'update' : 'create');
    setReviewing(false);
    setInitializedGroupId(groupId);
  }, [
    groupId,
    initializedGroupId,
    open,
    scheduleQuery.isSuccess,
    seriesOptions,
  ]);

  const createPreview = useMemo(
    () => buildQuickWeeklySchedulePreview(createDraft, locale),
    [createDraft, locale]
  );
  const updatePreview = useMemo(
    () =>
      selectedSeries && updateDraft
        ? buildFrequencyUpdatePreview(selectedSeries, updateDraft, locale)
        : null,
    [locale, selectedSeries, updateDraft]
  );
  const updateChangeCount = updatePreview
    ? updatePreview.added.length +
      updatePreview.adjusted.length +
      updatePreview.removed.length
    : 0;
  const selectedGroup = groups.find((group) => group.id === groupId);
  const selectedDays = SESSION_EDITOR_DAYS.filter((day) =>
    createDraft.daysOfWeek.includes(day.value)
  )
    .map((day) => commonT(day.labelKey))
    .join(', ');

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSeries || !updateDraft)
        throw new Error('Missing schedule selection');
      return updateWorkspaceUserGroupSession(
        wsId,
        selectedSeries.firstSession.id,
        buildFrequencyUpdatePayload(updateDraft, selectedSeries)
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
      toast.success(
        t('frequency_update_success', { count: updateChangeCount })
      );
      setOpen(false);
    },
  });

  const canReview =
    !scheduleQuery.isLoading &&
    !scheduleQuery.isError &&
    (mode === 'create'
      ? !!groupId && createPreview.count > 0
      : !!selectedSeries && !!updateDraft && updateChangeCount > 0);
  const submitting = !!isPending || updateMutation.isPending;

  const submit = async () => {
    if (mode === 'update') {
      updateMutation.mutate();
      return;
    }
    if (!groupId || createPreview.count === 0) return;
    await onCreate(
      buildQuickWeeklySchedulePayload({
        draft: createDraft,
        groupId,
        groupName: selectedGroup?.name,
      })
    );
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            className="w-full sm:w-auto"
            disabled={isPending}
            size="sm"
            variant="outline"
          >
            <CalendarClock className="h-4 w-4" />
            {t('schedule_setup')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-h-[92dvh] sm:max-w-4xl">
        <DialogHeader className="border-b px-4 py-4 text-left sm:px-6">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span
              className={!reviewing ? 'font-medium text-foreground' : undefined}
            >
              {t('schedule_setup_step_details')}
            </span>
            <span aria-hidden="true">/</span>
            <span
              className={reviewing ? 'font-medium text-foreground' : undefined}
            >
              {t('schedule_setup_step_review')}
            </span>
          </div>
          <DialogTitle className="text-xl sm:text-2xl">
            {t('schedule_setup')}
          </DialogTitle>
          <DialogDescription className="max-w-2xl text-pretty">
            {reviewing
              ? mode === 'update'
                ? t('frequency_review_description')
                : t('quick_weekly_confirm_description')
              : t('schedule_setup_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {reviewing &&
          mode === 'update' &&
          selectedSeries &&
          updateDraft &&
          updatePreview ? (
            <FrequencyUpdateConfirmation
              draft={updateDraft}
              option={selectedSeries}
              preview={updatePreview}
            />
          ) : reviewing && mode === 'create' ? (
            <QuickWeeklyScheduleConfirmation
              draft={createDraft}
              preview={createPreview}
              selectedDays={selectedDays}
              selectedGroupName={selectedGroup?.name}
            />
          ) : (
            <ScheduleSetupEditor
              canChooseGroup={canChooseGroup}
              createDraft={createDraft}
              groupId={groupId}
              groups={groups}
              isError={scheduleQuery.isError}
              isLoading={scheduleQuery.isLoading}
              mode={mode}
              onCreateDraftChange={setCreateDraft}
              onGroupChange={(value) => {
                setGroupId(value);
                setInitializedGroupId('');
                setReviewing(false);
              }}
              onModeChange={(value) => {
                setMode(value);
                setReviewing(false);
              }}
              onRetry={() => void scheduleQuery.refetch()}
              onSeriesChange={(value) => {
                const option = seriesOptions.find(
                  (candidate) => candidate.id === value
                );
                setSeriesId(value);
                setUpdateDraft(
                  option ? createFrequencyUpdateDraft(option) : null
                );
                setReviewing(false);
              }}
              onUpdateDraftChange={setUpdateDraft}
              selectedSeriesId={selectedSeries?.id ?? ''}
              seriesOptions={seriesOptions}
              updateDraft={updateDraft}
            />
          )}
          {!reviewing &&
            mode === 'update' &&
            updateDraft &&
            updateChangeCount === 0 && (
              <p className="mt-3 rounded-lg border bg-muted/20 px-3 py-2 text-muted-foreground text-sm">
                {t('frequency_no_changes')}
              </p>
            )}
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:flex-row sm:px-6">
          {reviewing ? (
            <>
              <Button
                className="w-full sm:w-auto"
                disabled={submitting}
                variant="outline"
                onClick={() => setReviewing(false)}
              >
                {t('quick_weekly_back')}
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={!canReview || submitting}
                onClick={submit}
              >
                {mode === 'update' ? (
                  <CalendarDays className="h-4 w-4" />
                ) : (
                  <CalendarPlus className="h-4 w-4" />
                )}
                {mode === 'update'
                  ? t('frequency_apply_changes', { count: updateChangeCount })
                  : t('quick_weekly_create')}
              </Button>
            </>
          ) : (
            <>
              <Button
                className="w-full sm:w-auto"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                {commonT('cancel')}
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={!canReview || submitting}
                onClick={() => setReviewing(true)}
              >
                <CalendarDays className="h-4 w-4" />
                {mode === 'update'
                  ? t('frequency_review_changes')
                  : t('quick_weekly_review')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
