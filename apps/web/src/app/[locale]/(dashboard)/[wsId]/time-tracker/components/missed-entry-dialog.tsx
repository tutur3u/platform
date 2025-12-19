import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Coffee,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types';
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
import { cn, isValidBlobUrl } from '@tuturuuu/utils/format';
import imageCompression from 'browser-image-compression';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceTimeThreshold } from '@/hooks/useWorkspaceTimeThreshold';
import { formatDuration } from '@/lib/time-format';
import { validateEndTime, validateStartTime } from '@/lib/time-validation';
import type { SessionWithRelations } from '../types';
import { getCategoryColor } from './session-history';
import { useSessionActions } from './session-history/use-session-actions';
import { useWorkspaceTasks } from './use-workspace-tasks';
import { TaskCombobox } from './task-combobox';

dayjs.extend(utc);
dayjs.extend(timezone);

// Shared props for both modes
interface BaseMissedEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TimeTrackingCategory[] | null;
  wsId: string;
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

// Props for exceeded session chain mode
interface ExceededSessionChainModeProps extends BaseMissedEntryDialogProps {
  mode: 'exceeded-session-chain';
  session: SessionWithRelations;
  thresholdDays: number | null;
  chainSummary: {
    root_session_id: string;
    sessions: Array<{
      id: string;
      title: string;
      description?: string;
      start_time: string;
      end_time: string;
      duration_seconds: number;
      chain_position: number;
    }>;
    breaks: Array<{
      id: string;
      session_id: string;
      break_type_name: string;
      break_start: string;
      break_end: string;
      break_duration_seconds: number;
      break_type_icon?: string;
      break_type_color?: string;
    }>;
    total_work_seconds: number;
    total_break_seconds: number;
    original_start_time: string;
    chain_length: number;
  };
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

const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_IMAGES = 5;
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export default function MissedEntryDialog(props: MissedEntryDialogProps) {
  const { open, onOpenChange, categories, wsId, mode = 'normal' } = props;

  // Mode-specific props
  const isExceededMode = mode === 'exceeded-session';
  const isChainMode = mode === 'exceeded-session-chain';
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

  // Fetch tasks on-demand only when dialog is open
  const { data: tasks, isLoading: isLoadingTasks } = useWorkspaceTasks({
    wsId: open ? wsId : null,
    enabled: open,
  });

  // Only fetch threshold in normal mode (exceeded mode provides it)
  const {
    data: fetchedThresholdData,
    isLoading: isLoadingThreshold,
    isError: isErrorThreshold,
  } = useWorkspaceTimeThreshold(isExceededMode ? null : wsId);

  // Use provided threshold in exceeded mode, fetched in normal mode
  const thresholdDays = isExceededMode
    ? providedThresholdDays
    : fetchedThresholdData?.threshold;

  const t = useTranslations('time-tracker.missed_entry_dialog');

  const { getValidationErrorMessage } = useSessionActions({ wsId });

  // State for missed entry form
  const [missedEntryTitle, setMissedEntryTitle] = useState('');
  const [missedEntryDescription, setMissedEntryDescription] = useState('');
  const [missedEntryCategoryId, setMissedEntryCategoryId] = useState('none');
  const [missedEntryTaskId, setMissedEntryTaskId] = useState('none');
  const [missedEntryStartTime, setMissedEntryStartTime] = useState('');
  const [missedEntryEndTime, setMissedEntryEndTime] = useState('');
  const [isCreatingMissedEntry, setIsCreatingMissedEntry] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  // State for image uploads (for entries older than threshold)
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [imageError, setImageError] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewsRef = useRef<string[]>([]);

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
  const currentDuration = useMemo(() => {
    if (!sessionStartTime) return 0;
    // Use currentTime to ensure this recalculates every second
    return dayjs(currentTime).diff(sessionStartTime, 'second');
  }, [sessionStartTime, currentTime]);

  const closeMissedEntryDialog = () => {
    // Revoke all object URLs to free memory
    imagePreviews.forEach((url) => {
      URL.revokeObjectURL(url);
    });

    onOpenChange(false);
    setMissedEntryTitle('');
    setMissedEntryDescription('');
    setMissedEntryCategoryId('none');
    setMissedEntryTaskId('none');
    setMissedEntryStartTime('');
    setMissedEntryEndTime('');
    setImages([]);
    setImagePreviews([]);
    imagePreviewsRef.current = [];
    setImageError('');
    setIsDragOver(false);
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

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviewsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  // Update current duration every second in exceeded mode
  useEffect(() => {
    if (!isExceededMode || !sessionStartTime) return;

    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isExceededMode, sessionStartTime]);

  const compressImage = async (file: File): Promise<File> => {
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        initialQuality: 0.8,
      };
      const compressedBlob = await imageCompression(file, options);

      const compressedFile = new File([compressedBlob], file.name, {
        type: compressedBlob.type || file.type,
        lastModified: Date.now(),
      });

      return compressedFile;
    } catch (error) {
      console.error('Image compression failed:', error);
      return file;
    }
  };

  const processImageFiles = async (files: File[]) => {
    const validTypeFiles = files.filter((file) =>
      ALLOWED_IMAGE_TYPES.includes(file.type)
    );

    const invalidTypeCount = files.length - validTypeFiles.length;
    if (invalidTypeCount > 0) {
      setImageError(t('errors.invalidFileType', { count: invalidTypeCount }));
    }

    const currentImageCount = images.length;
    const availableSlots = MAX_IMAGES - currentImageCount;
    const filesToProcess = validTypeFiles.slice(0, availableSlots);
    const overflow = validTypeFiles.length - filesToProcess.length;

    if (overflow > 0) {
      setImageError(
        t('errors.maxImagesExceeded', { max: MAX_IMAGES, overflow })
      );
    }

    if (filesToProcess.length > 0) {
      setIsCompressing(true);
      try {
        const processedWithSize = await Promise.all(
          filesToProcess.map(async (file) => {
            const processedFile = await compressImage(file);
            return {
              file: processedFile,
              isValid: processedFile.size <= MAX_IMAGE_SIZE,
              originalName: file.name,
            };
          })
        );

        const validFiles = processedWithSize.filter((item) => item.isValid);
        const rejectedBySize = processedWithSize.filter(
          (item) => !item.isValid
        );

        if (rejectedBySize.length > 0) {
          const rejectedNames = rejectedBySize
            .map((item) => item.originalName)
            .join(', ');
          setImageError(
            t('errors.fileTooLarge', {
              count: rejectedBySize.length,
              names: rejectedNames,
            })
          );
        } else if (imageError && invalidTypeCount === 0) {
          setImageError('');
        }

        if (validFiles.length > 0) {
          const acceptedFiles = validFiles.map((item) => item.file);
          const newImages = [...images, ...acceptedFiles];
          setImages(newImages);

          const newPreviews = acceptedFiles.map((file) =>
            URL.createObjectURL(file)
          );
          setImagePreviews((prev) => {
            const updated = [...prev, ...newPreviews];
            imagePreviewsRef.current = updated;
            return updated;
          });
        }
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);

    const files = Array.from(event.dataTransfer.files).filter((file) =>
      ALLOWED_IMAGE_TYPES.includes(file.type)
    );

    if (files.length > 0) {
      processImageFiles(files);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    processImageFiles(files);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    if (imagePreviews[index]) {
      URL.revokeObjectURL(imagePreviews[index]);
    }

    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);

    setImages(newImages);
    setImagePreviews(newPreviews);
    imagePreviewsRef.current = newPreviews;
  };

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

  // Shared Image Upload Section - render function (not a component) to avoid ref issues
  const renderImageUploadSection = (disabled: boolean) => (
    <div className="space-y-3">
      <Label className="font-medium text-sm">
        {t('approval.proofOfWork', {
          current: images.length,
          max: MAX_IMAGES,
        })}
      </Label>

      {images.length < MAX_IMAGES && (
        <button
          type="button"
          className={cn(
            'relative w-full rounded-lg border-2 border-dashed transition-all duration-200',
            isDragOver
              ? 'border-dynamic-orange bg-dynamic-orange/10'
              : 'border-border hover:border-border/80',
            (isCompressing || disabled) && 'pointer-events-none opacity-50'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-label="Click to upload or drag and drop images"
          disabled={disabled || isCompressing}
        >
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={handleImageUpload}
            disabled={disabled || isCompressing}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
            <div
              className={cn(
                'mb-2 flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                isDragOver ? 'bg-dynamic-orange/20' : 'bg-muted'
              )}
            >
              <Upload
                className={cn(
                  'h-5 w-5',
                  isDragOver ? 'text-dynamic-orange' : 'text-muted-foreground'
                )}
              />
            </div>
            <p className="mb-1 font-medium text-sm">
              {isCompressing
                ? t('approval.compressing')
                : isDragOver
                  ? t('approval.dropImages')
                  : t('approval.clickToUpload')}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('approval.imageFormats')}
            </p>
          </div>
        </button>
      )}

      {imageError && (
        <div className="flex items-center gap-1 text-dynamic-red text-sm">
          <AlertCircle className="h-3 w-3" />
          {imageError}
        </div>
      )}

      {imagePreviews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {imagePreviews.map((preview, index) => (
            <div key={preview} className="group relative">
              <div className="aspect-square overflow-hidden rounded-lg border-2 border-border bg-muted">
                <Image
                  src={isValidBlobUrl(preview) ? preview : '/placeholder.svg'}
                  alt={t('approval.proofImageAlt', {
                    number: index + 1,
                  })}
                  className="h-full w-full object-cover"
                  width={100}
                  height={100}
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="-top-2 -right-2 absolute h-6 w-6 rounded-full opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                onClick={() => removeImage(index)}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

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

        // Only append break info if it's a break scenario where we haven't already paused
        // (i.e., if session doesn't exist or if we deleted it instead of pausing)
        // In break scenario, break is already created via pause, so don't send to request
        // In non-break scenario, send break info so it's created on approval
        if (isExceededMode && isBreakPause && !session) {
          // Session doesn't exist - this shouldn't happen, but safeguard
          if (breakTypeId) {
            formData.append('breakTypeId', breakTypeId);
          }
          if (breakTypeName) {
            formData.append('breakTypeName', breakTypeName);
          }
        }

        const response = await fetch(
          `/api/v1/workspaces/${wsId}/time-tracking/requests`,
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
          queryKey: ['time-tracking-requests', wsId, 'pending'],
        });
        queryClient.invalidateQueries({
          queryKey: ['running-time-session', wsId],
        });
        queryClient.invalidateQueries({
          queryKey: ['time-tracking-sessions', wsId],
        });
        // Invalidate paused session queries to refetch after break pause
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'paused-time-session' &&
            query.queryKey[1] === wsId,
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
          `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
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

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isLoading) {
          closeMissedEntryDialog();
        }
      }}
    >
      <DialogContent className="mx-auto flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="border-b pb-4">
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
        <div className="flex-1 space-y-4 overflow-y-auto py-4">
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
                    <p className="text-muted-foreground text-sm mt-1">
                      {t('exceeded.chainStarted', {
                        time: dayjs(chainSummary.original_start_time).format(
                          'MMM D, YYYY [at] h:mm A'
                        ),
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-dynamic-orange text-2xl">
                      {chainSummary.chain_length}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {t('exceeded.sessionsInChain')}
                    </div>
                  </div>
                </div>

                {/* Totals */}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-3">
                    <div className="text-green-700 dark:text-green-300 text-xs font-medium">
                      {t('exceeded.totalWorkTime')}
                    </div>
                    <div className="font-bold text-green-600 dark:text-green-400 text-xl mt-1">
                      {formatDuration(chainSummary.total_work_seconds)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3">
                    <div className="text-amber-700 dark:text-amber-300 text-xs font-medium">
                      {t('exceeded.totalBreakTime')}
                    </div>
                    <div className="font-bold text-amber-600 dark:text-amber-400 text-xl mt-1">
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
                {chainSummary.sessions?.map((sess: any, idx: number) => {
                  const sessionBreaks =
                    chainSummary.breaks?.filter(
                      (b: any) => b.session_id === sess.id
                    ) || [];

                  return (
                    <div key={sess.id} className="space-y-2">
                      {/* Work Session */}
                      <div className="flex items-start gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10 p-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-white text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {sess.title}
                          </div>
                          <div className="text-muted-foreground text-xs mt-1">
                            {dayjs(sess.start_time).format('h:mm A')} →{' '}
                            {dayjs(sess.end_time).format('h:mm A')}
                            <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                              {formatDuration(sess.duration_seconds)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Breaks after this session */}
                      {sessionBreaks.map((brk: any) => (
                        <div
                          key={brk.id}
                          className="ml-9 flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10 p-2"
                        >
                          <Coffee className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">
                              {brk.break_type_icon && (
                                <span className="mr-1">
                                  {brk.break_type_icon}
                                </span>
                              )}
                              {brk.break_type_name}
                            </div>
                            <div className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                              {formatDuration(brk.break_duration_seconds)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
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
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('form.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('form.noCategory')}</SelectItem>
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
              {renderImageUploadSection(isCreatingMissedEntry)}
            </div>
          )}

          {/* Image upload section for exceeded mode (always required) */}
          {isExceededMode && renderImageUploadSection(isLoading)}

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
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-between">
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
          <div className="flex w-full flex-col-reverse gap-3 border-t px-6 pt-4 sm:flex-row sm:justify-end">
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
