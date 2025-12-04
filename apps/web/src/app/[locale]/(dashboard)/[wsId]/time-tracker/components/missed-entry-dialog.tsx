import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types';
import type { TaskWithDetails } from './session-history/session-types';
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
import {
  validateTimeRange,
  validateStartTime,
  validateEndTime,
} from '@/lib/time-validation';
import { getCategoryColor } from './session-history';
import type { SessionWithRelations } from '../types';
import { useSessionActions } from './session-history/use-session-actions';

dayjs.extend(utc);
dayjs.extend(timezone);

// Shared props for both modes
interface BaseMissedEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TimeTrackingCategory[] | null;
  tasks: TaskWithDetails[] | null;
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
  onSessionDiscarded?: never;
  onMissedEntryCreated?: never;
}

// Props for exceeded threshold session mode
interface ExceededSessionModeProps extends BaseMissedEntryDialogProps {
  mode: 'exceeded-session';
  session: SessionWithRelations;
  thresholdDays: number | null;
  onSessionDiscarded: () => void;
  onMissedEntryCreated: () => void;
  // Not used in exceeded mode
  prefillStartTime?: never;
  prefillEndTime?: never;
}

type MissedEntryDialogProps = NormalModeProps | ExceededSessionModeProps;

const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_IMAGES = 5;
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export default function MissedEntryDialog(props: MissedEntryDialogProps) {
  const {
    open,
    onOpenChange,
    categories,
    tasks,
    wsId,
    mode = 'normal',
  } = props;


  // Mode-specific props
  const isExceededMode = mode === 'exceeded-session';
  const session = isExceededMode ? props.session : undefined;
  const providedThresholdDays = isExceededMode
    ? props.thresholdDays
    : undefined;
  const onSessionDiscarded = isExceededMode
    ? props.onSessionDiscarded
    : undefined;
  const onMissedEntryCreated = isExceededMode
    ? props.onMissedEntryCreated
    : undefined;
  const prefillStartTime = !isExceededMode ? props.prefillStartTime : undefined;
  const prefillEndTime = !isExceededMode ? props.prefillEndTime : undefined;

  const router = useRouter();
  const queryClient = useQueryClient();

  // Only fetch threshold in normal mode (exceeded mode provides it)
  const {
    data: fetchedThresholdDays,
    isLoading: isLoadingThreshold,
    isError: isErrorThreshold,
  } = useWorkspaceTimeThreshold(isExceededMode ? null : wsId);

  // Use provided threshold in exceeded mode, fetched in normal mode
  const thresholdDays = isExceededMode
    ? providedThresholdDays
    : fetchedThresholdDays;

  const t = useTranslations('time-tracker.missed_entry_dialog');

  const {getValidationErrorMessage} = useSessionActions({ wsId });

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
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  
  // Calculate session info for exceeded mode
  const sessionStartTime = useMemo(
    () => (session?.start_time ? dayjs(session.start_time) : null),
    [session?.start_time]
  );
  const currentDuration = useMemo(() => {
    if (!sessionStartTime) return 0;
    return dayjs().diff(sessionStartTime, 'second');
  }, [sessionStartTime]);

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

    // Validate time range
    const rangeValidation = validateTimeRange(missedEntryStartTime, missedEntryEndTime);
    if (!rangeValidation.isValid) {
      errors.timeRange = getValidationErrorMessage(rangeValidation);
    }

    setValidationErrors(errors);
  }, [missedEntryStartTime, missedEntryEndTime, t]);

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

    // Check if there are validation errors
    if (Object.keys(validationErrors).length > 0) {
      toast.error(Object.values(validationErrors)[0]);
      return;
    }

    // Validate time range
    const rangeValidation = validateTimeRange(missedEntryStartTime, missedEntryEndTime);
    if (!rangeValidation.isValid) {
      toast.error(getValidationErrorMessage(rangeValidation));
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
        // In exceeded mode, first delete the running session
        if (isExceededMode && session) {
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
        router.refresh();
        closeMissedEntryDialog();
        toast.success(t('success.requestSubmitted'));

        // Call callback for exceeded mode
        if (isExceededMode) {
          onMissedEntryCreated?.();
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
          {isExceededMode ? (
            <>
              <DialogTitle className="flex items-center gap-2 text-dynamic-orange">
                <AlertTriangle className="h-5 w-5" />
                {t('exceeded.title')}
              </DialogTitle>
              <DialogDescription>{t('exceeded.description')}</DialogDescription>
            </>
          ) : (
            <DialogTitle>{t('title')}</DialogTitle>
          )}
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          {/* Session info banner - exceeded mode only */}
          {isExceededMode && session && (
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
              <Select
                value={missedEntryTaskId}
                onValueChange={setMissedEntryTaskId}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('form.selectTask')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('form.noTask')}</SelectItem>
                  {tasks?.map(
                    (task) =>
                      task.id && (
                        <SelectItem key={task.id} value={task.id}>
                          {task.name}
                        </SelectItem>
                      )
                  )}
                </SelectContent>
              </Select>
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
                className={Object.keys(validationErrors).length > 0 ? 'border-dynamic-red' : ''}
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
                className={Object.keys(validationErrors).length > 0 ? 'border-dynamic-red' : ''}
              />
            </div>
          </div>
          {Object.keys(validationErrors).length > 0 && (
            <div className="flex items-center gap-1 text-dynamic-red text-sm">
              <AlertCircle className="h-3 w-3" />
              {Object.values(validationErrors)[0]}
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
