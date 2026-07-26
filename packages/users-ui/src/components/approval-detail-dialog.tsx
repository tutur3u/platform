'use client';

import {
  ChevronDown,
  FileText,
  MessageSquare,
  Shield as ShieldIcon,
  Star,
  Trophy,
} from '@tuturuuu/icons';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import { Dialog, DialogContent } from '@tuturuuu/ui/dialog';
import { DiffViewer } from '@tuturuuu/ui/diff-viewer';
import { useWorkspaceConfigs } from '@tuturuuu/ui/hooks/use-workspace-config';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { availableConfigs } from '@tuturuuu/utils/configs/reports';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  type ApprovalItem,
  useLatestApprovedLog,
  useLatestApprovedPostLog,
} from '../hooks/use-approvals';
import {
  ApprovalDetailHeader,
  ApprovalDetailSidebar,
} from './approval-detail-dialog-chrome';

interface ApprovalDetailDialogProps {
  wsId: string;
  item: ApprovalItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formatDate: (value?: string | null) => string;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onUnapprove: (id: string) => void;
  onReject: (params: { id: string; reason: string }) => void;
  isApproving: boolean;
  isUnapproving: boolean;
  isRejecting: boolean;
  items?: ApprovalItem[];
  onNavigateToItem?: (item: ApprovalItem) => void;
}

export function ApprovalDetailDialog({
  wsId,
  item,
  open,
  onOpenChange,
  formatDate,
  canApprove,
  onApprove,
  onUnapprove,
  onReject,
  isApproving,
  isUnapproving,
  isRejecting,
  items = [],
  onNavigateToItem,
}: ApprovalDetailDialogProps) {
  const t = useTranslations('approvals');
  const { resolvedTheme } = useTheme();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Extract config IDs from availableConfigs for batch fetching (filter out any without id)
  const configIds = useMemo(
    () =>
      availableConfigs
        .map((config) => config.id)
        .filter((id): id is string => Boolean(id)),
    []
  );

  // Use batch query to fetch workspace configs
  const configsQuery = useWorkspaceConfigs(wsId, configIds);

  // Transform the fetched config data into WorkspaceConfig[] format
  const configsData: WorkspaceConfig[] = useMemo(() => {
    const fetchedConfigs = configsQuery.data;
    if (!fetchedConfigs) return [];

    // Merge fetched values with availableConfigs defaults
    return availableConfigs
      .filter((config): config is typeof config & { id: string } =>
        Boolean(config.id)
      )
      .map((baseConfig) => {
        const fetchedValue = fetchedConfigs[baseConfig.id];
        return {
          ...baseConfig,
          value: fetchedValue ?? baseConfig.defaultValue,
        } as WorkspaceConfig;
      });
  }, [configsQuery.data]);

  const configMap = useMemo(() => {
    const map = new Map<string, string>();
    configsData.forEach((config) => {
      if (config.id && config.value) {
        map.set(config.id, config.value);
      }
    });
    return map;
  }, [configsData]);

  const getConfig = (id: string) => configMap.get(id);

  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';
    const segments = text.split(/({{.*?}})/g).filter(Boolean);
    const parsedText = segments.map((segment, index) => {
      const match = segment.match(/{{(.*?)}}/);
      if (match) {
        const key = match?.[1]?.trim() || '';
        if (key === 'user_name') {
          const userId = item?.kind === 'reports' ? item.user_id : undefined;
          const userName =
            (item?.kind === 'reports' ? item.user_name : undefined) || '...';
          if (userId) {
            return (
              <Link
                key={key + index}
                href={`/${wsId}/users/database/${userId}`}
              >
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-secondary/80"
                >
                  {userName}
                </Badge>
              </Link>
            );
          }
          return (
            <Badge key={key + index} variant="secondary">
              {userName}
            </Badge>
          );
        }
        if (key === 'group_name') {
          const groupId = item?.group_id;
          const groupName = item?.group_name || '...';
          if (groupId) {
            return (
              <Link key={key + index} href={`/${wsId}/users/groups/${groupId}`}>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                >
                  {groupName}
                </Badge>
              </Link>
            );
          }
          return (
            <Badge key={key + index} variant="outline">
              {groupName}
            </Badge>
          );
        }
        if (key === 'group_manager_name') {
          return (
            <span key={key + index} className="font-semibold">
              {(item?.kind === 'reports' ? item.creator_name : undefined) ||
                '...'}
            </span>
          );
        }
        return (
          <span
            key={key + index}
            className="rounded bg-foreground px-1 py-0.5 font-semibold text-background"
          >
            {key}
          </span>
        );
      }
      return segment;
    });
    return parsedText;
  };

  // Fetch latest approved log using useQuery hook
  const reportId = item?.kind === 'reports' && open ? item.id : null;
  const postId = item?.kind === 'posts' && open ? (item.post_id ?? null) : null;

  const { data: previousReportVersion } = useLatestApprovedLog(wsId, reportId);
  const { data: previousPostVersion } = useLatestApprovedPostLog(wsId, postId);

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
    <div className="space-y-3">
      {/* Content Section */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 transition-colors hover:bg-muted/80 [&[data-state=open]>svg]:rotate-180">
          <div className="flex items-center gap-2 font-medium text-sm">
            <FileText className="h-4 w-4" />
            {t('detail.content')}
          </div>
          <ChevronDown className="h-4 w-4 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {isReport ? (
            <div className="rounded-lg border bg-card p-4">
              <ReportPreview
                t={t}
                lang="en" // Ideally this should be dynamic but useLocale is at top level
                parseDynamicText={parseDynamicText}
                getConfig={getConfig}
                theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
                data={{
                  title: item.title || '',
                  content: item.content || '',
                  score: (item.score as number | null)?.toFixed(1) || '',
                  feedback: (item.feedback as string | null) || '',
                }}
                notice={
                  !canApprove ? (
                    <div className="mb-4 rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/10 p-4">
                      <div className="flex items-start gap-3">
                        <ShieldIcon className="mt-0.5 h-5 w-5 text-dynamic-orange" />
                        <div className="flex-1">
                          <div className="font-semibold text-dynamic-orange">
                            {t('detail.pendingApproval')}
                          </div>
                          <div className="mt-1 text-dynamic-orange/80 text-sm">
                            {t('detail.pendingApprovalDescription')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : undefined
                }
              />
            </div>
          ) : (
            renderContent(item.content)
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Report-specific fields */}
      {isReport ? (
        <>
          {/* Score Section */}
          {'score' in item && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 transition-colors hover:bg-muted/80 [&[data-state=open]>svg]:rotate-180">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Trophy className="h-4 w-4" />
                  {t('detail.score')}
                </div>
                <ChevronDown className="h-4 w-4 transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {renderScore(item.score as number | null)}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Scores Array Section */}
          {'scores' in item && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 transition-colors hover:bg-muted/80 [&[data-state=open]>svg]:rotate-180">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Star className="h-4 w-4" />
                  {t('detail.scores')}
                </div>
                <ChevronDown className="h-4 w-4 transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {renderScoresArray(item.scores as number[] | null)}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Feedback Section */}
          {'feedback' in item && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 transition-colors hover:bg-muted/80 [&[data-state=open]>svg]:rotate-180">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <MessageSquare className="h-4 w-4" />
                  {t('detail.feedback')}
                </div>
                <ChevronDown className="h-4 w-4 transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {renderFeedbackOrNotes(item.feedback as string | null)}
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      ) : (
        /* Post-specific fields */
        item.notes && (
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 transition-colors hover:bg-muted/80 [&[data-state=open]>svg]:rotate-180">
              <div className="flex items-center gap-2 font-medium text-sm">
                <MessageSquare className="h-4 w-4" />
                {t('detail.notes')}
              </div>
              <ChevronDown className="h-4 w-4 transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              {renderFeedbackOrNotes(item.notes as string | null)}
            </CollapsibleContent>
          </Collapsible>
        )
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0 sm:max-h-[92dvh] sm:max-w-[calc(100vw-2rem)] xl:max-w-6xl">
        <ApprovalDetailHeader
          canApprove={canApprove}
          currentIndex={currentIndex}
          formatDate={formatDate}
          hasNext={hasNext}
          hasPrev={hasPrev}
          isApproving={isApproving}
          isRejecting={isRejecting}
          isUnapproving={isUnapproving}
          item={item}
          items={items}
          onApprove={onApprove}
          onNavigateToItem={onNavigateToItem}
          onReject={onReject}
          onUnapprove={onUnapprove}
          positionLabel={positionLabel}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          setShowRejectForm={setShowRejectForm}
          showRejectForm={showRejectForm}
          status={status}
          wsId={wsId}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:overflow-hidden">
          {/* Left Column - Main Content */}
          <div className="order-2 min-h-0 xl:order-1">
            {isCompareMode ? (
              // Diff comparison for reports with previous version
              <div className="flex min-h-[28rem] flex-col xl:h-full xl:min-h-0">
                <div className="grid min-w-0 gap-2 border-border border-b bg-muted/30 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-muted-foreground text-sm">
                    {t('detail.previousApprovedVersion')}
                    {previousVersion?.approved_at && (
                      <span className="font-normal text-muted-foreground text-xs">
                        ({formatDate(previousVersion.approved_at)})
                      </span>
                    )}
                    <span className="text-foreground/40">→</span>
                    <span className="text-dynamic-blue">
                      {t('detail.currentVersion')}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1 text-muted-foreground text-xs sm:justify-end">
                    <span>{t('labels.last_modified_by')}</span>
                    <span
                      className="min-w-0 break-words font-medium"
                      title={modifierName}
                    >
                      {modifierName}
                    </span>
                  </div>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-4 p-4">
                    {/* Content Diff */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                        <FileText className="h-4 w-4" />
                        {t('detail.content')}
                      </div>
                      <DiffViewer
                        oldValue={previousVersion?.content}
                        newValue={item.content}
                        oldLabel={t('detail.previousApprovedVersion')}
                        newLabel={t('detail.currentVersion')}
                        granularity="word"
                        viewMode="unified"
                        showLineNumbers={false}
                      />
                      {previousVersion?.content === (item.content ?? '') &&
                        renderContent(item.content)}
                    </div>

                    {/* Report-specific diffs */}
                    {isReport && (
                      <>
                        {'score' in item && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                              <Trophy className="h-4 w-4" />
                              {t('detail.score')}
                            </div>
                            <div className="flex items-center gap-4">
                              {previousReportVersion?.score != null && (
                                <>
                                  {renderScore(
                                    previousReportVersion.score,
                                    true
                                  )}
                                  <span className="text-muted-foreground">
                                    →
                                  </span>
                                </>
                              )}
                              {renderScore(item.score as number | null)}
                            </div>
                          </div>
                        )}

                        {'scores' in item && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                              <Star className="h-4 w-4" />
                              {t('detail.scores')}
                            </div>
                            {renderScoresArray(item.scores as number[] | null)}
                          </div>
                        )}

                        {'feedback' in item && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                              <MessageSquare className="h-4 w-4" />
                              {t('detail.feedback')}
                            </div>
                            <DiffViewer
                              oldValue={previousReportVersion?.feedback}
                              newValue={item.feedback as string | null}
                              oldLabel={t('detail.previousApprovedVersion')}
                              newLabel={t('detail.currentVersion')}
                              granularity="word"
                              viewMode="unified"
                              showLineNumbers={false}
                            />
                            {previousReportVersion?.feedback ===
                              ((item.feedback as string | null) ?? '') &&
                              renderFeedbackOrNotes(
                                item.feedback as string | null
                              )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Post-specific diffs */}
                    {!isReport &&
                      (item.notes || previousPostVersion?.notes) && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                            <MessageSquare className="h-4 w-4" />
                            {t('detail.notes')}
                          </div>
                          <DiffViewer
                            oldValue={previousPostVersion?.notes}
                            newValue={item.notes as string | null}
                            oldLabel={t('detail.previousApprovedVersion')}
                            newLabel={t('detail.currentVersion')}
                            granularity="word"
                            viewMode="unified"
                            showLineNumbers={false}
                          />
                          {previousPostVersion?.notes ===
                            ((item.notes as string | null) ?? '') &&
                            renderFeedbackOrNotes(item.notes as string | null)}
                        </div>
                      )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              // Single view for posts or reports without previous version
              <div className="flex min-h-[28rem] flex-col xl:h-full xl:min-h-0">
                <div className="border-border border-b bg-dynamic-blue/5 px-6 py-3">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium text-dynamic-blue text-sm">
                      {t('detail.currentVersion')}
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {t('detail.pendingApproval')}
                    </span>
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-muted-foreground text-xs">
                    <span>{t('labels.last_modified_by')}</span>
                    <span
                      className="min-w-0 break-words font-medium"
                      title={modifierName}
                    >
                      {modifierName}
                    </span>
                  </div>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="p-6">
                    <CurrentVersionContent />
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          {/* End Left Column */}

          {/* Right Column - Metadata & Status */}
          <div className="order-1 border-border border-b bg-muted/20 xl:order-2 xl:min-h-0 xl:border-b-0 xl:border-l xl:bg-transparent">
            <div className="p-4 xl:h-full xl:overflow-y-auto">
              <ApprovalDetailSidebar
                formatDate={formatDate}
                item={item}
                wsId={wsId}
              />
            </div>
          </div>
          {/* End Right Column */}
        </div>
      </DialogContent>
    </Dialog>
  );
}
