import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CircleUserRound,
  Clock,
  Coffee,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from '@tuturuuu/icons';
import type { TimeTrackingCategory, Workspace } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceTimeThreshold } from '@/hooks/useWorkspaceTimeThreshold';
import { formatDuration } from '@/lib/time-format';
import { validateEndTime, validateStartTime } from '@/lib/time-validation';
import { useImageUpload } from '../hooks/use-image-upload';
import { ImageUploadSection } from '../requests/components/image-upload-section';
import type { SessionWithRelations } from '../types';
import { getCategoryColor } from './session-history';
import { useSessionActions } from './session-history/use-session-actions';
import { TaskCombobox } from './task-combobox';
import { useWorkspaceCategories } from './use-workspace-categories';
import { useUserWorkspaces } from './use-user-workspaces';
import { useWorkspaceTasks } from './use-workspace-tasks';

dayjs.extend(utc);
dayjs.extend(timezone);

// Shared props for both modes
interface BaseMissedEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TimeTrackingCategory[] | null;
  wsId: string;
  workspace: Workspace;
}

// Props for normal missed entry mode
interface NormalModeProps extends BaseMissedEntryDialogProps {
  mode?: 'normal';
  prefillStartTime?: string;
  prefillEndTime?: string;
  // Not used in normal mode
  session?: never;
  thresholdDays?: never;
  chainSummary?: never;
  onSessionDiscarded?: never;
  onMissedEntryCreated?: never;
}

// Props for exceeded threshold session mode
interface ExceededSessionModeProps extends BaseMissedEntryDialogProps {
  mode: 'exceeded-session';
  session: SessionWithRelations;
  thresholdDays: number | null;
  onSessionDiscarded: () => void;
  // wasBreakPause indicates if the session was paused for a break (so paused state should be maintained)
  onMissedEntryCreated: (wasBreakPause?: boolean) => void;
  breakTypeId?: string; // Break type to create when submitting approval
  breakTypeName?: string; // Custom break type name
  // Not used in exceeded mode
  prefillStartTime?: never;
  prefillEndTime?: never;
  chainSummary?: never;
}

interface ChainSession {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  chain_position: number;
}
interface ChainBreak {
  id: string;
  session_id: string;
  break_type_name: string;
  break_start: string;
  break_end: string;
  break_duration_seconds: number;
  break_type_icon?: string;
  break_type_color?: string;
}
export interface ChainSummary {
  root_session_id: string;
  sessions: ChainSession[];
  breaks: ChainBreak[];
  total_work_seconds: number;
  total_break_seconds: number;
  original_start_time: string;
  chain_length: number;
}

// Props for exceeded session chain mode
interface ExceededSessionChainModeProps extends BaseMissedEntryDialogProps {
  mode: 'exceeded-session-chain';
  session: SessionWithRelations;
  thresholdDays: number | null;
  chainSummary: ChainSummary | null;
  onSessionDiscarded: () => void;
  // wasBreakPause indicates if the session was paused for a break (so paused state should be maintained)
  onMissedEntryCreated: (wasBreakPause?: boolean) => void;
  breakTypeId?: string; // Break type to create when submitting approval
  breakTypeName?: string; // Custom break type name
  // Not used in chain mode
  prefillStartTime?: never;
  prefillEndTime?: never;
}

type MissedEntryDialogProps =
  | NormalModeProps
  | ExceededSessionModeProps
  | ExceededSessionChainModeProps;

export default function MissedEntryDialog(props: MissedEntryDialogProps) {
  const { open, onOpenChange, categories, wsId, mode = 'normal' } = props;

  // Mode-specific props
  const isExceededMode = mode === 'exceeded-session';
  const isChainMode = mode === 'exceeded-session-chain';
  const isNormalMode = !isExceededMode && !isChainMode;
  const session = isExceededMode || isChainMode ? props.session : undefined;
  const chainSummary = isChainMode ? props.chainSummary : undefined;
  const providedThresholdDays =
    isExceededMode || isChainMode ? props.thresholdDays : undefined;
  const onSessionDiscarded =
    isExceededMode || isChainMode ? props.onSessionDiscarded : undefined;
  const onMissedEntryCreated =
    isExceededMode || isChainMode ? props.onMissedEntryCreated : undefined;
  const prefillStartTime =
    !isExceededMode && !isChainMode ? props.prefillStartTime : undefined;
  const prefillEndTime =
    !isExceededMode && !isChainMode ? props.prefillEndTime : undefined;

  // Break info from exceeded mode
  const breakTypeId =
    isExceededMode || isChainMode
      ? (props as ExceededSessionModeProps | ExceededSessionChainModeProps)
          .breakTypeId
      : undefined;
  const breakTypeName =
    isExceededMode || isChainMode
      ? (props as ExceededSessionModeProps | ExceededSessionChainModeProps)
          .breakTypeName
      : undefined;

  const router = useRouter();
  const queryClient = useQueryClient();

  const t = useTranslations('time-tracker.missed_entry_dialog');

  // State for selected workspace (only applicable in normal mode)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(wsId);

  // Fetch user workspaces for workspace selector (only in normal mode)
  const { data: userWorkspaces, isLoading: isLoadingWorkspaces } = useUserWorkspaces({
    enabled: open && isNormalMode,
  });

  // Determine effective workspace ID for fetching categories and tasks
  const effectiveWsId = isNormalMode ? selectedWorkspaceId : wsId;

  // Fetch categories for the selected workspace (use initial categories only for current workspace)
  const { data: workspaceCategories, isLoading: isLoadingCategories } = useWorkspaceCategories({
    wsId: open ? effectiveWsId : null,
    enabled: open,
    initialData: effectiveWsId === wsId ? categories : undefined,
  });

  // Fetch tasks for the selected workspace
  const { data: tasks, isLoading: isLoadingTasks } = useWorkspaceTasks({
    wsId: open ? effectiveWsId : null,
    enabled: open,
  });

  // Only fetch threshold in normal mode (exceeded mode provides it)
  const {
    data: fetchedThresholdData,
    isLoading: isLoadingThreshold,
    isError: isErrorThreshold,
  } = useWorkspaceTimeThreshold(isExceededMode || isChainMode ? null : effectiveWsId);

  // Use provided threshold in exceeded mode, fetched in normal mode
  const thresholdDays =
    isExceededMode || isChainMode
      ? providedThresholdDays
      : fetchedThresholdData?.threshold;

  const { getValidationErrorMessage } = useSessionActions({ wsId: effectiveWsId });

  // State for missed entry form
  const [missedEntryTitle, setMissedEntryTitle] = useState('');
  const [missedEntryDescription, setMissedEntryDescription] = useState('');
  const [missedEntryCategoryId, setMissedEntryCategoryId] = useState('none');
  const [missedEntryTaskId, setMissedEntryTaskId] = useState('none');
  const [missedEntryStartTime, setMissedEntryStartTime] = useState('');
  const [missedEntryEndTime, setMissedEntryEndTime] = useState('');
  const [isCreatingMissedEntry, setIsCreatingMissedEntry] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  // Reset category and task when workspace changes
  useEffect(() => {
    if (isNormalMode && selectedWorkspaceId !== wsId) {
      // Reset category and task selection when switching workspaces
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

  // Use shared image upload hook
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

  // Validation state
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  // State to trigger updates for live duration
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Calculate session info for exceeded mode
  const sessionStartTime = useMemo(
    () => (session?.start_time ? dayjs(session.start_time) : null),
    [session?.start_time]
  );

  // Track if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    // If we are in any exceeded mode, we compare against session/chain data
    if ((isExceededMode || isChainMode) && session) {
      const titleChanged = missedEntryTitle !== (session.title || '');
      const descriptionChanged =
        missedEntryDescription !== (session.description || '');
      const categoryChanged =
        missedEntryCategoryId !== (session.category_id || 'none');
      const taskChanged = missedEntryTaskId !== (session.task_id || 'none');

      // Check image changes
      const imagesChanged = images.length > 0;

      // Note: We don't strictly compare times here as they are pre-filled with dynamic 'now'
      // but title/description/category/task/images are the primary user inputs
      return (
        titleChanged ||
        descriptionChanged ||
        categoryChanged ||
        taskChanged ||
        imagesChanged
      );
    }

    // Normal mode: check if anything is modified from empty/pre-filled state
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

  const currentDuration = useMemo(() => {
    if (!sessionStartTime) return 0;
    // Use currentTime to ensure this recalculates every second
    return dayjs(currentTime).diff(sessionStartTime, 'second');
  }, [sessionStartTime, currentTime]);

  const closeMissedEntryDialog = () => {
    onOpenChange(false);
    setMissedEntryTitle('');
    setMissedEntryDescription('');
    setMissedEntryCategoryId('none');
    setMissedEntryTaskId('none');
    setMissedEntryStartTime('');
    setMissedEntryEndTime('');
    clearImages();
    setValidationErrors({});
  };

  // Initialize form values when dialog opens
  useEffect(() => {
    if (open) {
      if (isExceededMode && session) {
        // Pre-fill from session data
        setMissedEntryTitle(session.title || '');
        setMissedEntryDescription(session.description || '');
        setMissedEntryCategoryId(session.category_id || 'none');
        setMissedEntryTaskId(session.task_id || 'none');

        // Set times: start = session start, end = now
        const userTz = dayjs.tz.guess();
        const sessionStart = dayjs.utc(session.start_time).tz(userTz);
        const now = dayjs().tz(userTz);

        setMissedEntryStartTime(sessionStart.format('YYYY-MM-DDTHH:mm'));
        setMissedEntryEndTime(now.format('YYYY-MM-DDTHH:mm'));
      } else if (prefillStartTime && prefillEndTime) {
        // Normal mode with pre-filled times
        setMissedEntryStartTime(prefillStartTime);
        setMissedEntryEndTime(prefillEndTime);
      }
    }
  }, [open, isExceededMode, session, prefillStartTime, prefillEndTime]);

  // Update current duration every second in exceeded mode
  useEffect(() => {
    if ((!isExceededMode && !isChainMode) || !sessionStartTime) return;

    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isExceededMode, isChainMode, sessionStartTime]);

  // Validate form fields in real-time
  useEffect(() => {
    const errors: Record<string, string> = {};

    // Validate start time
    const startValidation = validateStartTime(missedEntryStartTime);
    if (!startValidation.isValid) {
      errors.startTime = getValidationErrorMessage(startValidation);
    }

    // Validate end time
    const endValidation = validateEndTime(missedEntryEndTime);
    if (!endValidation.isValid) {
      errors.endTime = getValidationErrorMessage(endValidation);
    }

    // Only validate time range specific errors (skip individual time validations)
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

    setValidationErrors(errors);
  }, [missedEntryStartTime, missedEntryEndTime, getValidationErrorMessage]);

  const createMissedEntry = async () => {
    if (!missedEntryTitle.trim()) {
      toast.error(t('errors.titleRequired'));
      return;
    }

    if (!missedEntryStartTime || !missedEntryEndTime) {
      toast.error(t('errors.timesRequired'));
      return;
    }

    // Check if there are validation errors (includes time range validation)
    if (Object.keys(validationErrors).length > 0) {
      const allErrors = Object.values(validationErrors).join('. ');
      toast.error(allErrors);
      return;
    }

    // Use the pre-computed threshold check
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

      // If older than threshold (or threshold is 0), create a time tracking request instead
      if (isStartTimeOlderThanThreshold) {
        // In exceeded mode, handle two cases:
        // 1. If there's a break, pause the session with pendingApproval=true so it doesn't show in history
        // 2. If no break, delete the session as it's a pure missed entry
        const isBreakPause = !!(breakTypeId || breakTypeName);
        let linkedSessionId: string | null = null;

        if (isExceededMode && session && isBreakPause) {
          // Break case: pause the session with pending_approval=true
          // The session will only appear in history after the request is approved
          const pauseRes = await fetch(
            `/api/v1/workspaces/${wsId}/time-tracking/sessions/${session.id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'pause',
                breakTypeId: breakTypeId || undefined,
                breakTypeName: breakTypeName || undefined,
                pendingApproval: true, // Mark session as pending approval
              }),
            }
          );
          if (!pauseRes.ok) {
            const err = await pauseRes.json().catch(() => null);
            throw new Error(
              err?.error ?? 'Failed to pause session before creating request'
            );
          }
          // Link the request to this session so approval/rejection updates the session
          linkedSessionId = session.id;
        } else if (isExceededMode && session) {
          // Non-break case: delete the session (pure missed entry)
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

        // Append image files
        images.forEach((image, index) => {
          formData.append(`image_${index}`, image);
        });

        // Link request to session for break pauses (so approval/rejection updates session)
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
        // Invalidate paused session queries to refetch after break pause
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'paused-time-session' &&
            query.queryKey[1] === effectiveWsId,
        });

        router.refresh();
        closeMissedEntryDialog();
        toast.success(t('success.requestSubmitted'));

        // Call callback for exceeded mode
        // Pass wasBreakPause=true if this was a break pause, so parent can keep paused state
        if (isExceededMode || isChainMode) {
          const wasBreakPause = !!(breakTypeId || breakTypeName);
          onMissedEntryCreated?.(wasBreakPause);
        }
      } else {
        // Regular entry creation for entries within threshold days
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

  // Check if start time is older than threshold days
  // When threshold is null, no approval is needed (any entry can be added directly)
  // When threshold is 0, all entries require approval
  // Otherwise, entries older than threshold days require approval
  // In exceeded mode, always require approval
  const isStartTimeOlderThanThreshold = useMemo(() => {
    // Exceeded mode always requires approval
    if (isExceededMode) return true;
    if (!missedEntryStartTime) return false;
    // If threshold is loading or errored, treat as requiring approval (safer default)
    if (isLoadingThreshold || isErrorThreshold) return true;
    // If threshold is null or undefined, no approval needed - any entry can be added directly
    if (thresholdDays === null || thresholdDays === undefined) return false;
    if (thresholdDays === 0) return true; // All entries require approval when threshold is 0
    const startTime = dayjs(missedEntryStartTime);
    // At this point thresholdDays is guaranteed to be a positive number
    const thresholdAgo = dayjs().subtract(thresholdDays as number, 'day');
    return startTime.isBefore(thresholdAgo);
  }, [
    missedEntryStartTime,
    thresholdDays,
    isLoadingThreshold,
    isErrorThreshold,
    isExceededMode,
  ]);

  // Discard the running session (exceeded mode only)
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

  const isLoading = isCreatingMissedEntry || isDiscarding;

  // Common props for ImageUploadSection components
  const imageUploadCommonProps = {
    images,
    imagePreviews,
    isCompressing,
    isDragOver,
    imageError,
    canAddMore: canAddMoreImages,
    maxImages: 5,
    totalCount: totalImageCount,
    fileInputRef,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onFileChange: handleImageUpload,
    onRemoveNew: removeImage,
    onRemoveExisting: () => {},
    labels: {
      proofOfWork: t('approval.proofOfWork', {
        current: totalImageCount,
        max: 5,
      }),
      compressing: t('approval.compressing'),
      dropImages: t('approval.dropImages'),
      clickToUpload: t('approval.clickToUpload'),
      imageFormats: t('approval.imageFormats'),
      proofImageAlt: t('approval.proofImageAlt'),
      existing: t('approval.existingImage'),
      new: t('approval.newImage'),
    },
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isLoading) {
          closeMissedEntryDialog();
        }
      }}
    >
      <DialogContent
        className="mx-auto flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden p-0"
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
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          {isExceededMode || isChainMode ? (
            <>
              <DialogTitle className="flex items-center gap-2 text-dynamic-orange">
                <AlertTriangle className="h-5 w-5" />
                {isChainMode ? t('exceeded.chainTitle') : t('exceeded.title')}
              </DialogTitle>
              <DialogDescription>
                {isChainMode
                  ? t('exceeded.chainDescription')
                  : t('exceeded.description')}
              </DialogDescription>
            </>
          ) : (
            <DialogTitle>{t('title')}</DialogTitle>
          )}
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-6 py-4">
          {/* Session chain timeline - chain mode only */}
          {isChainMode && chainSummary && (
            <div className="space-y-4">
              {/* Chain Summary Header */}
              <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/10 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-dynamic-orange text-lg">
                      {t('exceeded.chainSummaryTitle')}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {t('exceeded.chainStarted', {
                        time: dayjs(chainSummary.original_start_time).format(
                          'MMM D, YYYY [at] h:mm A'
                        ),
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-2xl text-dynamic-orange">
                      {chainSummary.chain_length}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {t('exceeded.sessionsInChain')}
                    </div>
                  </div>
                </div>

                {/* Totals */}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950/20">
                    <div className="font-medium text-green-700 text-xs dark:text-green-300">
                      {t('exceeded.totalWorkTime')}
                    </div>
                    <div className="mt-1 font-bold text-green-600 text-xl dark:text-green-400">
                      {formatDuration(chainSummary.total_work_seconds)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20">
                    <div className="font-medium text-amber-700 text-xs dark:text-amber-300">
                      {t('exceeded.totalBreakTime')}
                    </div>
                    <div className="mt-1 font-bold text-amber-600 text-xl dark:text-amber-400">
                      {formatDuration(chainSummary.total_break_seconds)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm">
                  {t('exceeded.timeline')}
                </h4>
                {chainSummary.sessions?.map(
                  (sess: ChainSession, idx: number) => {
                    const sessionBreaks =
                      chainSummary.breaks?.filter(
                        (b: ChainBreak) => b.session_id === sess.id
                      ) || [];

                    return (
                      <div key={sess.id} className="space-y-2">
                        {/* Work Session */}
                        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-800 dark:bg-green-950/10">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 font-bold text-white text-xs">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {sess.title}
                            </div>
                            <div className="mt-1 text-muted-foreground text-xs">
                              {dayjs(sess.start_time).format('h:mm A')} →{' '}
                              {dayjs(sess.end_time).format('h:mm A')}
                              <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                                {formatDuration(sess.duration_seconds)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Breaks after this session */}
                        {sessionBreaks.map((brk: ChainBreak) => (
                          <div
                            key={brk.id}
                            className="ml-9 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-800 dark:bg-amber-950/10"
                          >
                            <Coffee className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm">
                                {brk.break_type_icon && (
                                  <span className="mr-1">
                                    {brk.break_type_icon}
                                  </span>
                                )}
                                {brk.break_type_name}
                              </div>
                              <div className="font-medium text-amber-600 text-xs dark:text-amber-400">
                                {formatDuration(brk.break_duration_seconds)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}

          {/* Session info banner - exceeded mode only (single session) */}
          {isExceededMode && !isChainMode && session && (
            <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/10 p-4">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-orange" />
                <div className="flex-1 space-y-1">
                  <p className="font-medium">
                    {session.title || t('exceeded.untitledSession')}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {t('exceeded.startedAt', {
                      time:
                        sessionStartTime?.format('MMM D, YYYY [at] h:mm A') ||
                        '',
                    })}
                  </p>
                  <p className="font-mono text-dynamic-orange text-sm">
                    {t('exceeded.runningFor', {
                      duration: formatDuration(currentDuration),
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Warning message - exceeded mode only */}
          {isExceededMode && (
            <div className="rounded-lg bg-muted p-4">
              <p className="text-muted-foreground text-sm">
                {thresholdDays === 0
                  ? t('exceeded.allEntriesRequireApproval')
                  : t('exceeded.exceedsThreshold', {
                      days: thresholdDays ?? 1,
                    })}
              </p>
            </div>
          )}

          {/* Workspace selector - normal mode only */}
          {isNormalMode && (
            <div>
              <Label htmlFor="missed-entry-workspace">
                {t('form.workspace')}
              </Label>
              <Select
                value={selectedWorkspaceId}
                onValueChange={(value) => {
                  setSelectedWorkspaceId(value);
                  // Reset category and task when workspace changes
                  setMissedEntryCategoryId('none');
                  setMissedEntryTaskId('none');
                }}
                disabled={isLoading || isLoadingWorkspaces}
              >
                <SelectTrigger id="missed-entry-workspace">
                  <SelectValue placeholder={t('form.selectWorkspace')} />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingWorkspaces ? (
                    <SelectItem value="loading" disabled>
                      {t('form.loadingWorkspaces')}
                    </SelectItem>
                  ) : (
                    userWorkspaces?.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarImage
                              src={ws.avatar_url || undefined}
                              alt={ws.name || ''}
                            />
                            <AvatarFallback className="text-[10px]">
                              {ws.personal ? (
                                <CircleUserRound className="h-3 w-3" />
                              ) : (
                                ws.name?.charAt(0).toUpperCase() || <Users className="h-3 w-3" />
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{ws.name}</span>
                          {ws.personal && (
                            <span className="text-muted-foreground text-xs">
                              ({t('form.personal')})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedWorkspaceId !== wsId && (
                <p className="mt-1 text-muted-foreground text-xs">
                  {t('form.differentWorkspaceHint')}
                </p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="missed-entry-title">{t('form.title')}</Label>
            <Input
              id="missed-entry-title"
              value={missedEntryTitle}
              onChange={(e) => setMissedEntryTitle(e.target.value)}
              placeholder={t('form.titlePlaceholder')}
              disabled={isLoading}
            />
          </div>
          <div>
            <Label htmlFor="missed-entry-description">
              {t('form.description')}
            </Label>
            <Textarea
              id="missed-entry-description"
              value={missedEntryDescription}
              onChange={(e) => setMissedEntryDescription(e.target.value)}
              placeholder={t('form.descriptionPlaceholder')}
              rows={2}
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="missed-entry-category">
                {t('form.category')}
              </Label>
              <Select
                value={missedEntryCategoryId}
                onValueChange={setMissedEntryCategoryId}
                disabled={isLoading || isLoadingCategories}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('form.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingCategories ? (
                    <SelectItem value="loading" disabled>
                      {t('form.loadingCategories')}
                    </SelectItem>
                  ) : (
                    <>
                      <SelectItem value="none">{t('form.noCategory')}</SelectItem>
                      {workspaceCategories?.map((category) => (
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
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="missed-entry-task">{t('form.task')}</Label>
              <TaskCombobox
                id="missed-entry-task"
                value={missedEntryTaskId}
                onValueChange={setMissedEntryTaskId}
                tasks={tasks}
                isLoading={isLoadingTasks}
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <Label htmlFor="missed-entry-start-time">
                {t('form.startTime')}
              </Label>
              <Input
                id="missed-entry-start-time"
                type="datetime-local"
                value={missedEntryStartTime}
                onChange={(e) => setMissedEntryStartTime(e.target.value)}
                disabled={isLoading}
                className={
                  validationErrors.startTime ? 'border-dynamic-red' : ''
                }
              />
            </div>
            <div>
              <Label htmlFor="missed-entry-end-time">{t('form.endTime')}</Label>
              <Input
                id="missed-entry-end-time"
                type="datetime-local"
                value={missedEntryEndTime}
                onChange={(e) => setMissedEntryEndTime(e.target.value)}
                disabled={isLoading}
                className={validationErrors.endTime ? 'border-dynamic-red' : ''}
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
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          )}

          {/* Warning and image upload for entries older than threshold */}
          {isStartTimeOlderThanThreshold && !isExceededMode && (
            <div className="space-y-4">
              <div className="rounded-lg border border-dynamic-orange bg-dynamic-orange/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-orange" />
                  <div className="text-sm">
                    <p className="font-medium text-dynamic-orange">
                      {t('approval.title')}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {isLoadingThreshold || thresholdDays === undefined
                        ? t('approval.loadingThreshold')
                        : thresholdDays === 0 || thresholdDays === null
                          ? t('approval.allEntries')
                          : t('approval.entriesOlderThan', {
                              days: thresholdDays,
                            })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Image upload section */}
              <ImageUploadSection
                {...imageUploadCommonProps}
                disabled={isCreatingMissedEntry}
              />
            </div>
          )}

          {/* Image upload section for exceeded mode (always required) */}
          {isExceededMode && (
            <ImageUploadSection
              {...imageUploadCommonProps}
              disabled={isLoading}
            />
          )}

          {/* Quick time presets - hidden in exceeded mode */}
          {!isExceededMode && (
            <div className="rounded-lg border p-3">
              <Label className="text-muted-foreground text-xs">
                {t('presets.title')}
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: t('presets.lastHour'), minutes: 60 },
                  { label: t('presets.last2Hours'), minutes: 120 },
                  {
                    label: t('presets.morning'),
                    isCustom: true,
                    start: '09:00',
                    end: '12:00',
                  },
                  {
                    label: t('presets.afternoon'),
                    isCustom: true,
                    start: '13:00',
                    end: '17:00',
                  },
                  {
                    label: t('presets.yesterday'),
                    isCustom: true,
                    start: 'yesterday-9',
                    end: 'yesterday-17',
                  },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    type="button"
                    onClick={() => {
                      const now = dayjs();
                      if (preset.isCustom) {
                        if (preset.start === 'yesterday-9') {
                          const yesterday = now.subtract(1, 'day');
                          setMissedEntryStartTime(
                            yesterday
                              .hour(9)
                              .minute(0)
                              .format('YYYY-MM-DDTHH:mm')
                          );
                          setMissedEntryEndTime(
                            yesterday
                              .hour(17)
                              .minute(0)
                              .format('YYYY-MM-DDTHH:mm')
                          );
                        } else if (preset.start && preset.end) {
                          const today = now.startOf('day');
                          const startParts = preset.start.split(':');
                          const endParts = preset.end.split(':');
                          const startHour = parseInt(startParts[0] || '9', 10);
                          const startMin = parseInt(startParts[1] || '0', 10);
                          const endHour = parseInt(endParts[0] || '17', 10);
                          const endMin = parseInt(endParts[1] || '0', 10);
                          setMissedEntryStartTime(
                            today
                              .hour(startHour)
                              .minute(startMin)
                              .format('YYYY-MM-DDTHH:mm')
                          );
                          setMissedEntryEndTime(
                            today
                              .hour(endHour)
                              .minute(endMin)
                              .format('YYYY-MM-DDTHH:mm')
                          );
                        }
                      } else if (preset.minutes) {
                        const endTime = now;
                        const startTime = endTime.subtract(
                          preset.minutes,
                          'minutes'
                        );
                        setMissedEntryStartTime(
                          startTime.format('YYYY-MM-DDTHH:mm')
                        );
                        setMissedEntryEndTime(
                          endTime.format('YYYY-MM-DDTHH:mm')
                        );
                      }
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Show calculated duration */}
          {missedEntryStartTime && missedEntryEndTime && (
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Clock className="h-4 w-4" />
                <span>{t('duration.label')}</span>
                <span className="font-medium text-foreground">
                  {(() => {
                    const start = dayjs(missedEntryStartTime);
                    const end = dayjs(missedEntryEndTime);
                    if (end.isBefore(start)) return t('duration.invalidRange');
                    const durationMs = end.diff(start);
                    const duration = Math.floor(durationMs / 1000);
                    return formatDuration(duration);
                  })()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions - different layout for exceeded mode */}
        {isExceededMode ? (
          <div className="flex flex-col gap-3 border-t px-6 pt-4 pb-6 sm:flex-row sm:justify-between">
            <Button
              variant="destructive"
              onClick={handleDiscardSession}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {isDiscarding ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t('exceeded.discarding')}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  {t('exceeded.discardSession')}
                </>
              )}
            </Button>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={closeMissedEntryDialog}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                onClick={createMissedEntry}
                disabled={
                  isLoading || images.length === 0 || !missedEntryTitle.trim()
                }
                className="w-full sm:w-auto"
              >
                {isCreatingMissedEntry ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t('actions.submitting')}
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    {t('actions.submitForApproval')}
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col-reverse gap-3 border-t px-6 pt-4 pb-6 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={closeMissedEntryDialog}
              className="w-full sm:w-auto"
              disabled={isCreatingMissedEntry}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={createMissedEntry}
              disabled={
                isCreatingMissedEntry ||
                isLoadingThreshold ||
                !missedEntryTitle.trim() ||
                !missedEntryStartTime ||
                !missedEntryEndTime ||
                (isStartTimeOlderThanThreshold && images.length === 0) ||
                Object.keys(validationErrors).length > 0
              }
              className="w-full sm:w-auto"
            >
              {isCreatingMissedEntry ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {isLoadingThreshold
                    ? t('actions.loading')
                    : isStartTimeOlderThanThreshold
                      ? t('actions.submitting')
                      : t('actions.adding')}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {isLoadingThreshold
                    ? t('actions.loading')
                    : isStartTimeOlderThanThreshold
                      ? t('actions.submitForApproval')
                      : t('actions.addEntry')}
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
