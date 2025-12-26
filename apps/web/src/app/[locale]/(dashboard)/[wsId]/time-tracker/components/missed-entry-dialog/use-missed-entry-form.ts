import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { validateEndTime, validateStartTime } from '@/lib/time-validation';
import { useImageUpload } from '../../hooks/use-image-upload';
import { useSessionActions } from '../session-history/use-session-actions';
import type { MissedEntryDialogProps } from './types';

dayjs.extend(utc);
dayjs.extend(timezone);

export function useMissedEntryForm(props: MissedEntryDialogProps) {
  const { open, onOpenChange, wsId, mode = 'normal' } = props;

  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('time-tracker.missed_entry_dialog');

  // Mode-specific props destructuring
  const isExceededMode = mode === 'exceeded-session';
  const isChainMode = mode === 'exceeded-session-chain';
  const isNormalMode = mode === 'normal';

  const session =
    props.mode === 'exceeded-session' || props.mode === 'exceeded-session-chain'
      ? props.session
      : undefined;
  const onSessionDiscarded =
    props.mode === 'exceeded-session' || props.mode === 'exceeded-session-chain'
      ? props.onSessionDiscarded
      : undefined;
  const onMissedEntryCreated =
    props.mode === 'exceeded-session' || props.mode === 'exceeded-session-chain'
      ? props.onMissedEntryCreated
      : undefined;
  const prefillStartTime =
    props.mode === 'normal' ? props.prefillStartTime : undefined;
  const prefillEndTime =
    props.mode === 'normal' ? props.prefillEndTime : undefined;

  const breakTypeId =
    props.mode === 'exceeded-session' || props.mode === 'exceeded-session-chain'
      ? props.breakTypeId
      : undefined;
  const breakTypeName =
    props.mode === 'exceeded-session' || props.mode === 'exceeded-session-chain'
      ? props.breakTypeName
      : undefined;

  // State for selected workspace (only applicable in normal mode)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(wsId);

  // Determine effective workspace ID for operations
  const effectiveWsId = isNormalMode ? selectedWorkspaceId : wsId;

  // Validation helper
  const { getValidationErrorMessage } = useSessionActions({
    wsId: effectiveWsId,
  });

  // Form state
  const [missedEntryTitle, setMissedEntryTitle] = useState('');
  const [missedEntryDescription, setMissedEntryDescription] = useState('');
  const [missedEntryCategoryId, setMissedEntryCategoryId] = useState('none');
  const [missedEntryTaskId, setMissedEntryTaskId] = useState('none');
  const [missedEntryStartTime, setMissedEntryStartTime] = useState('');
  const [missedEntryEndTime, setMissedEntryEndTime] = useState('');
  const [isCreatingMissedEntry, setIsCreatingMissedEntry] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  // State to trigger updates for live duration
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Image upload hook
  const {
    images,
    imagePreviews,
    isCompressing,
    imageError,
    isDragOver,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleImageUpload,
    removeImage,
    clearImages,
    totalImageCount,
    canAddMoreImages,
  } = useImageUpload();

  // Calculate session info for exceeded mode
  const sessionStartTime = useMemo(
    () => (session?.start_time ? dayjs(session.start_time) : null),
    [session?.start_time]
  );

  const currentDuration = useMemo(() => {
    if (!sessionStartTime) return 0;
    return dayjs(currentTime).diff(sessionStartTime, 'second');
  }, [sessionStartTime, currentTime]);

  // Track if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if ((isExceededMode || isChainMode) && session) {
      const titleChanged = missedEntryTitle !== (session.title || '');
      const descriptionChanged =
        missedEntryDescription !== (session.description || '');
      const categoryChanged =
        missedEntryCategoryId !== (session.category_id || 'none');
      const taskChanged = missedEntryTaskId !== (session.task_id || 'none');
      const imagesChanged = images.length > 0;

      return (
        titleChanged ||
        descriptionChanged ||
        categoryChanged ||
        taskChanged ||
        imagesChanged
      );
    }

    const isNotEmpty =
      missedEntryTitle !== '' ||
      missedEntryDescription !== '' ||
      missedEntryCategoryId !== 'none' ||
      missedEntryTaskId !== 'none' ||
      images.length > 0;

    if (prefillStartTime || prefillEndTime) {
      const startTimeChanged =
        missedEntryStartTime !== (prefillStartTime || '');
      const endTimeChanged = missedEntryEndTime !== (prefillEndTime || '');
      return isNotEmpty || startTimeChanged || endTimeChanged;
    }

    return isNotEmpty;
  }, [
    isExceededMode,
    isChainMode,
    session,
    missedEntryTitle,
    missedEntryDescription,
    missedEntryCategoryId,
    missedEntryTaskId,
    images.length,
    prefillStartTime,
    prefillEndTime,
    missedEntryStartTime,
    missedEntryEndTime,
  ]);

  // Reset category and task when workspace changes
  useEffect(() => {
    if (isNormalMode && selectedWorkspaceId !== wsId) {
      setMissedEntryCategoryId('none');
      setMissedEntryTaskId('none');
    }
  }, [selectedWorkspaceId, wsId, isNormalMode]);

  // Reset selected workspace to current workspace when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedWorkspaceId(wsId);
    }
  }, [open, wsId]);

  // Initialize form values when dialog opens
  useEffect(() => {
    if (open) {
      if (isExceededMode && session) {
        setMissedEntryTitle(session.title || '');
        setMissedEntryDescription(session.description || '');
        setMissedEntryCategoryId(session.category_id || 'none');
        setMissedEntryTaskId(session.task_id || 'none');

        const userTz = dayjs.tz.guess();
        const sessionStart = dayjs.utc(session.start_time).tz(userTz);
        const now = dayjs().tz(userTz);

        setMissedEntryStartTime(sessionStart.format('YYYY-MM-DDTHH:mm'));
        setMissedEntryEndTime(now.format('YYYY-MM-DDTHH:mm'));
      } else if (prefillStartTime && prefillEndTime) {
        setMissedEntryStartTime(prefillStartTime);
        setMissedEntryEndTime(prefillEndTime);
      } else if (isNormalMode) {
        // Default to 1 hour before and current time when no prefill values provided
        const userTz = dayjs.tz.guess();
        const now = dayjs().tz(userTz);
        const oneHourBefore = now.subtract(1, 'hour');

        setMissedEntryStartTime(oneHourBefore.format('YYYY-MM-DDTHH:mm'));
        setMissedEntryEndTime(now.format('YYYY-MM-DDTHH:mm'));
      }
    }
  }, [
    open,
    isExceededMode,
    isNormalMode,
    session,
    prefillStartTime,
    prefillEndTime,
  ]);

  // Update current duration every second in exceeded mode
  useEffect(() => {
    if ((!isExceededMode && !isChainMode) || !sessionStartTime) return;

    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isExceededMode, isChainMode, sessionStartTime]);

  // Compute validation errors without triggering re-renders
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    const startValidation = validateStartTime(missedEntryStartTime);
    if (!startValidation.isValid) {
      errors.startTime = getValidationErrorMessage(startValidation);
    }

    const endValidation = validateEndTime(missedEntryEndTime);
    if (!endValidation.isValid) {
      errors.endTime = getValidationErrorMessage(endValidation);
    }

    if (
      missedEntryStartTime &&
      missedEntryEndTime &&
      startValidation.isValid &&
      endValidation.isValid
    ) {
      const startTime = dayjs(missedEntryStartTime);
      const endTime = dayjs(missedEntryEndTime);

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

    return errors;
  }, [missedEntryStartTime, missedEntryEndTime, getValidationErrorMessage]);

  const closeMissedEntryDialog = () => {
    onOpenChange(false);
    setMissedEntryTitle('');
    setMissedEntryDescription('');
    setMissedEntryCategoryId('none');
    setMissedEntryTaskId('none');
    setMissedEntryStartTime('');
    setMissedEntryEndTime('');
    clearImages();
  };

  const createMissedEntry = async (
    isStartTimeOlderThanThreshold: boolean,
    thresholdDays: number | null | undefined
  ) => {
    if (!missedEntryTitle.trim()) {
      toast.error(t('errors.titleRequired'));
      return;
    }

    if (!missedEntryStartTime || !missedEntryEndTime) {
      toast.error(t('errors.timesRequired'));
      return;
    }

    if (Object.keys(validationErrors).length > 0) {
      const allErrors = Object.values(validationErrors).join('. ');
      toast.error(allErrors);
      return;
    }

    if (isStartTimeOlderThanThreshold && images.length === 0) {
      toast.error(
        thresholdDays === 0
          ? t('errors.imageRequiredAll')
          : t('errors.imageRequiredOlder', { days: thresholdDays ?? 1 })
      );
      return;
    }

    setIsCreatingMissedEntry(true);

    try {
      const userTz = dayjs.tz.guess();

      if (isStartTimeOlderThanThreshold) {
        const isBreakPause = !!(breakTypeId || breakTypeName);
        let linkedSessionId: string | null = null;

        if (isExceededMode && session && isBreakPause) {
          const pauseRes = await fetch(
            `/api/v1/workspaces/${wsId}/time-tracking/sessions/${session.id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'pause',
                breakTypeId: breakTypeId || undefined,
                breakTypeName: breakTypeName || undefined,
                pendingApproval: true,
              }),
            }
          );
          if (!pauseRes.ok) {
            const err = await pauseRes.json().catch(() => null);
            throw new Error(
              err?.error ?? 'Failed to pause session before creating request'
            );
          }
          linkedSessionId = session.id;
        } else if (isExceededMode && session) {
          const deleteRes = await fetch(
            `/api/v1/workspaces/${wsId}/time-tracking/sessions/${session.id}`,
            { method: 'DELETE' }
          );
          if (!deleteRes.ok) {
            const err = await deleteRes.json().catch(() => null);
            throw new Error(
              err?.error ?? 'Failed to discard session before creating request'
            );
          }
        }

        const formData = new FormData();
        formData.append('title', missedEntryTitle);
        formData.append('description', missedEntryDescription || '');
        formData.append(
          'categoryId',
          missedEntryCategoryId === 'none' ? '' : missedEntryCategoryId
        );
        formData.append(
          'taskId',
          missedEntryTaskId === 'none' ? '' : missedEntryTaskId
        );
        formData.append(
          'startTime',
          dayjs.tz(missedEntryStartTime, userTz).utc().toISOString()
        );
        formData.append(
          'endTime',
          dayjs.tz(missedEntryEndTime, userTz).utc().toISOString()
        );

        images.forEach((image, index) => {
          formData.append(`image_${index}`, image);
        });

        if (linkedSessionId) {
          formData.append('linkedSessionId', linkedSessionId);
        }

        const response = await fetch(
          `/api/v1/workspaces/${effectiveWsId}/time-tracking/requests`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || t('errors.createRequestFailed'));
        }

        queryClient.invalidateQueries({
          queryKey: ['time-tracking-requests', effectiveWsId, 'pending'],
        });
        queryClient.invalidateQueries({
          queryKey: ['running-time-session', effectiveWsId],
        });
        queryClient.invalidateQueries({
          queryKey: ['time-tracking-sessions', effectiveWsId],
        });
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'paused-time-session' &&
            query.queryKey[1] === effectiveWsId,
        });

        router.refresh();
        closeMissedEntryDialog();
        toast.success(t('success.requestSubmitted'));

        if (isExceededMode || isChainMode) {
          const wasBreakPause = !!(breakTypeId || breakTypeName);
          onMissedEntryCreated?.(wasBreakPause);
        }
      } else {
        const response = await fetch(
          `/api/v1/workspaces/${effectiveWsId}/time-tracking/sessions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: missedEntryTitle,
              description: missedEntryDescription || null,
              categoryId:
                missedEntryCategoryId === 'none' ? null : missedEntryCategoryId,
              taskId: missedEntryTaskId === 'none' ? null : missedEntryTaskId,
              startTime: dayjs
                .tz(missedEntryStartTime, userTz)
                .utc()
                .toISOString(),
              endTime: dayjs.tz(missedEntryEndTime, userTz).utc().toISOString(),
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || t('errors.createSessionFailed'));
        }

        router.refresh();
        closeMissedEntryDialog();
        toast.success(t('success.entryAdded'));
      }
    } catch (error) {
      console.error('Error creating missed entry:', error);
      const errorMessage =
        error instanceof Error ? error.message : t('errors.createEntryFailed');
      toast.error(errorMessage);
    } finally {
      setIsCreatingMissedEntry(false);
    }
  };

  const handleDiscardSession = async () => {
    if (!isExceededMode || !session) return;

    setIsDiscarding(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${session.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to discard session');
      }

      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-sessions', wsId],
      });
      router.refresh();
      toast.success(t('exceeded.sessionDiscarded'));
      closeMissedEntryDialog();
      onSessionDiscarded?.();
    } catch (error) {
      console.error('Error discarding session:', error);
      toast.error(t('exceeded.discardFailed'));
    } finally {
      setIsDiscarding(false);
    }
  };

  return {
    // Mode flags
    isExceededMode,
    isChainMode,
    isNormalMode,

    // Workspace
    selectedWorkspaceId,
    effectiveWsId,
    setSelectedWorkspaceId,

    // Form state
    missedEntryTitle,
    missedEntryDescription,
    missedEntryCategoryId,
    missedEntryTaskId,
    missedEntryStartTime,
    missedEntryEndTime,
    setMissedEntryTitle,
    setMissedEntryDescription,
    setMissedEntryCategoryId,
    setMissedEntryTaskId,
    setMissedEntryStartTime,
    setMissedEntryEndTime,

    // Images
    images,
    imagePreviews,
    isCompressing,
    imageError,
    isDragOver,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleImageUpload,
    removeImage,
    clearImages,
    totalImageCount,
    canAddMoreImages,

    // Validation
    validationErrors,

    // Loading states
    isCreatingMissedEntry,
    isDiscarding,

    // Computed values
    hasUnsavedChanges,
    currentTime,
    currentDuration,
    sessionStartTime,

    // Actions
    createMissedEntry,
    handleDiscardSession,
    closeMissedEntryDialog,
  };
}
