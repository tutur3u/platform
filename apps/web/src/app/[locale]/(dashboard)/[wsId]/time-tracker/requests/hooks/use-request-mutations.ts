import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

interface ApproveRequestParams {
  wsId: string;
  requestId: string;
}

export function useApproveRequest() {
  const t = useTranslations('time-tracker.requests');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ wsId, requestId }: ApproveRequestParams) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${requestId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to approve request');
      }

      return response.json();
    },
    onSuccess: (_, { wsId, requestId }) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-requests', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-request', wsId, requestId],
      });

      toast.success(t('toast.approveSuccess'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('toast.approveFailed'));
    },
  });
}

interface RejectRequestParams {
  wsId: string;
  requestId: string;
  rejection_reason: string;
}

export function useRejectRequest() {
  const t = useTranslations('time-tracker.requests');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      wsId,
      requestId,
      rejection_reason,
    }: RejectRequestParams) => {
      if (!rejection_reason.trim()) {
        throw new Error(t('detail.rejectionReasonRequired'));
      }

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${requestId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reject',
            rejection_reason,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reject request');
      }

      return response.json();
    },
    onSuccess: (_, { wsId, requestId }) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-requests', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-request', wsId, requestId],
      });

      toast.success(t('toast.rejectSuccess'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('toast.rejectFailed'));
    },
  });
}

interface RequestMoreInfoParams {
  wsId: string;
  requestId: string;
  needs_info_reason: string;
}

export function useRequestMoreInfo() {
  const t = useTranslations('time-tracker.requests');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      wsId,
      requestId,
      needs_info_reason,
    }: RequestMoreInfoParams) => {
      if (!needs_info_reason.trim()) {
        throw new Error(t('detail.needsInfoReasonRequired'));
      }

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${requestId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'needs_info',
            needs_info_reason,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to request more information');
      }

      return response.json();
    },
    onSuccess: (_, { wsId, requestId }) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-requests', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-request', wsId, requestId],
      });

      toast.success(t('toast.requestInfoSuccess'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('toast.requestInfoFailed'));
    },
  });
}

interface ResubmitRequestParams {
  wsId: string;
  requestId: string;
}

export function useResubmitRequest() {
  const t = useTranslations('time-tracker.requests');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ wsId, requestId }: ResubmitRequestParams) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${requestId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resubmit' }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resubmit request');
      }

      return response.json();
    },
    onSuccess: (_, { wsId, requestId }) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-requests', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-request', wsId, requestId],
      });

      toast.success(t('toast.resubmitSuccess'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('toast.resubmitFailed'));
    },
  });
}

interface UpdateRequestParams {
  wsId: string;
  requestId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  newImages?: File[];
  removedImages?: string[];
}

export function useUpdateRequest() {
  const t = useTranslations('time-tracker.requests');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      wsId,
      requestId,
      title,
      description,
      startTime,
      endTime,
      newImages = [],
      removedImages = [],
    }: UpdateRequestParams) => {
      const formData = new FormData();
      formData.append('title', title);
      if (description) {
        formData.append('description', description);
      }
      formData.append('startTime', startTime);
      formData.append('endTime', endTime);

      // Append removed images as JSON
      if (removedImages.length > 0) {
        formData.append('removedImages', JSON.stringify(removedImages));
      }

      // Append new image files
      newImages.forEach((image, index) => {
        formData.append(`image_${index}`, image);
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${requestId}`,
        {
          method: 'PUT',
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update request');
      }

      return response.json();
    },
    onSuccess: (_, { wsId, requestId }) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-requests', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-request', wsId, requestId],
      });

      toast.success(t('toast.updateSuccess'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('toast.updateFailed'));
    },
  });
}

interface AddCommentParams {
  wsId: string;
  requestId: string;
  content: string;
}

export function useAddComment() {
  const t = useTranslations('time-tracker.requests');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, wsId, content }: AddCommentParams) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${requestId}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to post comment');
      }

      return response.json();
    },
    onSuccess: (_, { requestId, wsId }) => {
      // Invalidate comments query
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-request-comments', wsId, requestId],
      });

      toast.success(t('comments.commentPosted'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('comments.commentFailed'));
    },
  });
}

interface UpdateCommentParams {
  wsId: string;
  requestId: string;
  commentId: string;
  content: string;
}

export function useUpdateComment() {
  const t = useTranslations('time-tracker.requests');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      wsId,
      requestId,
      commentId,
      content,
    }: UpdateCommentParams) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${requestId}/comments/${commentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update comment');
      }

      return response.json();
    },
    onSuccess: (_, { requestId, wsId }) => {
      // Invalidate comments query
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-request-comments', requestId, wsId],
      });

      toast.success(t('comments.commentUpdated'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('toast.updateFailed'));
    },
  });
}

interface DeleteCommentParams {
  wsId: string;
  requestId: string;
  commentId: string;
}

export function useDeleteComment() {
  const t = useTranslations('time-tracker.requests');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ wsId, requestId, commentId }: DeleteCommentParams) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/requests/${requestId}/comments/${commentId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete comment');
      }

      return response.json();
    },
    onSuccess: (_, { requestId, wsId }) => {
      // Invalidate comments query
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-request-comments', requestId, wsId],
      });

      toast.success(t('comments.commentDeleted'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('toast.deleteFailed'));
    },
  });
}
