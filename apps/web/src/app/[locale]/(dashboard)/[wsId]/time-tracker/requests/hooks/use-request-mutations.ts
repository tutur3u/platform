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

