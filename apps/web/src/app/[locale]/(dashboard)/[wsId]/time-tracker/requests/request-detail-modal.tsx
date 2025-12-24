'use client';

import { EditIcon, Loader2 } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CommentList } from './components/comment-list';
import { ActivityTimeline } from './components/activity-timeline';
import { UserInfoCard } from './components/user-info-card';
import { RequestEditForm } from './components/request-edit-form';
import { RequestViewMode } from './components/request-view-mode';
import { ApprovalStatusCard } from './components/approval-status-card';
import { ActionButtons } from './components/action-buttons';
import { ImagePreviewDialog } from './components/image-preview-dialog';
import { useRequestImages } from './hooks/use-request-images';
import { useRequestActions } from './hooks/use-request-actions';
import { useRequestEditMode } from './hooks/use-request-edit-mode';
import type { ExtendedTimeTrackingRequest } from './page';
import { STATUS_COLORS, STATUS_LABELS } from './utils';

interface RequestDetailModalProps {
  request: ExtendedTimeTrackingRequest;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  wsId: string;
  canManageTimeTrackingRequests: boolean;
  currentUser: WorkspaceUser | null;
}

export function RequestDetailModal({
  request,
  isOpen,
  onClose,
  onUpdate,
  wsId,
  canManageTimeTrackingRequests,
  currentUser,
}: RequestDetailModalProps) {
  const t = useTranslations('time-tracker.requests');
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null
  );
  const [activityPage, setActivityPage] = useState(1);
  const [activityItemsPerPage, setActivityItemsPerPage] = useState(3);

  // Determine if user can edit (owner + status is PENDING or NEEDS_INFO)
  const canEdit =
    currentUser &&
    request.user_id === currentUser.id &&
    (request.approval_status === 'PENDING' ||
      request.approval_status === 'NEEDS_INFO');

  // Determine if user can view comments
  const canViewComments =
    (currentUser && request.user_id === currentUser.id) ||
    canManageTimeTrackingRequests;

  // Fetch images with React Query
  const { data: imageUrls = [], isLoading: isLoadingImages } = useRequestImages(
    request.id,
    request.images,
    isOpen
  );

  // Fetch activity log with React Query
  const { data: activityData, isLoading: isLoadingActivity } = useQuery({
    queryKey: [
      'time-tracking-request-activity',
      request.id,
      activityPage,
      activityItemsPerPage,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(activityPage),
        limit: String(activityItemsPerPage),
      });
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${request.id}/activity?${params}`
      );
      if (!res.ok) throw new Error('Failed to fetch activity');
      const json = await res.json();
      return json;
    },
    enabled: isOpen && canViewComments,
  });

  // Edit mode hook
  const editMode = useRequestEditMode({
    request,
    wsId,
    imageUrls,
    onUpdate,
  });

  // Actions hook
  const actions = useRequestActions({
    wsId,
    requestId: request.id,
    onSuccess: onUpdate,
    onClose,
  });

  useEffect(() => {
    if (!isOpen) {
      actions.resetForms();
      setSelectedImageIndex(null);
    }
  }, [isOpen, actions]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-h-[90vh] md:max-w-6xl overflow-y-auto"
          onPointerDownOutside={(e) => {
            if (editMode.hasUnsavedChanges) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (editMode.hasUnsavedChanges) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            if (editMode.hasUnsavedChanges) {
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
                    className={cn(
                      'border font-medium text-xs',
                      STATUS_COLORS[request.approval_status]
                    )}
                  >
                    {t(
                      `status.${request.approval_status.toLowerCase() as keyof typeof STATUS_LABELS}`
                    )}
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

          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
            {/* Left Column - Main Content */}
            <div className="order-2 space-y-6 lg:order-1">
              {/* User Info */}
              <UserInfoCard request={request} />

              {/* Edit Mode UI */}
              {editMode.isEditMode && (
                <RequestEditForm
                  editTitle={editMode.editTitle}
                  setEditTitle={editMode.setEditTitle}
                  editDescription={editMode.editDescription}
                  setEditDescription={editMode.setEditDescription}
                  editStartTime={editMode.editStartTime}
                  setEditStartTime={editMode.setEditStartTime}
                  editEndTime={editMode.editEndTime}
                  setEditEndTime={editMode.setEditEndTime}
                  imageUpload={editMode.imageUpload}
                  existingImageUrlsForDisplay={
                    editMode.existingImageUrlsForDisplay
                  }
                  isUpdating={editMode.updateMutation.isPending}
                  onSave={editMode.handleSaveChanges}
                  onCancel={editMode.handleCancelEdit}
                />
              )}

              {/* View Mode */}
              {!editMode.isEditMode && (
                <RequestViewMode
                  request={request}
                  imageUrls={imageUrls}
                  isLoadingImages={isLoadingImages}
                  onImageClick={setSelectedImageIndex}
                />
              )}
            </div>
            {/* End Left Column */}

            {/* Right Column - Status & Actions */}
            <div className="order-1 space-y-4 lg:order-2">
              {/* Edit button for request owner */}
              {canEdit && !editMode.isEditMode && (
                <Button
                  variant="outline"
                  onClick={editMode.handleEnterEditMode}
                  className="w-full"
                >
                  <EditIcon className="mr-2 h-4 w-4" />
                  {t('detail.editButton')}
                </Button>
              )}

              {/* Approval/Rejection/Needs Info Display */}
              <ApprovalStatusCard request={request} />

              {/* Action Buttons */}
              <ActionButtons
                request={request}
                currentUser={currentUser}
                canManageTimeTrackingRequests={canManageTimeTrackingRequests}
                isApproving={actions.approveMutation.isPending}
                onApprove={actions.handleApprove}
                showRejectionForm={actions.showRejectionForm}
                rejectionReason={actions.rejectionReason}
                setRejectionReason={actions.setRejectionReason}
                setShowRejectionForm={actions.setShowRejectionForm}
                isRejecting={actions.rejectMutation.isPending}
                onReject={actions.handleReject}
                showNeedsInfoForm={actions.showNeedsInfoForm}
                needsInfoReason={actions.needsInfoReason}
                setNeedsInfoReason={actions.setNeedsInfoReason}
                setShowNeedsInfoForm={actions.setShowNeedsInfoForm}
                isRequestingInfo={actions.requestInfoMutation.isPending}
                onRequestMoreInfo={actions.handleRequestMoreInfo}
                isResubmitting={actions.resubmitMutation.isPending}
                onResubmit={actions.handleResubmit}
              />

              {/* Comments Section */}
              {!editMode.isEditMode && (
                <CommentList
                  requestId={request.id}
                  wsId={wsId}
                  currentUser={currentUser}
                  canViewComments={canViewComments}
                  hasManagePermission={canManageTimeTrackingRequests}
                />
              )}

              {/* Activity Timeline Section */}
              {!editMode.isEditMode && canViewComments && (
                <div className="rounded-lg border border-dynamic-border bg-dynamic-surface/30 p-4">
                  {isLoadingActivity ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
                    </div>
                  ) : (
                    <ActivityTimeline
                      activities={activityData?.data || []}
                      currentPage={activityPage}
                      onPageChange={setActivityPage}
                      itemsPerPage={activityItemsPerPage}
                      onItemsPerPageChange={setActivityItemsPerPage}
                      totalCount={activityData?.total || 0}
                      isLoading={isLoadingActivity}
                    />
                  )}
                </div>
              )}
            </div>
            {/* End Right Column */}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <ImagePreviewDialog
        isOpen={selectedImageIndex !== null}
        selectedImageIndex={selectedImageIndex}
        imageUrls={imageUrls}
        onClose={() => setSelectedImageIndex(null)}
        onNavigate={setSelectedImageIndex}
      />
    </>
  );
}
