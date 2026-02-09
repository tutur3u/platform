'use client';

import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useEffect, useMemo, useState } from 'react';
import type { TimeValidationResult } from '../utils/time-validation';
import { validateEndTime, validateStartTime } from '../utils/time-validation';
import type { UseImageUploadReturn } from './use-image-upload';
import { useImageUpload } from './use-image-upload';

dayjs.extend(utc);
dayjs.extend(timezone);

export interface MissedEntryFormCallbacks {
  onOpenChange: (open: boolean) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  refreshData?: () => void;
  getValidationErrorMessage: (result: TimeValidationResult) => string;
}

export interface MissedEntryFormConfig {
  wsId: string;
  mode?: 'normal' | 'exceeded-session' | 'exceeded-session-chain';
  allowFutureSessions?: boolean;
}

export interface NormalModeFormConfig extends MissedEntryFormConfig {
  mode?: 'normal';
  prefillStartTime?: string;
  prefillEndTime?: string;
}

export interface ExceededModeFormConfig extends MissedEntryFormConfig {
  mode: 'exceeded-session' | 'exceeded-session-chain';
  session: {
    id: string;
    title?: string | null;
    description?: string | null;
    category_id?: string | null;
    task_id?: string | null;
    start_time: string;
  };
  breakTypeId?: string;
  breakTypeName?: string;
}

export type UseMissedEntryFormConfig =
  | NormalModeFormConfig
  | ExceededModeFormConfig;

export interface UseMissedEntryFormReturn {
  // Mode flags
  isExceededMode: boolean;
  isChainMode: boolean;
  isNormalMode: boolean;

  // Workspace
  selectedWorkspaceId: string;
  effectiveWsId: string;
  setSelectedWorkspaceId: (id: string) => void;

  // Form state
  missedEntryTitle: string;
  missedEntryDescription: string;
  missedEntryCategoryId: string;
  missedEntryTaskId: string;
  missedEntryStartTime: string;
  missedEntryEndTime: string;
  setMissedEntryTitle: (value: string) => void;
  setMissedEntryDescription: (value: string) => void;
  setMissedEntryCategoryId: (value: string) => void;
  setMissedEntryTaskId: (value: string) => void;
  setMissedEntryStartTime: (value: string) => void;
  setMissedEntryEndTime: (value: string) => void;

  // Images
  images: File[];
  imagePreviews: string[];
  existingImages: string[];
  isCompressing: boolean;
  imageError: string;
  isDragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleDragOver: (event: React.DragEvent) => void;
  handleDragLeave: (event: React.DragEvent) => void;
  handleDrop: (event: React.DragEvent) => void;
  handleImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  removeImage: (index: number) => void;
  clearImages: () => void;
  totalImageCount: number;
  canAddMoreImages: boolean;

  // Validation
  validationErrors: Record<string, string>;

  // Loading states
  isCreatingMissedEntry: boolean;
  isDiscarding: boolean;

  // Computed values
  hasUnsavedChanges: boolean;
  currentTime: number;
  currentDuration: number;
  sessionStartTime: dayjs.Dayjs | null;

  // Actions
  createMissedEntry: (
    isStartTimeOlderThanThreshold: boolean,
    thresholdDays: number | null | undefined,
    apiBaseUrl?: string
  ) => Promise<void>;
  handleDiscardSession: (apiBaseUrl?: string) => Promise<void>;
  closeMissedEntryDialog: () => void;
}

export function useMissedEntryForm(
  open: boolean,
  config: UseMissedEntryFormConfig,
  callbacks: MissedEntryFormCallbacks
): UseMissedEntryFormReturn {
  const {
    onOpenChange,
    onSuccess,
    onError,
    refreshData,
    getValidationErrorMessage,
  } = callbacks;

  const queryClient = useQueryClient();

  // Mode-specific props destructuring
  const isExceededMode =
    config.mode === 'exceeded-session' ||
    config.mode === 'exceeded-session-chain';
  const isChainMode = config.mode === 'exceeded-session-chain';
  const isNormalMode = config.mode !== 'exceeded-session' && !isChainMode;

  const session = isExceededMode ? config.session : undefined;
  const prefillStartTime =
    config.mode === 'normal' || config.mode === undefined
      ? config.prefillStartTime
      : undefined;
  const prefillEndTime =
    config.mode === 'normal' || config.mode === undefined
      ? config.prefillEndTime
      : undefined;

  const breakTypeId = isExceededMode ? config.breakTypeId : undefined;
  const breakTypeName = isExceededMode ? config.breakTypeName : undefined;

  const allowFutureSessions = config.allowFutureSessions ?? false;

  // State for selected workspace (only applicable in normal mode)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    config.wsId
  );

  // Determine effective workspace ID for operations
  const effectiveWsId = isNormalMode ? selectedWorkspaceId : config.wsId;

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
  const imageUpload: UseImageUploadReturn = useImageUpload();

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
    if (isExceededMode && session) {
      const titleChanged = missedEntryTitle !== (session.title || '');
      const descriptionChanged =
        missedEntryDescription !== (session.description || '');
      const categoryChanged =
        missedEntryCategoryId !== (session.category_id || 'none');
      const taskChanged = missedEntryTaskId !== (session.task_id || 'none');
      const imagesChanged = imageUpload.images.length > 0;

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
      imageUpload.images.length > 0;

    if (prefillStartTime || prefillEndTime) {
      const startTimeChanged =
        missedEntryStartTime !== (prefillStartTime || '');
      const endTimeChanged = missedEntryEndTime !== (prefillEndTime || '');
      return isNotEmpty || startTimeChanged || endTimeChanged;
    }

    return isNotEmpty;
  }, [
    isExceededMode,
    session,
    missedEntryTitle,
    missedEntryDescription,
    missedEntryCategoryId,
    missedEntryTaskId,
    imageUpload.images.length,
    prefillStartTime,
    prefillEndTime,
    missedEntryStartTime,
    missedEntryEndTime,
  ]);

  // Reset category and task when workspace changes
  useEffect(() => {
    if (isNormalMode && selectedWorkspaceId !== config.wsId) {
      setMissedEntryCategoryId('none');
      setMissedEntryTaskId('none');
    }
  }, [selectedWorkspaceId, config.wsId, isNormalMode]);

  // Reset selected workspace to current workspace when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedWorkspaceId(config.wsId);
    }
  }, [open, config.wsId]);

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

    const startValidation = validateStartTime(
      missedEntryStartTime,
      allowFutureSessions
    );
    if (!startValidation.isValid) {
      errors.startTime = getValidationErrorMessage(startValidation);
    }

    const endValidation = validateEndTime(
      missedEntryEndTime,
      allowFutureSessions
    );
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
  }, [
    missedEntryStartTime,
    missedEntryEndTime,
    allowFutureSessions,
    getValidationErrorMessage,
  ]);

  const closeMissedEntryDialog = () => {
    onOpenChange(false);
    setMissedEntryTitle('');
    setMissedEntryDescription('');
    setMissedEntryCategoryId('none');
    setMissedEntryTaskId('none');
    setMissedEntryStartTime('');
    setMissedEntryEndTime('');
    imageUpload.clearImages();
  };

  const createMissedEntry = async (
    isStartTimeOlderThanThreshold: boolean,
    thresholdDays: number | null | undefined,
    apiBaseUrl = '/api/v1/workspaces'
  ) => {
    if (!missedEntryTitle.trim()) {
      onError?.('Title is required');
      return;
    }

    if (!missedEntryStartTime || !missedEntryEndTime) {
      onError?.('Start and end times are required');
      return;
    }

    if (Object.keys(validationErrors).length > 0) {
      const allErrors = Object.values(validationErrors).join('. ');
      onError?.(allErrors);
      return;
    }

    if (isStartTimeOlderThanThreshold && imageUpload.images.length === 0) {
      onError?.(
        thresholdDays === 0
          ? 'Proof of work image is required for all entries'
          : `Proof of work image is required for entries older than ${thresholdDays ?? 1} day(s)`
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
            `${apiBaseUrl}/${config.wsId}/time-tracking/sessions/${session.id}`,
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
            `${apiBaseUrl}/${config.wsId}/time-tracking/sessions/${session.id}`,
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

        imageUpload.images.forEach((image, index) => {
          formData.append(`image_${index}`, image);
        });

        if (linkedSessionId) {
          formData.append('linkedSessionId', linkedSessionId);
        }

        const response = await fetch(
          `${apiBaseUrl}/${effectiveWsId}/time-tracking/requests`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create request');
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

        refreshData?.();
        closeMissedEntryDialog();
        onSuccess?.('Request submitted successfully');
      } else {
        const response = await fetch(
          `${apiBaseUrl}/${effectiveWsId}/time-tracking/sessions`,
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
          throw new Error(errorData.error || 'Failed to create session');
        }

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

        refreshData?.();
        closeMissedEntryDialog();
        onSuccess?.('Entry added successfully');
      }
    } catch (error) {
      console.error('Error creating missed entry:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create entry';
      onError?.(errorMessage);
    } finally {
      setIsCreatingMissedEntry(false);
    }
  };

  const handleDiscardSession = async (apiBaseUrl = '/api/v1/workspaces') => {
    if (!isExceededMode || !session) return;

    setIsDiscarding(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/${config.wsId}/time-tracking/sessions/${session.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to discard session');
      }

      queryClient.invalidateQueries({
        queryKey: ['running-time-session', config.wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-sessions', config.wsId],
      });
      refreshData?.();
      onSuccess?.('Session discarded');
      closeMissedEntryDialog();
    } catch (error) {
      console.error('Error discarding session:', error);
      onError?.('Failed to discard session');
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
    images: imageUpload.images,
    imagePreviews: imageUpload.imagePreviews,
    existingImages: imageUpload.existingImages,
    isCompressing: imageUpload.isCompressing,
    imageError: imageUpload.imageError,
    isDragOver: imageUpload.isDragOver,
    fileInputRef: imageUpload.fileInputRef,
    handleDragOver: imageUpload.handleDragOver,
    handleDragLeave: imageUpload.handleDragLeave,
    handleDrop: imageUpload.handleDrop,
    handleImageUpload: imageUpload.handleImageUpload,
    removeImage: imageUpload.removeImage,
    clearImages: imageUpload.clearImages,
    totalImageCount: imageUpload.totalImageCount,
    canAddMoreImages: imageUpload.canAddMoreImages,

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
