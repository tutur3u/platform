import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@tuturuuu/ui/dialog";
import { Label } from "@tuturuuu/ui/label";
import { Input } from "@tuturuuu/ui/input";
import { Textarea } from "@tuturuuu/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tuturuuu/ui/select";
import { Button } from "@tuturuuu/ui/button";
import { RefreshCw, Plus, Clock, AlertCircle, Upload, X } from "@tuturuuu/icons";
import dayjs from "dayjs";
import { cn, isValidBlobUrl } from "@tuturuuu/utils/format";
import { toast } from "@tuturuuu/ui/sonner";
import { useRouter } from "next/navigation";
import { useState, useMemo, useEffect, useRef } from "react";
import type { TimeTrackingCategory, WorkspaceTask } from "@tuturuuu/types";
import { formatDuration, getCategoryColor } from "./session-history";
import imageCompression from 'browser-image-compression';
import Image from 'next/image';
import { useQueryClient } from "@tanstack/react-query";

interface MissedEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TimeTrackingCategory[] | null;
  tasks: (Partial<WorkspaceTask> & {
    board_name?: string;
    list_name?: string;
  })[] | null;
  wsId: string;
  prefillStartTime?: string;
  prefillEndTime?: string;
}

const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB
const MAX_IMAGES = 5;
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export default function MissedEntryDialog({ 
  open,
  onOpenChange,
  categories, 
  tasks,
  wsId,
  prefillStartTime = '',
  prefillEndTime = '',
}: MissedEntryDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // State for missed entry form
  const [missedEntryTitle, setMissedEntryTitle] = useState('');
  const [missedEntryDescription, setMissedEntryDescription] = useState('');
  const [missedEntryCategoryId, setMissedEntryCategoryId] = useState('none');
  const [missedEntryTaskId, setMissedEntryTaskId] = useState('none');
  const [missedEntryStartTime, setMissedEntryStartTime] = useState('');
  const [missedEntryEndTime, setMissedEntryEndTime] = useState('');
  const [isCreatingMissedEntry, setIsCreatingMissedEntry] = useState(false);
  
  // State for image uploads (for entries older than 1 day)
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [imageError, setImageError] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewsRef = useRef<string[]>([]);

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
  };

  // Initialize with pre-filled times when dialog opens
  useEffect(() => {
    if (open && prefillStartTime && prefillEndTime) {
      setMissedEntryStartTime(prefillStartTime);
      setMissedEntryEndTime(prefillEndTime);
    }
  }, [open, prefillStartTime, prefillEndTime]);

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
      setImageError(
        `${invalidTypeCount} file(s) rejected: only images (PNG, JPEG, WebP, GIF) are allowed.`
      );
    }

    const currentImageCount = images.length;
    const availableSlots = MAX_IMAGES - currentImageCount;
    const filesToProcess = validTypeFiles.slice(0, availableSlots);
    const overflow = validTypeFiles.length - filesToProcess.length;

    if (overflow > 0) {
      setImageError(
        `You can upload up to ${MAX_IMAGES} images. ${overflow} file(s) were rejected.`
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
            `${rejectedBySize.length} file(s) rejected (exceeded 1MB even after compression): ${rejectedNames}`
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

  const createMissedEntry = async () => {
    if (!missedEntryTitle.trim()) {
      toast.error('Please enter a title for the session');
      return;
    }

    if (!missedEntryStartTime || !missedEntryEndTime) {
      toast.error('Please enter both start and end times');
      return;
    }

    const startTime = dayjs(missedEntryStartTime);
    const endTime = dayjs(missedEntryEndTime);

    if (endTime.isBefore(startTime)) {
      toast.error('End time cannot be before start time');
      return;
    }

    if (endTime.diff(startTime, 'minutes') < 1) {
      toast.error('Session must be at least 1 minute long');
      return;
    }

    // Check if start time is older than 1 day
    const oneDayAgo = dayjs().subtract(1, 'day');
    const isOlderThanOneDay = startTime.isBefore(oneDayAgo);
    
    if (isOlderThanOneDay && images.length === 0) {
      toast.error('Please upload at least one image for entries older than 1 day');
      return;
    }

    setIsCreatingMissedEntry(true);

    try {
      const userTz = dayjs.tz.guess();
      
      // If older than 1 day, create a time tracking request instead
      if (isOlderThanOneDay) {
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
          throw new Error(errorData.error || 'Failed to create time tracking request');
        }

        queryClient.invalidateQueries({ queryKey: ['time-tracking-requests', wsId, 'pending'] });
        router.refresh();
        closeMissedEntryDialog();
        toast.success('Time tracking request submitted for approval');
      } else {
        // Regular entry creation for entries within 1 day
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
          throw new Error(errorData.error || 'Failed to create session');
        }

        router.refresh();
        closeMissedEntryDialog();
        toast.success('Missed entry added successfully');
      }
    } catch (error) {
      console.error('Error creating missed entry:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create entry';
      toast.error(errorMessage);
    } finally {
      setIsCreatingMissedEntry(false);
    }
  };

  // Check if start time is older than 1 day
  const isStartTimeOlderThanOneDay = useMemo(() => {
    if (!missedEntryStartTime) return false;
    const startTime = dayjs(missedEntryStartTime);
    const oneDayAgo = dayjs().subtract(1, 'day');
    return startTime.isBefore(oneDayAgo);
  }, [missedEntryStartTime]);
    return (
        <Dialog
        open={open}
        onOpenChange={closeMissedEntryDialog}
      >
        <DialogContent className="mx-auto flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden">
          <DialogHeader className="border-b pb-4">
            <DialogTitle>Add Missed Time Entry</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto">
            <div>
              <Label htmlFor="missed-entry-title">Title *</Label>
              <Input
                id="missed-entry-title"
                value={missedEntryTitle}
                onChange={(e) => setMissedEntryTitle(e.target.value)}
                placeholder="What were you working on?"
              />
            </div>
            <div>
              <Label htmlFor="missed-entry-description">Description</Label>
              <Textarea
                id="missed-entry-description"
                value={missedEntryDescription}
                onChange={(e) => setMissedEntryDescription(e.target.value)}
                placeholder="Optional details about the work"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="missed-entry-category">Category</Label>
                <Select
                  value={missedEntryCategoryId}
                  onValueChange={setMissedEntryCategoryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
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
                <Label htmlFor="missed-entry-task">Task</Label>
                <Select
                  value={missedEntryTaskId}
                  onValueChange={setMissedEntryTaskId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select task" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No task</SelectItem>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <Label htmlFor="missed-entry-start-time">Start Time *</Label>
                <Input
                  id="missed-entry-start-time"
                  type="datetime-local"
                  value={missedEntryStartTime}
                  onChange={(e) => setMissedEntryStartTime(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="missed-entry-end-time">End Time *</Label>
                <Input
                  id="missed-entry-end-time"
                  type="datetime-local"
                  value={missedEntryEndTime}
                  onChange={(e) => setMissedEntryEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Warning and image upload for entries older than 1 day */}
            {isStartTimeOlderThanOneDay && (
              <div className="space-y-4">
                <div className="rounded-lg border-dynamic-orange bg-dynamic-orange/10 p-3 border">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-orange" />
                    <div className="text-sm">
                      <p className="font-medium text-dynamic-orange">
                        Approval Required
                      </p>
                      <p className="text-muted-foreground mt-1">
                        Entries older than 1 day require approval. Please upload at least one image as proof of work.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Image upload section */}
                <div className="space-y-3">
                  <Label className="font-medium text-sm">
                    Proof of Work * ({images.length}/{MAX_IMAGES})
                  </Label>

                  {images.length < MAX_IMAGES && (
                    <button
                      type="button"
                      className={cn(
                        'relative w-full rounded-lg border-2 border-dashed transition-all duration-200',
                        isDragOver
                          ? 'border-dynamic-orange bg-dynamic-orange/10'
                          : 'border-border hover:border-border/80',
                        isCompressing && 'pointer-events-none opacity-50'
                      )}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      aria-label="Click to upload or drag and drop images"
                      disabled={isCompressing}
                    >
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        onChange={handleImageUpload}
                        disabled={isCreatingMissedEntry || isCompressing}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                      <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
                        <div
                          className={cn(
                            'mb-2 flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                            isDragOver
                              ? 'bg-dynamic-orange/20'
                              : 'bg-muted'
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
                            ? 'Compressing...'
                            : isDragOver
                              ? 'Drop images here'
                              : 'Click to upload or drag and drop'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          PNG, JPG, GIF, or WebP up to 1MB each
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
                              src={
                                isValidBlobUrl(preview)
                                  ? preview
                                  : '/placeholder.svg'
                              }
                              alt={`Proof image ${index + 1}`}
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
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick time presets */}
            <div className="rounded-lg border p-3">
              <Label className="text-muted-foreground text-xs">
                Quick Presets
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: 'Last hour', minutes: 60 },
                  { label: 'Last 2 hours', minutes: 120 },
                  {
                    label: 'Morning (9-12)',
                    isCustom: true,
                    start: '09:00',
                    end: '12:00',
                  },
                  {
                    label: 'Afternoon (13-17)',
                    isCustom: true,
                    start: '13:00',
                    end: '17:00',
                  },
                  {
                    label: 'Yesterday',
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

            {/* Show calculated duration */}
            {missedEntryStartTime && missedEntryEndTime && (
              <div className="rounded-lg bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Clock className="h-4 w-4" />
                  <span>Duration: </span>
                  <span className="font-medium text-foreground">
                    {(() => {
                      const start = dayjs(missedEntryStartTime);
                      const end = dayjs(missedEntryEndTime);
                      if (end.isBefore(start)) return 'Invalid time range';
                      const durationMs = end.diff(start);
                      const duration = Math.floor(durationMs / 1000);
                      return formatDuration(duration);
                    })()}
                  </span>
                </div>
              </div>
            )}

          </div>
          <div className="flex w-full flex-col-reverse gap-3 border-t px-6 pt-4 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={closeMissedEntryDialog}
              className="w-full sm:w-auto"
              disabled={isCreatingMissedEntry}
            >
              Cancel
            </Button>
            <Button
              onClick={createMissedEntry}
              disabled={
                isCreatingMissedEntry ||
                !missedEntryTitle.trim() ||
                !missedEntryStartTime ||
                !missedEntryEndTime ||
                (isStartTimeOlderThanOneDay && images.length === 0)
              }
              className="w-full sm:w-auto"
            >
              {isCreatingMissedEntry ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {isStartTimeOlderThanOneDay ? 'Submitting...' : 'Adding...'}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {isStartTimeOlderThanOneDay ? 'Submit for Approval' : 'Add Entry'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
}