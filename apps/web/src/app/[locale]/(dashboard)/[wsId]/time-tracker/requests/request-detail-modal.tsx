'use client';

import { useQuery } from '@tanstack/react-query';
import { EditIcon } from '@tuturuuu/icons';
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
import { ActionButtons } from './components/action-buttons';
import { ActivityTimeline } from './components/activity-timeline';
import { ApprovalStatusCard } from './components/approval-status-card';
import { CommentList } from './components/comment-list';
import { ImagePreviewDialog } from './components/image-preview-dialog';
import { RequestEditForm } from './components/request-edit-form';
import { RequestViewMode } from './components/request-view-mode';
import { UserInfoCard } from './components/user-info-card';
import { useRequestActions } from './hooks/use-request-actions';
import { useRequestEditMode } from './hooks/use-request-edit-mode';
import { useRequestImages } from './hooks/use-request-images';
import type { ExtendedTimeTrackingRequest } from './page';
import {
  getCategoryColorClasses,
  getStatusColorClasses,
  type STATUS_LABELS,
} from './utils';

interface RequestDetailModalProps {
  request: ExtendedTimeTrackingRequest;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  wsId: string;
  canManageTimeTrackingRequests: boolean;
  canBypassTimeTrackingRequestApproval: boolean;
  currentUser: WorkspaceUser | null;
}

export function RequestDetailModal({
  request,
  isOpen,
  onClose,
  onUpdate,
  wsId,
  canManageTimeTrackingRequests,
  canBypassTimeTrackingRequestApproval,
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

  const { resetForms } = actions;

  useEffect(() => {
    if (!isOpen) {
      resetForms();
      setSelectedImageIndex(null);
    }
  }, [isOpen, resetForms]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto md:max-w-6xl"
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
                      getStatusColorClasses(request.approval_status)
                    )}
                  >
                    {t(
                      `status.${request.approval_status.toLowerCase() as keyof typeof STATUS_LABELS}`
                    )}
                  </Badge>
                  {request.category ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        'border font-medium text-xs',
                        getCategoryColorClasses(request.category.color)
                      )}
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
                canBypassTimeTrackingRequestApproval={
                  canBypassTimeTrackingRequestApproval
                }
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
