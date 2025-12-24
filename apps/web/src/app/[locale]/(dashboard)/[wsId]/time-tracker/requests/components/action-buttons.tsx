import {
  CheckCircle2Icon,
  InfoIcon,
  Loader2,
  XCircleIcon,
  XIcon,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { ExtendedTimeTrackingRequest } from '../page';

interface ActionButtonsProps {
  request: ExtendedTimeTrackingRequest;
  currentUser: WorkspaceUser | null;
  canManageTimeTrackingRequests: boolean;
  // Approve
  isApproving: boolean;
  onApprove: () => void;
  // Reject
  showRejectionForm: boolean;
  rejectionReason: string;
  setRejectionReason: (value: string) => void;
  setShowRejectionForm: (show: boolean) => void;
  isRejecting: boolean;
  onReject: () => void;
  // Request more info
  showNeedsInfoForm: boolean;
  needsInfoReason: string;
  setNeedsInfoReason: (value: string) => void;
  setShowNeedsInfoForm: (show: boolean) => void;
  isRequestingInfo: boolean;
  onRequestMoreInfo: () => void;
  // Resubmit
  isResubmitting: boolean;
  onResubmit: () => void;
}

export function ActionButtons({
  request,
  currentUser,
  canManageTimeTrackingRequests,
  isApproving,
  onApprove,
  showRejectionForm,
  rejectionReason,
  setRejectionReason,
  setShowRejectionForm,
  isRejecting,
  onReject,
  showNeedsInfoForm,
  needsInfoReason,
  setNeedsInfoReason,
  setShowNeedsInfoForm,
  isRequestingInfo,
  onRequestMoreInfo,
  isResubmitting,
  onResubmit,
}: ActionButtonsProps) {
  const t = useTranslations('time-tracker.requests');

  // Resubmit button for request owner when status is NEEDS_INFO
  if (
    request.approval_status === 'NEEDS_INFO' &&
    currentUser &&
    request.user_id === currentUser.id
  ) {
    return (
      <div className="space-y-2">
        <Button
          onClick={onResubmit}
          disabled={isResubmitting}
          className="w-full bg-dynamic-blue hover:bg-dynamic-blue/90"
        >
          {isResubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <CheckCircle2Icon className="mr-2 h-4 w-4" />
          {t('detail.resubmitButton')}
        </Button>
      </div>
    );
  }

  // Action buttons for approvers when status is PENDING
  if (
    request.approval_status === 'PENDING' &&
    canManageTimeTrackingRequests &&
    currentUser &&
    request.user_id !== currentUser.id
  ) {
    // Show rejection form
    if (showRejectionForm) {
      return (
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
            onClick={onReject}
            disabled={isRejecting || !rejectionReason.trim()}
            className="w-full"
          >
            {isRejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('detail.confirmRejection')}
          </Button>
        </div>
      );
    }

    // Show needs info form
    if (showNeedsInfoForm) {
      return (
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
            onClick={onRequestMoreInfo}
            disabled={isRequestingInfo || !needsInfoReason.trim()}
            className="w-full bg-dynamic-blue hover:bg-dynamic-blue/90"
          >
            {isRequestingInfo && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('detail.confirmRequestInfo')}
          </Button>
        </div>
      );
    }

    // Show main action buttons
    return (
      <div className="space-y-2">
        <Button
          onClick={onApprove}
          disabled={isApproving}
          className="w-full bg-dynamic-green hover:bg-dynamic-green/90"
        >
          {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
    );
  }

  return null;
}
