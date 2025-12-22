'use client';

import {
  CalendarIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  EditIcon,
  InfoIcon,
  Loader2,
  UserIcon,
  XCircleIcon,
  XIcon,
} from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useImageUpload } from '../hooks/use-image-upload';
import { ImageUploadSection } from './components/image-upload-section';
import { useRequestImages } from './hooks/use-request-images';
import {
  useApproveRequest,
  useRejectRequest,
  useRequestMoreInfo,
  useResubmitRequest,
  useUpdateRequest,
} from './hooks/use-request-mutations';
import type { ExtendedTimeTrackingRequest } from './page';
import { STATUS_COLORS, STATUS_LABELS } from './utils';

dayjs.extend(utc);
dayjs.extend(timezone);

interface RequestDetailModalProps {
  request: ExtendedTimeTrackingRequest;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  wsId: string;
  bypassRulesPermission: boolean;
  currentUser: WorkspaceUser | null;
}

export function RequestDetailModal({
  request,
  isOpen,
  onClose,
  onUpdate,
  wsId,
  bypassRulesPermission,
  currentUser,
}: RequestDetailModalProps) {
  const t = useTranslations('time-tracker.requests');
  const tTracker = useTranslations('time-tracker');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  const [needsInfoReason, setNeedsInfoReason] = useState('');
  const [showNeedsInfoForm, setShowNeedsInfoForm] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null
  );

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState(request.title);
  const [editDescription, setEditDescription] = useState(
    request.description || ''
  );
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // React Query mutations
  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();
  const requestInfoMutation = useRequestMoreInfo();
  const resubmitMutation = useResubmitRequest();
  const updateMutation = useUpdateRequest();

  // Fetch images with React Query
  const { data: imageUrls = [], isLoading: isLoadingImages } = useRequestImages(
    request.id,
    request.images,
    isOpen
  );

  const handleApprove = useCallback(async () => {
    await approveMutation.mutateAsync(
      { wsId, requestId: request.id },
      {
        onSuccess: () => {
          onUpdate?.();
          onClose();
        },
      }
    );
  }, [request.id, wsId, onUpdate, onClose, approveMutation]);

  const handleReject = useCallback(async () => {
    if (!rejectionReason.trim()) {
      // Toast error will be shown by mutation
      return;
    }

    await rejectMutation.mutateAsync(
      {
        wsId,
        requestId: request.id,
        rejection_reason: rejectionReason.trim(),
      },
      {
        onSuccess: () => {
          setRejectionReason('');
          setShowRejectionForm(false);
          onUpdate?.();
          onClose();
        },
      }
    );
  }, [request.id, wsId, rejectionReason, onUpdate, onClose, rejectMutation]);

  const handleRequestMoreInfo = useCallback(async () => {
    if (!needsInfoReason.trim()) {
      return;
    }

    await requestInfoMutation.mutateAsync(
      {
        wsId,
        requestId: request.id,
        needs_info_reason: needsInfoReason.trim(),
      },
      {
        onSuccess: () => {
          setNeedsInfoReason('');
          setShowNeedsInfoForm(false);
          onUpdate?.();
          onClose();
        },
      }
    );
  }, [request.id, wsId, needsInfoReason, onUpdate, onClose, requestInfoMutation]);

  const handleResubmit = useCallback(async () => {
    await resubmitMutation.mutateAsync(
      {
        wsId,
        requestId: request.id,
      },
      {
        onSuccess: () => {
          onUpdate?.();
          onClose();
        },
      }
    );
  }, [request.id, wsId, onUpdate, onClose, resubmitMutation]);

  // Image upload hook for edit mode
  const imageUpload = useImageUpload({ maxImages: 5 });

  // Determine if user can edit (owner + status is PENDING or NEEDS_INFO)
  const canEdit =
    currentUser &&
    request.user_id === currentUser.id &&
    (request.approval_status === 'PENDING' ||
      request.approval_status === 'NEEDS_INFO');

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
    // This is critical because removedImages comparison uses request.images (paths)
    imageUpload.setExistingImages(request.images || []);
  }, [request, imageUpload]);

  // Create a mapping of storage paths to signed URLs for display
  // imageUpload.existingImages contains storage paths (for removal tracking)
  // but we need signed URLs for display
  const existingImageUrlsForDisplay = imageUpload.existingImages
    .map((path) => {
      const index = (request.images || []).indexOf(path);
      return index !== -1 ? imageUrls[index] : null;
    })
    .filter((url): url is string => url !== null);

  // Track if there are unsaved changes in edit mode
  const hasUnsavedChanges = useMemo(() => {
    if (!isEditMode) return false;

    // Check if any field has changed
    const titleChanged = editTitle !== request.title;
    const descriptionChanged = editDescription !== (request.description || '');
    
    // Check time changes (compare in local timezone)
    const userTz = dayjs.tz.guess();
    const originalStartLocal = dayjs.utc(request.start_time).tz(userTz).format('YYYY-MM-DDTHH:mm');
    const originalEndLocal = dayjs.utc(request.end_time).tz(userTz).format('YYYY-MM-DDTHH:mm');
    const timeChanged = editStartTime !== originalStartLocal || editEndTime !== originalEndLocal;

    // Check image changes
    const imagesChanged = imageUpload.images.length > 0 || 
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

  const calculateDuration = useCallback((startTime: string, endTime: string) => {
    if (!startTime || !endTime) return '0h 0m';
    const start = dayjs(startTime);
    const end = dayjs(endTime);
    if (!start.isValid() || !end.isValid()) return '0h 0m';

    const diffSeconds = end.diff(start, 'second');
    if (diffSeconds < 0) return '0h 0m';

    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setShowRejectionForm(false);
      setRejectionReason('');
      setShowNeedsInfoForm(false);
      setNeedsInfoReason('');
      setSelectedImageIndex(null);
    }
  }, [isOpen]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-h-[90vh] md:max-w-6xl overflow-y-auto"
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
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <DialogTitle className="text-xl">{request.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn('border font-medium text-xs', STATUS_COLORS[request.approval_status])}
                  >
                    {t(`status.${request.approval_status.toLowerCase() as keyof typeof STATUS_LABELS}`)}
                  </Badge>
                  {request.category ? (
                    <Badge
                      variant="outline"
                      className="border-dynamic-purple/20"
                    >
                      {request.category.name}
                    </Badge>
                  ) : null}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_400px]">
            {/* Left Column - Main Content */}
            <div className="order-2 space-y-6 lg:order-1">
            {/* User Info */}
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
              {request.user ? (
                <>
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarImage src={request.user.avatar_url || ''} />
                    <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple font-semibold text-white">
                      {request.user.display_name?.[0] ||
                        request.user.user_private_details.email?.[0] ||
                        'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-foreground">
                      {request.user.display_name || 'Unknown User'}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {request.user.user_private_details.email}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {format(
                        new Date(request.created_at),
                        'MMM d, yyyy · h:mm a'
                      )}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple font-semibold text-white">
                      <UserIcon className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-foreground">Unknown User</p>
                    <p className="text-muted-foreground text-xs">
                      {format(
                        new Date(request.created_at),
                        'MMM d, yyyy · h:mm a'
                      )}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Edit Mode UI */}
            {isEditMode && (
              <div className="space-y-4 rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/5 p-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">{t('detail.titleLabel')}</Label>
                  <Input
                    id="edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder={t('detail.titleLabel')}
                    disabled={updateMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-description">
                    {t('detail.descriptionLabel')}
                  </Label>
                  <Textarea
                    id="edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t('detail.descriptionLabel')}
                    rows={3}
                    disabled={updateMutation.isPending}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-start-time">
                      {t('detail.startTime')}
                    </Label>
                    <Input
                      id="edit-start-time"
                      type="datetime-local"
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                      disabled={updateMutation.isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-end-time">{t('detail.endTime')}</Label>
                    <Input
                      id="edit-end-time"
                      type="datetime-local"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                      disabled={updateMutation.isPending}
                    />
                  </div>

                  <div className="flex items-center gap-4 md:col-span-2">
                    <div className="h-px flex-1 bg-linear-to-r from-transparent via-border to-transparent" />
                    <Badge
                      variant="outline"
                      className="border-dynamic-blue/30 bg-dynamic-blue/5 px-3 py-1 font-semibold text-dynamic-blue"
                    >
                      <ClockIcon className="mr-1.5 h-3.5 w-3.5" />
                      {calculateDuration(editStartTime, editEndTime)}
                    </Badge>
                    <div className="h-px flex-1 bg-linear-to-r from-transparent via-border to-transparent" />
                  </div>
                </div>

                {/* Image Upload Section */}
                <ImageUploadSection
                  images={imageUpload.images}
                  imagePreviews={imageUpload.imagePreviews}
                  existingImageUrls={existingImageUrlsForDisplay}
                  isCompressing={imageUpload.isCompressing}
                  isDragOver={imageUpload.isDragOver}
                  imageError={imageUpload.imageError}
                  disabled={updateMutation.isPending}
                  canAddMore={imageUpload.canAddMoreImages}
                  maxImages={5}
                  totalCount={imageUpload.totalImageCount}
                  fileInputRef={imageUpload.fileInputRef}
                  onDragOver={imageUpload.handleDragOver}
                  onDragLeave={imageUpload.handleDragLeave}
                  onDrop={imageUpload.handleDrop}
                  onFileChange={imageUpload.handleImageUpload}
                  onRemoveNew={imageUpload.removeImage}
                  onRemoveExisting={imageUpload.removeExistingImage}
                  labels={{
                    proofOfWork: t('detail.addMoreImages', {
                      current: imageUpload.totalImageCount,
                      max: 5,
                    }),
                    compressing: tTracker('missed_entry_dialog.approval.compressing'),
                    dropImages: tTracker('missed_entry_dialog.approval.dropImages'),
                    clickToUpload: tTracker(
                      'missed_entry_dialog.approval.clickToUpload'
                    ),
                    imageFormats: tTracker('missed_entry_dialog.approval.imageFormats'),
                    proofImageAlt: tTracker('missed_entry_dialog.approval.proofImageAlt'),
                    existing: t('detail.existingImage'),
                    new: t('detail.newImage'),
                  }}
                />

                {/* Save/Cancel Buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveChanges}
                    disabled={updateMutation.isPending || !editTitle.trim()}
                    className="flex-1"
                  >
                    {updateMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('detail.saveButton')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={updateMutation.isPending}
                  >
                    {t('detail.cancelEditButton')}
                  </Button>
                </div>
              </div>
            )}

            {/* View Mode - Time Info */}
            {!isEditMode && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-semibold uppercase tracking-wider">
                    <CalendarIcon className="h-4 w-4" />
                    <span>{t('detail.startTime')}</span>
                  </div>
                  <p className="font-medium">
                    {format(new Date(request.start_time), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
                <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-semibold uppercase tracking-wider">
                    <CalendarIcon className="h-4 w-4" />
                    <span>{t('detail.endTime')}</span>
                  </div>
                  <p className="font-medium">
                    {format(new Date(request.end_time), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>

                <div className="flex items-center gap-4 sm:grid-cols-2 sm:col-span-2">
                  <div className="h-px flex-1 bg-linear-to-r from-transparent via-border to-transparent" />
                  <Badge
                    variant="outline"
                    className="border-dynamic-blue/30 bg-dynamic-blue/5 px-3 py-1 font-semibold text-dynamic-blue"
                  >
                    <ClockIcon className="mr-1.5 h-3.5 w-3.5" />
                    {calculateDuration(request.start_time, request.end_time)}
                  </Badge>
                  <div className="h-px flex-1 bg-linear-to-r from-transparent via-border to-transparent" />
                </div>
              </div>
            )}

            {/* Task Info */}
            {!isEditMode && request.task ? (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                <div className="text-muted-foreground text-sm">
                  {t('detail.linkedTask')}
                </div>
                <p className="font-medium">{request.task.name}</p>
              </div>
            ) : null}

            {/* Description */}
            {!isEditMode && request.description && (
              <div className="space-y-3">
                <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">
                  {t('detail.description')}
                </h2>
                <div className="rounded-lg border bg-muted/10 p-4">
                  <p className="whitespace-pre-wrap text-foreground text-sm leading-relaxed">
                    {request.description}
                  </p>
                </div>
              </div>
            )}

            {/* Attachments */}
            {!isEditMode && request.images && request.images.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">
                    {t('detail.attachments', { count: request.images.length })}
                  </h2>
                </div>
                {isLoadingImages ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/20 py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      {t('detail.loadingMedia')}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {imageUrls.map((url, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setSelectedImageIndex(index)}
                        className="group relative h-48 overflow-hidden rounded-lg border bg-muted/10 transition-all hover:ring-2 hover:ring-dynamic-blue/50"
                      >
                        <img
                          src={url}
                          alt={`Attachment ${index + 1}`}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
            {/* End Left Column */}

            {/* Right Column - Status & Actions */}
            <div className="order-1 space-y-4 lg:order-2">
              {/* Edit button for request owner */}
              {canEdit && !isEditMode && (
                <Button
                  variant="outline"
                  onClick={handleEnterEditMode}
                  className="w-full"
                >
                  <EditIcon className="mr-2 h-4 w-4" />
                  {t('detail.editButton')}
                </Button>
              )}

              {/* Approval/Rejection Info */}
              {request.approval_status === 'APPROVED' &&
                request.approved_by_user ? (
                  <div className="flex items-start gap-3 rounded-lg border border-dynamic-green/20 bg-dynamic-green/5 p-4">
                    <CheckCircle2Icon className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-green" />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">
                        {t('detail.requestApproved')}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {t('detail.approvedDate', {
                          name: request.approved_by_user.display_name,
                          date: request.approved_at
                            ? format(
                                new Date(request.approved_at),
                                'MMM d, yyyy · h:mm a'
                              )
                            : '',
                        })}
                      </p>
                    </div>
                  </div>
                ) : null}

              {request.approval_status === 'REJECTED' &&
                request.rejected_by_user &&
                request.rejection_reason ? (
                  <div className="space-y-3 rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-4">
                    <div className="flex items-start gap-3">
                      <XCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-red" />
                      <div className="space-y-1">
                        <p className="font-medium text-sm">
                          {t('detail.requestRejected')}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {t('detail.rejectedDate', {
                            name: request.rejected_by_user.display_name,
                            date: request.rejected_at
                              ? format(
                                  new Date(request.rejected_at),
                                  'MMM d, yyyy · h:mm a'
                                )
                              : '',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-sm">
                        {t('detail.rejectionReason')}
                      </p>
                      <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                        {request.rejection_reason}
                      </p>
                    </div>
                  </div>
                ) : null}

              {/* NEEDS_INFO Status Display */}
              {request.approval_status === 'NEEDS_INFO' &&
                request.needs_info_requested_by_user &&
                request.needs_info_reason ? (
                  <div className="space-y-3 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
                    <div className="flex items-start gap-3">
                      <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-blue" />
                      <div className="space-y-1">
                        <p className="font-medium text-sm">
                          {t('detail.requestNeedsInfo')}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {t('detail.needsInfoDate', {
                            name: request.needs_info_requested_by_user.display_name,
                            date: request.needs_info_requested_at
                              ? format(
                                  new Date(request.needs_info_requested_at),
                                  'MMM d, yyyy · h:mm a'
                                )
                              : '',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-sm">
                        {t('detail.needsInfoReason')}
                      </p>
                      <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                        {request.needs_info_reason}
                      </p>
                    </div>
                  </div>
                ) : null}

              {/* Resubmit Button for Request Owner */}
              {request.approval_status === 'NEEDS_INFO' &&
                currentUser &&
                request.user_id === currentUser.id ? (
                  <div className="space-y-2">
                    <Button
                      onClick={handleResubmit}
                      disabled={resubmitMutation.isPending}
                      className="w-full bg-dynamic-blue hover:bg-dynamic-blue/90"
                    >
                      {resubmitMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <CheckCircle2Icon className="mr-2 h-4 w-4" />
                      {t('detail.resubmitButton')}
                    </Button>
                  </div>
                ) : null}

              {/* Action Buttons */}
              {request.approval_status === 'PENDING' &&
                (bypassRulesPermission ||
                  (currentUser && request.user_id !== currentUser.id)) ? (
                  <>
                    {!showRejectionForm && !showNeedsInfoForm ? (
                      <div className="space-y-2">
                        <Button
                          onClick={handleApprove}
                          disabled={approveMutation.isPending}
                          className="w-full bg-dynamic-green hover:bg-dynamic-green/90"
                        >
                          {approveMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          <CheckCircle2Icon className="mr-2 h-4 w-4" />
                          {t('detail.approveButton')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowNeedsInfoForm(true)}
                          className="w-full border-dynamic-blue/20 hover:bg-dynamic-blue/90 bg-dynamic-blue"
                        >
                          <InfoIcon className="mr-2 h-4 w-4" />
                          <span className="truncate">{t('detail.requestInfoButton')}</span>
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => setShowRejectionForm(true)}
                          className="w-full"
                        >
                          <XCircleIcon className="mr-2 h-4 w-4" />
                          {t('detail.rejectButton')}
                        </Button>
                      </div>
                    ) : showNeedsInfoForm ? (
                      <div className="space-y-3 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">
                            {t('detail.needsInfoReasonLabel')}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowNeedsInfoForm(false);
                              setNeedsInfoReason('');
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <XIcon className="h-4 w-4" />
                          </Button>
                        </div>
                        <Textarea
                          placeholder={t('detail.needsInfoReasonPlaceholder')}
                          value={needsInfoReason}
                          onChange={(e) => setNeedsInfoReason(e.target.value)}
                          className="min-h-24"
                        />
                        <Button
                          onClick={handleRequestMoreInfo}
                          disabled={
                            requestInfoMutation.isPending || !needsInfoReason.trim()
                          }
                          className="w-full bg-dynamic-blue hover:bg-dynamic-blue/90"
                        >
                          {requestInfoMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {t('detail.confirmRequestInfo')}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-4">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">
                            {t('detail.rejectionReasonLabel')}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowRejectionForm(false);
                              setRejectionReason('');
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <XIcon className="h-4 w-4" />
                          </Button>
                        </div>
                        <Textarea
                          placeholder={t('detail.rejectionReasonPlaceholder')}
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          className="min-h-24"
                        />
                        <Button
                          variant="destructive"
                          onClick={handleReject}
                          disabled={
                            rejectMutation.isPending || !rejectionReason.trim()
                          }
                          className="w-full"
                        >
                          {rejectMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {t('detail.confirmRejection')}
                        </Button>
                      </div>
                    )}
                  </>
                ) : null}
            </div>
            {/* End Right Column */}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      {selectedImageIndex !== null ? (
        <Dialog
          open={true}
          onOpenChange={(open) => !open && setSelectedImageIndex(null)}
        >
          <DialogContent className="max-h-[90vh] max-w-4xl">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>
                  {t('detail.imageNavigation', {
                    current: (selectedImageIndex as number) + 1,
                    total: imageUrls.length,
                  })}
                </DialogTitle>
              </div>
            </DialogHeader>

            {imageUrls[selectedImageIndex as number] && (
              <div className="space-y-4">
                <div className="flex items-center justify-center overflow-hidden rounded-lg bg-muted/10">
                  <img
                    src={imageUrls[selectedImageIndex as number]}
                    alt={`Full view - Attachment ${(selectedImageIndex as number) + 1}`}
                    className="max-h-[60vh] w-auto object-contain"
                  />
                </div>

                {imageUrls.length > 1 && (
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const current = selectedImageIndex as number;
                        if (current === 0) {
                          setSelectedImageIndex(imageUrls.length - 1);
                        } else {
                          setSelectedImageIndex(current - 1);
                        }
                      }}
                      className="flex-1"
                    >
                      <ChevronLeftIcon className="mr-2 h-4 w-4" />
                      {t('detail.previousImage')}
                    </Button>

                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      {Array.from({ length: imageUrls.length }).map(
                        (_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedImageIndex(idx)}
                            className={`h-2 w-2 rounded-full transition-all ${
                              idx === selectedImageIndex
                                ? 'w-4 bg-dynamic-blue'
                                : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                            }`}
                          />
                        )
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const current = selectedImageIndex as number;
                        if (current === imageUrls.length - 1) {
                          setSelectedImageIndex(0);
                        } else {
                          setSelectedImageIndex(current + 1);
                        }
                      }}
                      className="flex-1"
                    >
                      {t('detail.nextImage')}
                      <ChevronRightIcon className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
