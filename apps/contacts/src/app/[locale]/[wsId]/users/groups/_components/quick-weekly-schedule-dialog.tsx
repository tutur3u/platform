'use client';

import { CalendarDays, CalendarPlus } from '@tuturuuu/icons';
import type {
  CreateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupScheduleGroup,
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
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QuickWeeklyScheduleConfirmation } from './quick-weekly-schedule-confirmation';
import { QuickWeeklyScheduleFields } from './quick-weekly-schedule-fields';
import {
  buildQuickWeeklySchedulePayload,
  buildQuickWeeklySchedulePreview,
  createQuickWeeklyScheduleDraft,
} from './quick-weekly-schedule-utils';
import { SESSION_EDITOR_DAYS } from './session-editor-utils';

interface QuickWeeklyScheduleDialogProps {
  canChooseGroup: boolean;
  defaultGroupId?: string;
  groups: WorkspaceUserGroupScheduleGroup[];
  isPending?: boolean;
  onSubmit: (
    payload: CreateWorkspaceUserGroupSessionPayload
  ) => Promise<void> | void;
  trigger?: ReactNode;
}

export function QuickWeeklyScheduleDialog({
  canChooseGroup,
  defaultGroupId,
  groups,
  isPending,
  onSubmit,
  trigger,
}: QuickWeeklyScheduleDialogProps) {
  const t = useTranslations('ws-user-group-schedule');
  const commonT = useTranslations('common');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? '');
  const [draft, setDraft] = useState(() => createQuickWeeklyScheduleDraft());

  useEffect(() => {
    if (!open) return;

    setConfirming(false);
    setGroupId(defaultGroupId ?? groups[0]?.id ?? '');
    setDraft(createQuickWeeklyScheduleDraft());
  }, [defaultGroupId, groups, open]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === groupId),
    [groupId, groups]
  );
  const preview = useMemo(
    () => buildQuickWeeklySchedulePreview(draft, locale),
    [draft, locale]
  );
  const selectedDays = SESSION_EDITOR_DAYS.filter((day) =>
    draft.daysOfWeek.includes(day.value)
  )
    .map((day) => commonT(day.labelKey))
    .join(', ');
  const canPreview = !!groupId && preview.count > 0 && !isPending;

  const submit = async () => {
    if (!groupId || preview.count === 0) return;

    await onSubmit(
      buildQuickWeeklySchedulePayload({
        draft,
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
          <Button disabled={isPending} size="sm" variant="outline">
            <CalendarPlus className="h-4 w-4" />
            {t('quick_weekly_setup')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('quick_weekly_setup')}</DialogTitle>
          <DialogDescription>
            {confirming
              ? t('quick_weekly_confirm_description')
              : t('quick_weekly_setup_description')}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <QuickWeeklyScheduleConfirmation
            draft={draft}
            preview={preview}
            selectedDays={selectedDays}
            selectedGroupName={selectedGroup?.name}
          />
        ) : (
          <QuickWeeklyScheduleFields
            canChooseGroup={canChooseGroup}
            draft={draft}
            groupId={groupId}
            groups={groups}
            setDraft={setDraft}
            setGroupId={setGroupId}
          />
        )}

        <DialogFooter>
          {confirming ? (
            <>
              <Button
                disabled={isPending}
                type="button"
                variant="outline"
                onClick={() => setConfirming(false)}
              >
                {t('quick_weekly_back')}
              </Button>
              <Button disabled={!canPreview} type="button" onClick={submit}>
                <CalendarPlus className="h-4 w-4" />
                {t('quick_weekly_create')}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {commonT('cancel')}
              </Button>
              <Button
                disabled={!canPreview}
                type="button"
                onClick={() => setConfirming(true)}
              >
                <CalendarDays className="h-4 w-4" />
                {t('quick_weekly_review')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
