import { useCallback, useState } from 'react';
import {
  useApproveRequest,
  useRejectRequest,
  useRequestMoreInfo,
  useResubmitRequest,
} from './use-request-mutations';

interface UseRequestActionsProps {
  wsId: string;
  requestId: string;
  onSuccess?: () => void;
  onClose: () => void;
}

export function useRequestActions({
  wsId,
  requestId,
  onSuccess,
  onClose,
}: UseRequestActionsProps) {
  // Rejection state
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);

  // Needs info state
  const [needsInfoReason, setNeedsInfoReason] = useState('');
  const [showNeedsInfoForm, setShowNeedsInfoForm] = useState(false);

  // Mutations
  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();
  const requestInfoMutation = useRequestMoreInfo();
  const resubmitMutation = useResubmitRequest();

  const handleApprove = useCallback(async () => {
    await approveMutation.mutateAsync(
      { wsId, requestId },
      {
        onSuccess: () => {
          onSuccess?.();
          onClose();
        },
      }
    );
  }, [requestId, wsId, onSuccess, onClose, approveMutation]);

  const handleReject = useCallback(async () => {
    if (!rejectionReason.trim()) {
      return;
    }

    await rejectMutation.mutateAsync(
      {
        wsId,
        requestId,
        rejection_reason: rejectionReason.trim(),
      },
      {
        onSuccess: () => {
          setRejectionReason('');
          setShowRejectionForm(false);
          onSuccess?.();
          onClose();
        },
      }
    );
  }, [requestId, wsId, rejectionReason, onSuccess, onClose, rejectMutation]);

  const handleRequestMoreInfo = useCallback(async () => {
    if (!needsInfoReason.trim()) {
      return;
    }

    await requestInfoMutation.mutateAsync(
      {
        wsId,
        requestId,
        needs_info_reason: needsInfoReason.trim(),
      },
      {
        onSuccess: () => {
          setNeedsInfoReason('');
          setShowNeedsInfoForm(false);
          onSuccess?.();
          onClose();
        },
      }
    );
  }, [requestId, wsId, needsInfoReason, onSuccess, onClose, requestInfoMutation]);

  const handleResubmit = useCallback(async () => {
    await resubmitMutation.mutateAsync(
      {
        wsId,
        requestId,
      },
      {
        onSuccess: () => {
          onSuccess?.();
          onClose();
        },
      }
    );
  }, [requestId, wsId, onSuccess, onClose, resubmitMutation]);

  const resetForms = useCallback(() => {
    setShowRejectionForm(false);
    setRejectionReason('');
    setShowNeedsInfoForm(false);
    setNeedsInfoReason('');
  }, []);

  return {
    // Rejection
    rejectionReason,
    setRejectionReason,
    showRejectionForm,
    setShowRejectionForm,
    // Needs info
    needsInfoReason,
    setNeedsInfoReason,
    showNeedsInfoForm,
    setShowNeedsInfoForm,
    // Mutations
    approveMutation,
    rejectMutation,
    requestInfoMutation,
    resubmitMutation,
    // Handlers
    handleApprove,
    handleReject,
    handleRequestMoreInfo,
    handleResubmit,
    resetForms,
  };
}
