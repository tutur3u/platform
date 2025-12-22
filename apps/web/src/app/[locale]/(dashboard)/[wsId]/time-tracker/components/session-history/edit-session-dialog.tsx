'use client';

import { AlertTriangle } from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { TimeValidationResult } from '@/lib/time-validation';
import { validateEndTime, validateStartTime } from '@/lib/time-validation';
import type { SessionWithRelations } from '../../types';
import { TaskCombobox } from '../task-combobox';
import { useWorkspaceTasks } from '../use-workspace-tasks';
import type { EditFormState } from './session-types';
import {
  getCategoryColor,
  isDatetimeMoreThanThresholdAgo,
  isSessionOlderThanThreshold,
} from './session-utils';
import { useSessionActions } from './use-session-actions';

dayjs.extend(utc);
dayjs.extend(timezone);

interface EditSessionDialogProps {
  session: SessionWithRelations | null;
  formState: EditFormState;
  onFormChange: <K extends keyof EditFormState>(
    key: K,
    value: EditFormState[K]
  ) => void;
  onSave: () => void;
  onClose: () => void;
  isEditing: boolean;
  isLoadingThreshold: boolean;
  thresholdDays: number | null | undefined;
  categories: TimeTrackingCategory[] | null;
}

export function EditSessionDialog({
  session,
  formState,
  onFormChange,
  onSave,
  onClose,
  isEditing,
  isLoadingThreshold,
  thresholdDays,
  categories,
}: EditSessionDialogProps) {
  const t = useTranslations('time-tracker.session_history');
  const userTimezone = dayjs.tz.guess();

  // Fetch tasks on-demand only when dialog is open
  const { data: tasks, isLoading: isLoadingTasks } = useWorkspaceTasks({
    wsId: session?.ws_id || null,
    enabled: !!session,
  });

  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  const { getValidationErrorMessage } = useSessionActions({
    wsId: session?.ws_id || '',
  });

  const isOlderThanThreshold = session
    ? isSessionOlderThanThreshold(session, thresholdDays)
    : false;

  const hasUnsavedChanges = useMemo(() => {
    if (!session) return false;

    const titleChanged = formState.title !== (session.title || '');
    const descriptionChanged =
      formState.description !== (session.description || '');
    const categoryChanged =
      formState.categoryId !== (session.category_id || 'none');
    const taskChanged = formState.taskId !== (session.task_id || 'none');

    // Convert session times to local format YYYY-MM-DDTHH:mm to compare with formState
    const userTz = dayjs.tz.guess();
    const sessionStartLocal = dayjs
      .utc(session.start_time)
      .tz(userTz)
      .format('YYYY-MM-DDTHH:mm');
    const sessionEndLocal = session.end_time
      ? dayjs.utc(session.end_time).tz(userTz).format('YYYY-MM-DDTHH:mm')
      : '';

    const startTimeChanged = formState.startTime !== sessionStartLocal;
    const endTimeChanged = formState.endTime !== sessionEndLocal;

    return (
      titleChanged ||
      descriptionChanged ||
      categoryChanged ||
      taskChanged ||
      startTimeChanged ||
      endTimeChanged
    );
  }, [session, formState]);

  const isStartTimeInvalid =
    formState.startTime &&
    isDatetimeMoreThanThresholdAgo(
      formState.startTime,
      userTimezone,
      thresholdDays
    );

  // Validate datetime fields
  useEffect(() => {
    const errors: Record<string, string> = {};

    // Only validate if editing is allowed (not older than threshold)
    if (session && !session.is_running && !isOlderThanThreshold) {
      let startValidation: TimeValidationResult = { isValid: true };
      let endValidation: TimeValidationResult = { isValid: true };

      // Validate start time
      if (formState.startTime) {
        startValidation = validateStartTime(formState.startTime);
        if (!startValidation.isValid) {
          errors.startTime = getValidationErrorMessage(startValidation);
        }
      }

      // Validate end time
      if (formState.endTime) {
        endValidation = validateEndTime(formState.endTime);
        if (!endValidation.isValid) {
          errors.endTime = getValidationErrorMessage(endValidation);
        }
      }

      // Only validate time range specific errors (skip individual time validations)
      if (
        formState.startTime &&
        formState.endTime &&
        startValidation.isValid &&
        endValidation.isValid
      ) {
        const startTime = dayjs(formState.startTime);
        const endTime = dayjs(formState.endTime);

        if (endTime.isBefore(startTime)) {
          errors.timeRange = getValidationErrorMessage({
            isValid: false,
            errorCode: 'END_BEFORE_START',
          });
        } else if (endTime.diff(startTime, 'minutes') < 1) {
          errors.timeRange = getValidationErrorMessage({
            isValid: false,
            errorCode: 'DURATION_TOO_SHORT',
          });
        }
      }
    }

    setValidationErrors(errors);
  }, [formState.startTime, formState.endTime, session, isOlderThanThreshold]);

  return (
    <Dialog open={!!session} onOpenChange={() => onClose()}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => {
          if (hasUnsavedChanges) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          if (hasUnsavedChanges) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (hasUnsavedChanges) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('edit_session_title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-title">{t('session_title')}</Label>
            <Input
              id="edit-title"
              value={formState.title}
              onChange={(e) => onFormChange('title', e.target.value)}
              placeholder={t('session_title_placeholder')}
            />
          </div>
          <div>
            <Label htmlFor="edit-description">{t('description')}</Label>
            <Textarea
              id="edit-description"
              value={formState.description}
              onChange={(e) => onFormChange('description', e.target.value)}
              placeholder={t('optional_description')}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="edit-category">{t('category')}</Label>
              <Select
                value={formState.categoryId}
                onValueChange={(value) => onFormChange('categoryId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('select_category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('no_category')}</SelectItem>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-3 w-3 rounded-full',
                            getCategoryColor(category.color || 'BLUE')
                          )}
                        />
                        {category.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-task">{t('select_task')}</Label>
              <TaskCombobox
                id="edit-task"
                value={formState.taskId}
                onValueChange={(taskId) => onFormChange('taskId', taskId)}
                tasks={tasks}
                isLoading={isLoadingTasks}
              />
            </div>
          </div>
          {session &&
            !session.is_running &&
            (isOlderThanThreshold ? (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/50">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium text-sm">
                    {t('time_editing_restricted')}
                  </span>
                </div>
                <p className="mt-2 text-orange-600 text-sm dark:text-orange-400">
                  {thresholdDays === 0
                    ? t('all_edits_require_approval', {
                        date: dayjs
                          .utc(session.start_time)
                          .tz(userTimezone)
                          .format('MMM D, YYYY'),
                      })
                    : t('cannot_edit_old_session', {
                        days: thresholdDays ?? 0,
                        dayLabel:
                          (thresholdDays ?? 0) === 1
                            ? t('day_singular')
                            : t('day_plural'),
                        date: dayjs
                          .utc(session.start_time)
                          .tz(userTimezone)
                          .format('MMM D, YYYY'),
                      })}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="edit-start-time">{t('start_time')}</Label>
                    <Input
                      id="edit-start-time"
                      type="datetime-local"
                      value={formState.startTime}
                      onChange={(e) =>
                        onFormChange('startTime', e.target.value)
                      }
                      className={cn(
                        !!validationErrors.startTime && 'border-dynamic-red'
                      )}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-end-time">{t('end_time')}</Label>
                    <Input
                      id="edit-end-time"
                      type="datetime-local"
                      value={formState.endTime}
                      onChange={(e) => onFormChange('endTime', e.target.value)}
                      className={cn(
                        !!validationErrors.endTime && 'border-dynamic-red'
                      )}
                    />
                  </div>
                </div>
                {Object.keys(validationErrors).length > 0 && (
                  <div
                    className="rounded-lg bg-dynamic-red/10 p-3"
                    aria-live="polite"
                  >
                    {Object.values(validationErrors).map((error, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-dynamic-red text-sm"
                      >
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Warning about the threshold limit */}
                {isStartTimeInvalid && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
                    <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="text-xs">
                        <p className="font-medium">
                          {t('cannot_backdate', {
                            days: thresholdDays ?? 1,
                            dayLabel:
                              (thresholdDays ?? 1) === 1
                                ? t('day_singular')
                                : t('day_plural'),
                          })}
                        </p>
                        <p className="mt-1 text-amber-600 dark:text-amber-400">
                          {t('start_times_within_limit', {
                            days: thresholdDays ?? 1,
                            dayLabel:
                              (thresholdDays ?? 1) === 1
                                ? t('day_singular')
                                : t('day_plural'),
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ))}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              {t('cancel')}
            </Button>
            <Button
              onClick={onSave}
              disabled={
                isEditing ||
                isLoadingThreshold ||
                !formState.title.trim() ||
                Boolean(
                  session &&
                    !isOlderThanThreshold &&
                    formState.startTime &&
                    isStartTimeInvalid
                ) ||
                Object.keys(validationErrors).length > 0
              }
              className="flex-1"
            >
              {isEditing ? t('saving') : t('save_changes')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
