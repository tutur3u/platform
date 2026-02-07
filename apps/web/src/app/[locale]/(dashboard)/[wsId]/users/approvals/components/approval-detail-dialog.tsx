'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  MessageSquare,
  Star,
  Trophy,
  X,
  XIcon,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  type ApprovalItem,
  useLatestApprovedLog,
  useLatestApprovedPostLog,
} from '../hooks/use-approvals';
import { getStatusColorClasses } from '../utils';

interface ApprovalDetailDialogProps {
  item: ApprovalItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formatDate: (value?: string | null) => string;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onReject: (params: { id: string; reason: string }) => void;
  isApproving: boolean;
  isRejecting: boolean;
  items?: ApprovalItem[];
  onNavigateToItem?: (item: ApprovalItem) => void;
}

export function ApprovalDetailDialog({
  item,
  open,
  onOpenChange,
  formatDate,
  canApprove,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
  items = [],
  onNavigateToItem,
}: ApprovalDetailDialogProps) {
  const t = useTranslations('approvals');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Fetch latest approved log using useQuery hook
  const reportId = item?.kind === 'reports' && open ? item.id : null;
  const postId = item?.kind === 'posts' && open ? item.id : null;

  const { data: previousReportVersion } = useLatestApprovedLog(reportId);
  const { data: previousPostVersion } = useLatestApprovedPostLog(postId);

  useEffect(() => {
    if (!open) {
      setShowRejectForm(false);
      setRejectReason('');
    }
  }, [open]);

  const currentIndex = useMemo(
    () => (item ? items.findIndex((i) => i.id === item.id) : -1),
    [item, items]
  );
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < items.length - 1;
  const positionLabel =
    items.length > 0 && currentIndex >= 0
      ? `${currentIndex + 1} / ${items.length}`
      : null;

  if (!item) return null;

  const status =
    item.kind === 'reports'
      ? item.report_approval_status
      : item.post_approval_status;
  const isReport = item.kind === 'reports';
  const previousVersion = isReport
    ? previousReportVersion
    : previousPostVersion;
  const hasPreviousVersion = !!previousVersion;
  const isCompareMode = hasPreviousVersion;
  const modifierName = item.modifier_name || t('labels.unknown_user');

  // Helper function to render score display
  const renderScore = (
    score: number | null | undefined,
    isPrevious = false
  ) => {
    if (score === null || score === undefined) {
      return (
        <span className="text-muted-foreground text-sm">
          {t('detail.noData')}
        </span>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'font-bold text-2xl',
            isPrevious ? 'text-muted-foreground' : 'text-dynamic-blue'
          )}
        >
          {score.toFixed(1)}
        </span>
        <span className="text-muted-foreground text-sm">/ 100</span>
      </div>
    );
  };

  // Helper function to render scores array
  const getScoreColorClass = (
    score: number | null,
    isPrevious: boolean
  ): string => {
    if (score === null || isPrevious) {
      return 'bg-muted text-muted-foreground';
    }
    if (score >= 80) {
      return 'bg-dynamic-green/10 text-dynamic-green';
    }
    if (score >= 60) {
      return 'bg-dynamic-orange/10 text-dynamic-orange';
    }
    return 'bg-dynamic-red/10 text-dynamic-red';
  };

  const renderScoresArray = (
    scores: number[] | null | undefined,
    isPrevious = false
  ) => {
    if (!scores || scores.length === 0) {
      return (
        <span className="text-muted-foreground text-sm">
          {t('detail.noData')}
        </span>
      );
    }
    return (
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
        {scores.map((score, index) => (
          <div
            key={index}
            className={cn(
              'flex flex-col items-center justify-center rounded-md p-2 text-xs',
              getScoreColorClass(score, isPrevious)
            )}
          >
            <span className="font-medium">{score !== null ? score : '-'}</span>
            <span className="text-[10px] opacity-70">
              {t('detail.day', { day: index + 1 })}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Helper function to render content
  const renderContent = (
    content: string | null | undefined,
    isPrevious = false
  ) => {
    return (
      <pre
        className={cn(
          'whitespace-pre-wrap rounded-lg p-4 font-mono text-sm',
          isPrevious
            ? 'bg-muted text-muted-foreground'
            : 'border border-dynamic-blue/20 bg-dynamic-blue/5'
        )}
      >
        {content || t('detail.noContent')}
      </pre>
    );
  };

  // Helper function to render feedback/notes
  const renderFeedbackOrNotes = (
    text: string | null | undefined,
    isPrevious = false
  ) => {
    if (!text) {
      return (
        <span className="text-muted-foreground text-sm">
          {t('detail.noData')}
        </span>
      );
    }
    return (
      <div
        className={cn(
          'rounded-lg border p-4',
          isPrevious
            ? 'border-muted bg-muted text-muted-foreground'
            : 'border-dynamic-orange/20 bg-dynamic-orange/5'
        )}
      >
        <p className="text-sm">{text}</p>
      </div>
    );
  };

  // Current version content component
  const CurrentVersionContent = () => (
    <div className="space-y-4">
      {/* Content Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
          <FileText className="h-4 w-4" />
          {t('detail.content')}
        </div>
        {renderContent(item.content)}
      </div>

      {/* Report-specific fields */}
      {isReport ? (
        <>
          {/* Score Section */}
          {'score' in item && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <Trophy className="h-4 w-4" />
                {t('detail.score')}
              </div>
              {renderScore(item.score as number | null)}
            </div>
          )}

          {/* Scores Array Section */}
          {'scores' in item && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <Star className="h-4 w-4" />
                {t('detail.scores')}
              </div>
              {renderScoresArray(item.scores as number[] | null)}
            </div>
          )}

          {/* Feedback Section */}
          {'feedback' in item && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <MessageSquare className="h-4 w-4" />
                {t('detail.feedback')}
              </div>
              {renderFeedbackOrNotes(item.feedback as string | null)}
            </div>
          )}
        </>
      ) : (
        /* Post-specific fields */
        item.notes && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
              <MessageSquare className="h-4 w-4" />
              {t('detail.notes')}
            </div>
            {renderFeedbackOrNotes(item.notes as string | null)}
          </div>
        )
      )}
    </div>
  );

  // Previous version content component
  const PreviousVersionContent = () => {
    if (!previousVersion) return null;
    return (
      <div className="space-y-4">
        {/* Content Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
            <FileText className="h-4 w-4" />
            {t('detail.content')}
          </div>
          {renderContent(previousVersion.content, true)}
        </div>

        {/* Report-specific fields */}
        {isReport ? (
          <>
            {/* Score Section */}
            {previousReportVersion?.score != null && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <Trophy className="h-4 w-4" />
                  {t('detail.score')}
                </div>
                {renderScore(previousReportVersion.score, true)}
              </div>
            )}

            {/* Scores Array Section */}
            {previousReportVersion?.scores && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <Star className="h-4 w-4" />
                  {t('detail.scores')}
                </div>
                {renderScoresArray(previousReportVersion.scores, true)}
              </div>
            )}

            {/* Feedback Section */}
            {previousReportVersion?.feedback && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <MessageSquare className="h-4 w-4" />
                  {t('detail.feedback')}
                </div>
                {renderFeedbackOrNotes(previousReportVersion.feedback, true)}
              </div>
            )}
          </>
        ) : (
          /* Post-specific fields */
          previousPostVersion?.notes && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                <MessageSquare className="h-4 w-4" />
                {t('detail.notes')}
              </div>
              {renderFeedbackOrNotes(previousPostVersion.notes, true)}
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 md:max-w-6xl">
        <DialogHeader className="border-b px-8 pt-8 pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <DialogTitle className="font-semibold text-lg leading-none">
                {item.title || t('labels.untitled')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                {isReport
                  ? t('detail.reportSubtitle')
                  : t('detail.postSubtitle')}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 1 && onNavigateToItem && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (hasPrev) onNavigateToItem(items[currentIndex - 1]!);
                    }}
                    disabled={!hasPrev || isApproving || isRejecting}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {positionLabel && (
                    <span className="min-w-12 text-center text-muted-foreground text-xs tabular-nums">
                      {positionLabel}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (hasNext) onNavigateToItem(items[currentIndex + 1]!);
                    }}
                    disabled={!hasNext || isApproving || isRejecting}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-xs',
                  getStatusColorClasses(status)
                )}
              >
                {t(
                  `status.${status.toLowerCase() as 'pending' | 'approved' | 'rejected'}`
                )}
              </span>
            </div>
          </div>
          <div className="flex justify-between">
            <div className="flex items-center gap-4 pt-2 text-muted-foreground text-xs">
              <span>
                {t('labels.created_at')} {formatDate(item.created_at)}
              </span>
              {item.group_name && (
                <span>
                  {t('labels.group')}: {item.group_name}
                </span>
              )}
              {isReport && item.user_name && (
                <span>
                  {t('labels.user')}: {item.user_name}
                </span>
              )}
            </div>
            {/* Action Buttons in Header */}
            {canApprove &&
              status === 'PENDING' &&
              (showRejectForm ? (
                <div className="flex items-center gap-2">
                  <Textarea
                    placeholder={t('detail.rejectionReasonPlaceholder')}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="h-8 min-h-0 w-48 resize-none text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowRejectForm(false);
                      setRejectReason('');
                    }}
                    className="h-8 w-8 p-0"
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (!item) return;
                      onReject({
                        id: item.id,
                        reason: rejectReason.trim(),
                      });
                    }}
                    disabled={isRejecting || !rejectReason.trim()}
                    className="h-8 gap-1"
                  >
                    {isRejecting && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    <X className="h-3 w-3" />
                    {t('actions.confirmReject')}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRejectForm(true)}
                    className="h-8 gap-1"
                  >
                    <X className="h-3 w-3" />
                    {t('actions.reject')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!item) return;
                      onApprove(item.id);
                    }}
                    disabled={isApproving}
                    className="h-8 gap-1 bg-dynamic-green hover:bg-dynamic-green/90"
                  >
                    {isApproving && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    <Check className="h-3 w-3" />
                    {t('actions.approve')}
                  </Button>
                </div>
              ))}
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-0 md:grid md:grid-cols-[1fr,320px]">
          {/* Left Column - Main Content */}
          <div className="order-2 space-y-0 lg:order-1">
            {isCompareMode ? (
              // Side-by-side comparison for reports with previous version
              <div className="grid h-[calc(90vh-8rem)] grid-cols-2 gap-0">
                {/* Previous Version */}
                <div className="border-border border-r">
                  <div className="border-border border-b bg-muted/30 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                        {t('detail.previousApprovedVersion')}
                      </div>
                      {previousVersion?.approved_at && (
                        <span className="text-muted-foreground text-xs">
                          {formatDate(previousVersion.approved_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ScrollArea className="h-[calc(90vh-12rem)]">
                    <div className="p-4">
                      <PreviousVersionContent />
                    </div>
                  </ScrollArea>
                </div>

                {/* Current Version */}
                <div className="border-border border-l">
                  <div className="border-border border-b bg-dynamic-blue/5 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-medium text-dynamic-blue text-sm">
                        {t('detail.currentVersion')}
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {t('detail.pendingApproval')}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
                      <span>{t('labels.last_modified_by')}</span>
                      <span className="font-medium">{modifierName}</span>
                    </div>
                  </div>
                  <ScrollArea className="h-[calc(90vh-12rem)]">
                    <div className="p-4">
                      <CurrentVersionContent />
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ) : (
              // Single view for posts or reports without previous version
              <div className="flex h-full flex-col">
                <div className="border-border border-b bg-dynamic-blue/5 px-6 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-dynamic-blue text-sm">
                      {t('detail.currentVersion')}
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {t('detail.pendingApproval')}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
                    <span>{t('labels.last_modified_by')}</span>
                    <span className="font-medium">{modifierName}</span>
                  </div>
                </div>
                <ScrollArea className="h-[calc(90vh-11rem)]">
                  <div className="p-6">
                    <CurrentVersionContent />
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          {/* End Left Column */}

          {/* Right Column - Metadata & Status */}
          <div className="order-1 border-border border-b bg-muted/20 lg:order-2 lg:border-b-0 lg:border-l lg:bg-transparent">
            <div className="space-y-4 p-4 lg:h-[calc(90vh-8rem)] lg:overflow-y-auto">
              {/* Metadata Card */}
              <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <h4 className="mb-3 font-semibold text-sm">
                  {t('detail.metadata')}
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t('labels.created_at')}
                    </span>
                    <span>{formatDate(item.created_at)}</span>
                  </div>
                  {isReport && item.user_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('labels.user')}
                      </span>
                      <span>{item.user_name}</span>
                    </div>
                  )}
                  {item.group_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('labels.group')}
                      </span>
                      <span>{item.group_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t('labels.last_modified_by')}
                    </span>
                    <span>{modifierName}</span>
                  </div>
                </div>
              </div>

              {/* Status Info */}
              {item.approved_at || item.rejected_at || item.rejection_reason ? (
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <h4 className="mb-3 font-semibold text-sm">
                    {t('detail.statusHistory')}
                  </h4>
                  <div className="space-y-2 text-sm">
                    {item.approved_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t('labels.approved_at')}
                        </span>
                        <span>{formatDate(item.approved_at)}</span>
                      </div>
                    )}
                    {item.rejected_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t('labels.rejected_at')}
                        </span>
                        <span>{formatDate(item.rejected_at)}</span>
                      </div>
                    )}
                    {item.rejection_reason && (
                      <div className="pt-2">
                        <span className="text-muted-foreground">
                          {t('labels.rejection_reason')}:
                        </span>
                        <p className="mt-1 rounded bg-dynamic-red/10 px-2 py-1 text-dynamic-red text-xs">
                          {item.rejection_reason}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {/* End Right Column */}
        </div>
      </DialogContent>
    </Dialog>
  );
}
