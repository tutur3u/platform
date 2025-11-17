'use client';

import {
  CalendarIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  Loader2,
  UserIcon,
  XCircleIcon,
  XIcon,
} from '@tuturuuu/icons';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { useCallback, useState } from 'react';
import { useApproveRequest, useRejectRequest } from './hooks/use-request-mutations';
import { useRequestImages } from './hooks/use-request-images';
import type { ExtendedTimeTrackingRequest } from './page';

interface RequestDetailModalProps {
  request: ExtendedTimeTrackingRequest;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  wsId: string;
}

export function RequestDetailModal({
  request,
  isOpen,
  onClose,
  onUpdate,
  wsId,
}: RequestDetailModalProps) {
  const t = useTranslations('time-tracker.requests');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  // React Query mutations
  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();

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

  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end.getTime() - start.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <DialogTitle className="text-xl">{request.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    request.approval_status === 'PENDING'
                      ? 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20'
                      : request.approval_status === 'APPROVED'
                        ? 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20'
                        : 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20'
                  }
                >
                  {request.approval_status}
                </Badge>
                {request.category && (
                  <Badge variant="outline" className="border-dynamic-purple/20">
                    {request.category.name}
                  </Badge>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
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
                    {format(new Date(request.created_at), 'MMM d, yyyy · h:mm a')}
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
                    {format(new Date(request.created_at), 'MMM d, yyyy · h:mm a')}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Time Info */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <CalendarIcon className="h-4 w-4" />
                <span>{t('detail.startTime')}</span>
              </div>
              <p className="font-medium">
                {format(new Date(request.start_time), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <CalendarIcon className="h-4 w-4" />
                <span>{t('detail.endTime')}</span>
              </div>
              <p className="font-medium">
                {format(new Date(request.end_time), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/20 p-4 md:col-span-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <ClockIcon className="h-4 w-4" />
                <span>{t('detail.duration')}</span>
              </div>
              <p className="font-medium">
                {calculateDuration(request.start_time, request.end_time)}
              </p>
            </div>
          </div>

          {/* Task Info */}
          {request.task && (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
              <div className="text-muted-foreground text-sm">
                {t('detail.linkedTask')}
              </div>
              <p className="font-medium">{request.task.name}</p>
            </div>
          )}

          {/* Description */}
          {request.description && (
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
          {request.images && request.images.length > 0 && (
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
                <div className="grid gap-3 sm:grid-cols-2">
                  {imageUrls.map((url, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setSelectedImageIndex(index)}
                      className="group relative overflow-hidden rounded-lg border bg-muted/10 transition-all hover:ring-2 hover:ring-dynamic-blue/50"
                    >
                      <img
                        src={url}
                        alt={`Attachment ${index + 1}`}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Approval/Rejection Info */}
          {request.approval_status === 'APPROVED' && request.approved_by_user && (
            <div className="flex items-start gap-3 rounded-lg border border-dynamic-green/20 bg-dynamic-green/5 p-4">
              <CheckCircle2Icon className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-green" />
              <div className="space-y-1">
                <p className="font-medium text-sm">{t('detail.requestApproved')}</p>
                <p className="text-muted-foreground text-xs">
                  {t('detail.approvedDate', {
                    name: request.approved_by_user.display_name,
                    date: request.approved_at
                      ? format(new Date(request.approved_at), 'MMM d, yyyy · h:mm a')
                      : '',
                  })}
                </p>
              </div>
            </div>
          )}

          {request.approval_status === 'REJECTED' &&
            request.rejected_by_user &&
            request.rejection_reason && (
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
                  <p className="font-medium text-sm">{t('detail.rejectionReason')}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                    {request.rejection_reason}
                  </p>
                </div>
              </div>
            )}

          {/* Action Buttons */}
          {request.approval_status === 'PENDING' && (
            <>
              {!showRejectionForm ? (
                <div className="flex gap-3">
                  <Button
                    onClick={handleApprove}
                    disabled={approveMutation.isPending}
                    className="flex-1 bg-dynamic-green hover:bg-dynamic-green/90"
                  >
                    {approveMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <CheckCircle2Icon className="mr-2 h-4 w-4" />
                    {t('detail.approveButton')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectionForm(true)}
                    className="flex-1"
                  >
                    <XCircleIcon className="mr-2 h-4 w-4" />
                    {t('detail.rejectButton')}
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
                    disabled={rejectMutation.isPending || !rejectionReason.trim()}
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
          )}
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

          {imageUrls[(selectedImageIndex as number)] && (
            <div className="space-y-4">
              <div className="flex items-center justify-center overflow-hidden rounded-lg bg-muted/10">
                <img
                  src={imageUrls[(selectedImageIndex as number)]}
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

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {Array.from({ length: imageUrls.length }).map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedImageIndex(idx)}
                        className={`h-2 w-2 rounded-full transition-all ${
                          idx === selectedImageIndex
                            ? 'bg-dynamic-blue w-4'
                            : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                        }`}
                      />
                    ))}
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
