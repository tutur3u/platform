import { useCallback, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useUpdateRequest } from './use-request-mutations';
import type { ExtendedTimeTrackingRequest } from '../page';
import { useImageUpload } from '../../hooks/use-image-upload';

dayjs.extend(utc);
dayjs.extend(timezone);

interface UseRequestEditModeProps {
  request: ExtendedTimeTrackingRequest;
  wsId: string;
  imageUrls: string[];
  onUpdate?: () => void;
}

export function useRequestEditMode({
  request,
  wsId,
  imageUrls,
  onUpdate,
}: UseRequestEditModeProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState(request.title);
  const [editDescription, setEditDescription] = useState(
    request.description || ''
  );
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  const updateMutation = useUpdateRequest();
  const imageUpload = useImageUpload({maxImages: 5});

  const handleEnterEditMode = useCallback(() => {
    setIsEditMode(true);
    setEditTitle(request.title);
    setEditDescription(request.description || '');

    // Convert UTC times to local datetime-local format
    const userTz = dayjs.tz.guess();
    const startLocal = dayjs.utc(request.start_time).tz(userTz);
    const endLocal = dayjs.utc(request.end_time).tz(userTz);

    setEditStartTime(startLocal.format('YYYY-MM-DDTHH:mm'));
    setEditEndTime(endLocal.format('YYYY-MM-DDTHH:mm'));

    // Set existing images using storage paths, not signed URLs
    imageUpload.setExistingImages(request.images || []);
  }, [request, imageUpload]);

  const handleCancelEdit = useCallback(() => {
    setIsEditMode(false);
    imageUpload.clearImages();
  }, [imageUpload]);

  const handleSaveChanges = useCallback(async () => {
    if (!editTitle.trim()) {
      return;
    }

    const userTz = dayjs.tz.guess();
    const startTimeUtc = dayjs.tz(editStartTime, userTz).utc().toISOString();
    const endTimeUtc = dayjs.tz(editEndTime, userTz).utc().toISOString();

    // Determine which existing images were removed
    const removedImages = (request.images || []).filter(
      (img) => !imageUpload.existingImages.includes(img)
    );

    await updateMutation.mutateAsync(
      {
        wsId,
        requestId: request.id,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        startTime: startTimeUtc,
        endTime: endTimeUtc,
        newImages: imageUpload.images,
        removedImages,
      },
      {
        onSuccess: () => {
          setIsEditMode(false);
          imageUpload.clearImages();
          onUpdate?.();
        },
      }
    );
  }, [
    editTitle,
    editDescription,
    editStartTime,
    editEndTime,
    request.id,
    request.images,
    wsId,
    imageUpload,
    updateMutation,
    onUpdate,
  ]);

  // Create a mapping of storage paths to signed URLs for display
  const existingImageUrlsForDisplay = useMemo(
    () =>
      imageUpload.existingImages
        .map((path) => {
          const index = (request.images || []).indexOf(path);
          return index !== -1 ? imageUrls[index] : null;
        })
        .filter((url): url is string => url !== null),
    [imageUpload.existingImages, request.images, imageUrls]
  );

  // Track if there are unsaved changes in edit mode
  const hasUnsavedChanges = useMemo(() => {
    if (!isEditMode) return false;

    // Check if any field has changed
    const titleChanged = editTitle !== request.title;
    const descriptionChanged = editDescription !== (request.description || '');

    // Check time changes (compare in local timezone)
    const userTz = dayjs.tz.guess();
    const originalStartLocal = dayjs
      .utc(request.start_time)
      .tz(userTz)
      .format('YYYY-MM-DDTHH:mm');
    const originalEndLocal = dayjs
      .utc(request.end_time)
      .tz(userTz)
      .format('YYYY-MM-DDTHH:mm');
    const timeChanged =
      editStartTime !== originalStartLocal || editEndTime !== originalEndLocal;

    // Check image changes
    const imagesChanged =
      imageUpload.images.length > 0 ||
      imageUpload.existingImages.length !== (request.images?.length || 0);

    return titleChanged || descriptionChanged || timeChanged || imagesChanged;
  }, [
    isEditMode,
    editTitle,
    editDescription,
    editStartTime,
    editEndTime,
    request.title,
    request.description,
    request.start_time,
    request.end_time,
    request.images,
    imageUpload.images.length,
    imageUpload.existingImages.length,
  ]);

  return {
    isEditMode,
    setIsEditMode,
    editTitle,
    setEditTitle,
    editDescription,
    setEditDescription,
    editStartTime,
    setEditStartTime,
    editEndTime,
    setEditEndTime,
    imageUpload,
    existingImageUrlsForDisplay,
    hasUnsavedChanges,
    updateMutation,
    handleEnterEditMode,
    handleCancelEdit,
    handleSaveChanges,
  };
}
