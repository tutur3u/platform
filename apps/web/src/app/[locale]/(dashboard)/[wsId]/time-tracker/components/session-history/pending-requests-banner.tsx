'use client';

import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
} from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useRequests } from '../../requests/hooks/use-requests';
import type { ExtendedTimeTrackingRequest } from '../../requests/page';
import { RequestDetailModal } from '../../requests/request-detail-modal';
import { calculateDuration, getStatusColorClasses } from '../../requests/utils';

const MAX_SHOWN = 5;

interface PendingRequestsBannerProps {
  wsId: string;
  currentUser: WorkspaceUser;
  canManageTimeTrackingRequests: boolean;
  canBypassTimeTrackingRequestApproval: boolean;
}

export function PendingRequestsBanner({
  wsId,
  currentUser,
  canManageTimeTrackingRequests,
  canBypassTimeTrackingRequestApproval,
}: PendingRequestsBannerProps) {
  const t = useTranslations('time-tracker.session_history.pending_requests');
  const tStatus = useTranslations('time-tracker.requests.status');

  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedRequest, setSelectedRequest] =
    useState<ExtendedTimeTrackingRequest | null>(null);

  const { data: pendingData, isLoading: isLoadingPending } = useRequests({
    wsId,
    status: 'pending',
    userId: currentUser.id,
    limit: MAX_SHOWN,
  });

  const { data: needsInfoData, isLoading: isLoadingNeedsInfo } = useRequests({
    wsId,
    status: 'needs_info',
    userId: currentUser.id,
    limit: MAX_SHOWN,
  });

  const isLoading = isLoadingPending || isLoadingNeedsInfo;

  const allRequests = useMemo(() => {
    const pending = pendingData?.requests ?? [];
    const needsInfo = needsInfoData?.requests ?? [];
    return [...pending, ...needsInfo].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [pendingData, needsInfoData]);

  const totalCount =
    (pendingData?.totalCount ?? 0) + (needsInfoData?.totalCount ?? 0);

  const shownRequests = allRequests.slice(0, MAX_SHOWN);

  // Don't render if no requests and not loading
  if (!isLoading && totalCount === 0) return null;

  return (
    <>
      <Card className="border-dynamic-orange/20 shadow-sm">
        <CardHeader className="p-4 md:p-6">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
                <ClipboardList className="h-4 w-4 text-dynamic-orange" />
              </div>
              <span className="font-bold tracking-tight">{t('title')}</span>
              {!isLoading && totalCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange text-xs"
                >
                  {t('pending_count', { count: totalCount })}
                </Badge>
              )}
            </CardTitle>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? t('collapse') : t('expand')}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="px-4 pt-0 pb-4 md:px-6 md:pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-dynamic-orange" />
                <span className="ml-2 text-muted-foreground text-sm">
                  {t('loading')}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {shownRequests.map((request) => (
                  <button
                    type="button"
                    key={request.id}
                    onClick={() => setSelectedRequest(request)}
                    className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'border font-medium text-xs',
                          getStatusColorClasses(request.approval_status)
                        )}
                      >
                        {tStatus(
                          request.approval_status.toLowerCase() as
                            | 'pending'
                            | 'needs_info'
                        )}
                      </Badge>
                      {request.category &&
                        (() => {
                          const catStyles = request.category.color
                            ? computeAccessibleLabelStyles(
                                request.category.color
                              )
                            : null;
                          return (
                            <Badge
                              variant="outline"
                              className="border font-medium text-xs"
                              style={
                                catStyles
                                  ? {
                                      backgroundColor: catStyles.bg,
                                      borderColor: catStyles.border,
                                      color: catStyles.text,
                                    }
                                  : undefined
                              }
                            >
                              {request.category.name}
                            </Badge>
                          );
                        })()}
                      <span className="flex-1 truncate font-medium text-sm">
                        {request.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {calculateDuration(
                          request.start_time,
                          request.end_time
                        )}
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground text-xs">
                      {request.approval_status === 'NEEDS_INFO' &&
                      request.needs_info_requested_by_user ? (
                        <span>
                          {t('info_requested_by', {
                            name: request.needs_info_requested_by_user
                              .display_name,
                          })}
                        </span>
                      ) : (
                        <span>
                          {t('created', {
                            date: dayjs(request.created_at).format(
                              'MMM D, YYYY'
                            ),
                          })}
                        </span>
                      )}
                    </div>
                  </button>
                ))}

                {totalCount > MAX_SHOWN && (
                  <div className="pt-1 text-center">
                    <Link
                      href={`/${wsId}/time-tracker/requests`}
                      className="text-dynamic-orange text-sm hover:underline"
                    >
                      {t('view_all', { count: totalCount })} →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          wsId={wsId}
          canManageTimeTrackingRequests={canManageTimeTrackingRequests}
          canBypassTimeTrackingRequestApproval={
            canBypassTimeTrackingRequestApproval
          }
          currentUser={currentUser}
        />
      )}
    </>
  );
}
