import { CheckCircle2Icon, InfoIcon, XCircleIcon } from '@tuturuuu/icons';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { ExtendedTimeTrackingRequest } from '../page';

interface ApprovalStatusCardProps {
  request: ExtendedTimeTrackingRequest;
}

export function ApprovalStatusCard({ request }: ApprovalStatusCardProps) {
  const t = useTranslations('time-tracker.requests');

  // Approved status
  if (request.approval_status === 'APPROVED' && request.approved_by_user) {
    return (
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
    );
  }

  // Rejected status
  if (
    request.approval_status === 'REJECTED' &&
    request.rejected_by_user &&
    request.rejection_reason
  ) {
    return (
      <div className="space-y-3 rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-4">
        <div className="flex items-start gap-3">
          <XCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-red" />
          <div className="space-y-1">
            <p className="font-medium text-sm">{t('detail.requestRejected')}</p>
            <p className="text-muted-foreground text-xs">
              {t('detail.rejectedDate', {
                name: request.rejected_by_user.display_name,
                date: request.rejected_at
                  ? format(new Date(request.rejected_at), 'MMM d, yyyy · h:mm a')
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
    );
  }

  // Needs info status
  if (
    request.approval_status === 'NEEDS_INFO' &&
    request.needs_info_requested_by_user &&
    request.needs_info_reason
  ) {
    return (
      <div className="space-y-3 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
        <div className="flex items-start gap-3">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-blue" />
          <div className="space-y-1">
            <p className="font-medium text-sm">{t('detail.requestNeedsInfo')}</p>
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
          <p className="font-medium text-sm">{t('detail.needsInfoReason')}</p>
          <p className="whitespace-pre-wrap text-muted-foreground text-sm">
            {request.needs_info_reason}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
