'use client';

import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield as ShieldIcon,
  TriangleAlert,
  Undo,
} from '@tuturuuu/icons';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import * as z from 'zod';
import { useConfigMap } from '@/hooks/use-config-map';
import { RejectDialog } from '../../approvals/components/reject-dialog';
import UserMonthAttendance from '../../attendance/user-month-attendance';
import UserFeedbackSection from '../../groups/[groupId]/reports/user-feedback-section';
import { getWorkspaceUserArchiveState } from '../user-archive';
import { DeleteReportDialog } from './components/delete-report-dialog';
import { ReportActions } from './components/report-actions';
import { ReportHistory } from './components/report-history';
import UserReportForm from './form';
import { useReportDynamicText } from './hooks/use-report-dynamic-text';
import { useReportExport } from './hooks/use-report-export';
import { useReportHistory } from './hooks/use-report-history';
import {
  type UserReport,
  useReportMutations,
} from './hooks/use-report-mutations';
import {
  isWorkspaceBooleanEnabled,
  shouldBlockReportExport,
  shouldShowPendingWatermark,
} from './report-feature-flags';
import ScoreDisplay from './score-display';

export const UserReportFormSchema = z.object({
  title: z.string(),
  content: z.string(),
  feedback: z.string(),
});

export default function EditableReportPreview({
  wsId,
  report,
  configs,
  isNew,
  groupId,
  healthcareVitals = [],
  healthcareVitalsLoading = false,
  factorEnabled = false,
  managerOptions,
  selectedManagerName,
  onChangeManagerAction,
  canCheckUserAttendance,
  canUpdateReports = false,
  canApproveReports = false,
  canDeleteReports = false,
  feedbackUser,
  feedbackGroupName,
  canEditFeedback = false,
  canDeleteFeedback = false,
}: {
  wsId: string;
  report: UserReport;
  configs: WorkspaceConfig[];
  isNew: boolean;
  groupId?: string;
  healthcareVitals?: Array<{
    id: string;
    name: string;
    unit: string;
    factor: number;
    value: number | null;
  }>;
  healthcareVitalsLoading?: boolean;
  factorEnabled?: boolean;
  managerOptions?: Array<{ value: string; label: string }>;
  selectedManagerName?: string;
  onChangeManagerAction?: (name?: string) => void;
  canCheckUserAttendance?: boolean;
  canApproveReports?: boolean;
  canUpdateReports?: boolean;
  canDeleteReports?: boolean;
  feedbackUser?: WorkspaceUser | null;
  feedbackGroupName?: string;
  canEditFeedback?: boolean;
  canDeleteFeedback?: boolean;
}) {
  const locale = useLocale();
  const { dateTime } = useFormatter();
  const t = useTranslations();
  const { resolvedTheme } = useTheme();

  const {
    logsQuery,
    selectedLog,
    setSelectedLog,
    formatRelativeTime,
    latestApprovedLog,
    isLoadingRejectedBase,
  } = useReportHistory({
    wsId,
    reportId: report.id,
    reportApprovalStatus: report.report_approval_status,
    isNew,
  });

  const [scoreCalculationMethod, setScoreCalculationMethod] = useLocalStorage<
    'AVERAGE' | 'LATEST'
  >('scoreCalculationMethod', 'LATEST');

  const {
    createMutation,
    updateMutation,
    deleteMutation,
    updateScoresMutation,
    approveMutation,
    rejectMutation,
  } = useReportMutations({
    wsId,
    report,
    isNew,
    healthcareVitals,
    factorEnabled,
    scoreCalculationMethod,
    canApproveReports,
  });

  const { getConfig } = useConfigMap(configs);

  const getDefaultReportTitle = () => {
    const baseTitle = getConfig('REPORT_DEFAULT_TITLE')?.trim();
    if (!baseTitle) return '';
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());
    return `${baseTitle} ${month}/${year}`;
  };

  const defaultReportTitle = isNew ? getDefaultReportTitle() : '';

  const getFormValues = () => {
    const isRejected = report.report_approval_status === 'REJECTED';
    if (isRejected && latestApprovedLog) {
      return {
        title: latestApprovedLog.title || '',
        content: latestApprovedLog.content || '',
        feedback: latestApprovedLog.feedback || '',
      };
    }
    const reportTitle = report?.title || '';
    return {
      title: reportTitle || defaultReportTitle,
      content: report?.content || '',
      feedback: report?.feedback || '',
    };
  };

  const form = useForm({
    resolver: zodResolver(UserReportFormSchema),
    defaultValues: getFormValues(),
  });

  useEffect(() => {
    const isRejected = report.report_approval_status === 'REJECTED';
    const formValues =
      isRejected && latestApprovedLog
        ? {
            title: latestApprovedLog.title || '',
            content: latestApprovedLog.content || '',
            feedback: latestApprovedLog.feedback || '',
          }
        : {
            title: report?.title || defaultReportTitle,
            content: report?.content || '',
            feedback: report?.feedback || '',
          };
    form.reset(formValues);
  }, [
    report.report_approval_status,
    latestApprovedLog,
    defaultReportTitle,
    report?.title,
    report?.content,
    report?.feedback,
    form,
  ]);

  const title = form.watch('title');
  const content = form.watch('content');
  const feedback = form.watch('feedback');

  const parseDynamicText = useReportDynamicText({
    userName: report.user_name,
    groupName: report.group_name,
    groupManagerName: selectedManagerName ?? report.creator_name,
  });

  const [reportTheme, setReportTheme] = useLocalStorage<
    'auto' | 'light' | 'dark'
  >('reportPreviewTheme', 'light');

  const resolvedReportTheme =
    reportTheme === 'auto'
      ? resolvedTheme === 'dark'
        ? 'dark'
        : 'light'
      : reportTheme;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [formOpen, setFormOpen] = useState(true);
  const [attendanceOpen, setAttendanceOpen] = useState(true);
  const [previewPageCount, setPreviewPageCount] = useState(1);
  const [isPaginationReady, setIsPaginationReady] = useState(false);
  const [activePreviewPage, setActivePreviewPage] = useState(0);

  const currentScores = useMemo(() => {
    if (selectedLog) return selectedLog.scores ?? [];
    if (isNew) {
      return healthcareVitals
        .filter((vital) => vital.value !== null && vital.value !== undefined)
        .map((vital) => {
          const baseValue = vital.value ?? 0;
          return factorEnabled ? baseValue * (vital.factor ?? 1) : baseValue;
        });
    }
    return report.scores ?? [];
  }, [selectedLog, isNew, healthcareVitals, factorEnabled, report.scores]);

  const hasScores = currentScores.length > 0;
  const [scoresOpen, setScoresOpen] = useState(hasScores);

  useEffect(() => {
    if (hasScores) setScoresOpen(true);
  }, [hasScores]);

  const representativeScoreValue = useMemo(() => {
    if (currentScores.length === 0) return null;
    if (scoreCalculationMethod === 'LATEST') {
      return currentScores[currentScores.length - 1];
    }
    return currentScores.reduce((a, b) => a + b, 0) / currentScores.length;
  }, [currentScores, scoreCalculationMethod]);

  const previewTitle = selectedLog?.title ?? title;
  const previewContent = selectedLog?.content ?? content;
  const previewFeedback = selectedLog?.feedback ?? feedback;
  const previewScore =
    (selectedLog ? selectedLog.score : representativeScoreValue)?.toFixed(1) ||
    '';

  const {
    handlePdfExport,
    handlePrintExport,
    handlePngExport,
    isExporting,
    defaultExportType,
    setDefaultExportType,
    printAfterExport,
    setPrintAfterExport,
  } = useReportExport({
    previewTitle,
    isDarkPreview: resolvedReportTheme === 'dark',
    userName: report.user_name,
    groupName: report.group_name,
    isPaginationReady,
  });

  const restrictReportExportToApproved = isWorkspaceBooleanEnabled(
    getConfig('ENABLE_REPORT_EXPORT_ONLY_APPROVED')
  );
  const showPendingReportWatermark = isWorkspaceBooleanEnabled(
    getConfig('ENABLE_REPORT_PENDING_WATERMARK')
  );

  const isPendingApproval =
    report.report_approval_status === 'PENDING' && !canApproveReports;
  const isExportBlockedByStatus = shouldBlockReportExport({
    approvalStatus: report.report_approval_status,
    canApproveReports,
    restrictReportExportToApproved,
  });
  const shouldShowPendingWatermarkValue = shouldShowPendingWatermark({
    approvalStatus: report.report_approval_status,
    enablePendingWatermark: showPendingReportWatermark,
  });
  const userArchiveState = getWorkspaceUserArchiveState({
    id: report.user_id || 'unknown-user',
    full_name: report.user_name,
    archived: report.user_archived,
    archived_until: report.user_archived_until,
  });
  const isArchivedUser = userArchiveState !== 'active';
  const archivedUntilText =
    userArchiveState === 'temporary-archived' && report.user_archived_until
      ? dateTime(new Date(report.user_archived_until), {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : null;
  useEffect(() => {
    setActivePreviewPage((currentPage) =>
      Math.min(currentPage, Math.max(0, previewPageCount - 1))
    );
  }, [previewPageCount]);

  return (
    <div className="space-y-4">
      {report.user_id && (
        <div
          className={cn(
            'rounded-2xl border p-4',
            isArchivedUser
              ? 'border-dynamic-orange/30 bg-linear-to-r from-dynamic-orange/12 via-background to-background'
              : 'border-border/60 bg-muted/20'
          )}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  {t('ws-reports.selected_user')}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-full px-2 py-0.5',
                    userArchiveState === 'active' &&
                      'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
                    userArchiveState === 'temporary-archived' &&
                      'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
                    userArchiveState === 'archived' &&
                      'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
                  )}
                >
                  {userArchiveState === 'active'
                    ? t('ws-users.status_active')
                    : userArchiveState === 'temporary-archived'
                      ? t('ws-users.status_archived_until')
                      : t('ws-users.status_archived')}
                </Badge>
              </div>
              <div className="font-semibold text-lg">
                {report.user_name || 'No name'}
              </div>
              <p className="max-w-2xl text-muted-foreground text-sm">
                {isArchivedUser
                  ? userArchiveState === 'temporary-archived' &&
                    archivedUntilText
                    ? t('ws-reports.archived_until_user_notice_description', {
                        date: archivedUntilText,
                      })
                    : t('ws-reports.archived_user_notice_description')
                  : t('ws-reports.selected_user_description')}
              </p>
              {report.user_note ? (
                <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-sm">
                  <span className="font-medium">{t('ws-users.note')}:</span>{' '}
                  <span className="text-muted-foreground">
                    {report.user_note}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3">
              {isArchivedUser ? (
                <TriangleAlert className="h-5 w-5 text-dynamic-orange" />
              ) : (
                <Archive className="h-5 w-5 text-muted-foreground" />
              )}
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                  {t('ws-reports.reports')}
                </p>
                <p className="font-medium text-sm">
                  {isArchivedUser
                    ? t('ws-reports.archived_user_notice')
                    : t('ws-reports.selected_user_ready')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid h-fit gap-4 xl:grid-cols-3">
        <div className="grid h-fit gap-4">
          <Collapsible
            open={scoresOpen}
            onOpenChange={setScoresOpen}
            className="rounded-lg border"
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex w-full items-center justify-between p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    {t('ws-reports.scores')}
                  </span>
                  {currentScores.length > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs tabular-nums">
                      {currentScores.length}
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${scoresOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4">
              <div className="flex flex-col gap-2">
                <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  {t('ws-reports.score_calculation_method')}
                </div>
                <Tabs
                  value={scoreCalculationMethod}
                  onValueChange={(val) =>
                    setScoreCalculationMethod(val as 'AVERAGE' | 'LATEST')
                  }
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="AVERAGE">
                      {t('ws-reports.average')}
                    </TabsTrigger>
                    <TabsTrigger value="LATEST">
                      {t('ws-reports.latest')}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <Separator className="my-2" />

              <ScoreDisplay
                healthcareVitals={healthcareVitals}
                healthcareVitalsLoading={healthcareVitalsLoading}
                isNew={isNew}
                scores={
                  selectedLog ? (selectedLog.scores ?? null) : report.scores
                }
                reportId={report.id}
                onFetchNewScores={
                  !isNew && !selectedLog
                    ? (options) => updateScoresMutation.mutateAsync(options)
                    : undefined
                }
                isFetchingNewScores={updateScoresMutation.isPending}
                factorEnabled={factorEnabled}
                scoreCalculationMethod={scoreCalculationMethod}
              />
            </CollapsibleContent>
          </Collapsible>

          <Collapsible
            open={formOpen}
            onOpenChange={setFormOpen}
            className="rounded-lg border"
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex w-full items-center justify-between p-4"
              >
                <span className="font-semibold text-sm">
                  {t('ws-reports.basic_info')}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${formOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4">
              {isLoadingRejectedBase ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-dynamic-blue" />
                  <div className="text-muted-foreground text-sm">
                    {t('ws-reports.loading_approved_version')}
                  </div>
                </div>
              ) : (
                <UserReportForm
                  isNew={isNew}
                  form={form}
                  submitLabel={isNew ? t('common.create') : t('common.save')}
                  onSubmit={(values) => {
                    if (isNew) createMutation.mutate(values);
                    else
                      updateMutation.mutate({
                        ...values,
                        score: representativeScoreValue,
                      });
                  }}
                  onDelete={
                    !isNew && canDeleteReports
                      ? () => setShowDeleteDialog(true)
                      : undefined
                  }
                  managerOptions={managerOptions}
                  selectedManagerName={
                    selectedManagerName ?? report.creator_name
                  }
                  onChangeManager={(name) => onChangeManagerAction?.(name)}
                  canUpdate={canUpdateReports}
                  canDelete={canDeleteReports}
                  isSubmitting={
                    createMutation.isPending || updateMutation.isPending
                  }
                  showHeading={false}
                />
              )}
            </CollapsibleContent>
          </Collapsible>

          <DeleteReportDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
            onConfirm={() => deleteMutation.mutate()}
          />

          {canApproveReports && (
            <RejectDialog
              open={showRejectDialog}
              title={report.title ?? ''}
              reason={rejectReason}
              onReasonChange={setRejectReason}
              onOpenChange={(open) => {
                setShowRejectDialog(open);
                if (!open) setRejectReason('');
              }}
              onConfirm={() => {
                rejectMutation.mutate(rejectReason, {
                  onSuccess: () => {
                    setShowRejectDialog(false);
                    setRejectReason('');
                  },
                });
              }}
              isSubmitting={rejectMutation.isPending}
            />
          )}

          {report.user_id && canCheckUserAttendance && (
            <Collapsible
              open={attendanceOpen}
              onOpenChange={setAttendanceOpen}
              className="rounded-lg border"
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex w-full items-center justify-between p-4"
                >
                  <span className="font-semibold text-sm">
                    {t('ws-reports.attendance')}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${attendanceOpen ? 'rotate-180' : ''}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4">
                <UserMonthAttendance
                  wsId={wsId}
                  user={{
                    id: report.user_id,
                    full_name: report.user_name,
                    href: `/${wsId}/users/database/${report.user_id}`,
                    archived: report.user_archived,
                    archived_until: report.user_archived_until,
                    note: report.user_note,
                  }}
                  defaultIncludedGroups={[groupId || report.group_id!]}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          {feedbackUser && feedbackGroupName && (
            <UserFeedbackSection
              user={feedbackUser}
              groupName={feedbackGroupName}
              wsId={wsId}
              groupId={groupId || report.group_id || ''}
              canEditFeedback={canEditFeedback}
              canDeleteFeedback={canDeleteFeedback}
            />
          )}
        </div>

        <div className="grid h-fit gap-4 xl:col-span-2">
          {!isNew && (
            <ReportHistory
              logsQuery={logsQuery}
              selectedLog={selectedLog}
              setSelectedLog={setSelectedLog}
              formatRelativeTime={formatRelativeTime}
            />
          )}

          {selectedLog && (
            <div className="-mt-2 rounded-lg border bg-card p-3 text-sm print:hidden">
              <div className="flex items-center justify-between">
                <div>{t('ws-reports.viewing_history_snapshot')}</div>
                <Button
                  variant="default"
                  className="bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20"
                  onClick={() => setSelectedLog(null)}
                >
                  <Undo className="h-4 w-4" />
                  {t('ws-reports.reset_to_current')}
                </Button>
              </div>
            </div>
          )}

          <ReportActions
            isExportBlockedByStatus={isExportBlockedByStatus}
            isExporting={isExporting}
            isPaginationReady={isPaginationReady}
            paginationPageCount={previewPageCount}
            handlePdfExport={handlePdfExport}
            handlePrintExport={handlePrintExport}
            handlePngExport={handlePngExport}
            reportTheme={reportTheme}
            setReportTheme={setReportTheme}
            canApproveReports={canApproveReports}
            isNew={isNew}
            approvalStatus={report.report_approval_status}
            onApprove={() => approveMutation.mutate()}
            onReject={() => setShowRejectDialog(true)}
            isApproving={approveMutation.isPending}
            isRejecting={rejectMutation.isPending}
            defaultExportType={defaultExportType}
            setDefaultExportType={setDefaultExportType}
            printAfterExport={printAfterExport}
            setPrintAfterExport={setPrintAfterExport}
          />

          {previewPageCount > 1 || !isPaginationReady ? (
            <div className="mx-auto w-full max-w-[210mm] rounded-[26px] border bg-card/90 p-4 shadow-sm print:hidden">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="font-medium text-sm">
                    {t('ws-reports.preview_pages')}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {isPaginationReady
                      ? t('ws-reports.preview_pages_description')
                      : t('ws-reports.pagination_updating')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 rounded-full"
                    disabled={!isPaginationReady || activePreviewPage === 0}
                    onClick={() =>
                      setActivePreviewPage(Math.max(0, activePreviewPage - 1))
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('ws-reports.previous_page')}
                  </Button>

                  <div className="rounded-full border bg-background px-3 py-1.5 font-medium text-sm tabular-nums">
                    {isPaginationReady ? activePreviewPage + 1 : 1} /{' '}
                    {previewPageCount}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 rounded-full"
                    disabled={
                      !isPaginationReady ||
                      activePreviewPage >= previewPageCount - 1
                    }
                    onClick={() =>
                      setActivePreviewPage(
                        Math.min(previewPageCount - 1, activePreviewPage + 1)
                      )
                    }
                  >
                    {t('ws-reports.next_page')}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: previewPageCount }, (_, index) => (
                  <Button
                    key={`preview-page-${index + 1}`}
                    size="sm"
                    variant={index === activePreviewPage ? 'default' : 'ghost'}
                    className={cn(
                      'min-w-10 rounded-full px-3',
                      index === activePreviewPage &&
                        'bg-dynamic-blue text-white hover:bg-dynamic-blue/90'
                    )}
                    disabled={!isPaginationReady}
                    onClick={() => setActivePreviewPage(index)}
                  >
                    {index + 1}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="relative mx-auto w-[210mm] min-w-[210mm]">
            <ReportPreview
              t={t}
              lang={locale}
              parseDynamicText={parseDynamicText}
              getConfig={getConfig}
              theme={resolvedReportTheme}
              data={{
                title: previewTitle,
                content: previewContent,
                score: previewScore,
                feedback: previewFeedback,
              }}
              previewPageIndex={activePreviewPage}
              singlePagePreview
              onPaginationStateChange={({ ready, pageCount }) => {
                setIsPaginationReady(ready);
                setPreviewPageCount(Math.max(1, pageCount));
              }}
              notice={
                isPendingApproval ? (
                  <div className="mb-4 rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/10 p-4">
                    <div className="flex items-start gap-3">
                      <ShieldIcon className="mt-0.5 h-5 w-5 text-dynamic-orange" />
                      <div className="flex-1">
                        <div className="font-semibold text-dynamic-orange">
                          {t('ws-reports.needs_approval')}
                        </div>
                        <div className="mt-1 text-dynamic-orange/80 text-sm">
                          {t('ws-reports.needs_approval_description')}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : undefined
              }
            />
            {shouldShowPendingWatermarkValue ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center print:hidden">
                <div className="-rotate-12 rounded-2xl border border-dynamic-yellow/35 bg-dynamic-yellow/10 px-8 py-4 font-semibold text-3xl text-dynamic-yellow/70 uppercase tracking-[0.2em]">
                  {t('ws-reports.pending_watermark')}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
