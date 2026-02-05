'use client';

import { Loader2, Shield as ShieldIcon, Undo } from '@tuturuuu/icons';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import { Button } from '@tuturuuu/ui/button';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import * as z from 'zod';
import UserMonthAttendance from '../../attendance/user-month-attendance';
import { DeleteReportDialog } from './components/delete-report-dialog';
import { ReportActions } from './components/report-actions';
import { ReportHistory } from './components/report-history';
import UserReportForm from './form';
import { useReportExport } from './hooks/use-report-export';
import { useReportHistory } from './hooks/use-report-history';
import {
  type UserReport,
  useReportMutations,
} from './hooks/use-report-mutations';
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
  canDeleteReports = false,
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
  canUpdateReports?: boolean;
  canDeleteReports?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations();

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
  >('scoreCalculationMethod', 'AVERAGE');

  const {
    createMutation,
    updateMutation,
    deleteMutation,
    updateScoresMutation,
  } = useReportMutations({
    wsId,
    report,
    isNew,
    healthcareVitals,
    factorEnabled,
    scoreCalculationMethod,
  });

  const configMap = useMemo(() => {
    const map = new Map<string, string>();
    configs.forEach((config) => {
      if (config.id && config.value) {
        map.set(config.id, config.value);
      }
    });
    return map;
  }, [configs]);

  const getConfig = (id: string) => configMap.get(id);

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

  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';
    const segments = text.split(/({{.*?}})/g).filter(Boolean);
    const parsedText = segments.map((segment, index) => {
      const match = segment.match(/{{(.*?)}}/);
      if (match) {
        const key = match?.[1]?.trim() || '';
        if (key === 'user_name') {
          return (
            <span key={key + index} className="font-semibold">
              {report.user_name || '...'}
            </span>
          );
        }
        if (key === 'group_name') {
          return (
            <span key={key + index} className="font-semibold">
              {report.group_name || '...'}
            </span>
          );
        }
        if (key === 'group_manager_name') {
          return (
            <span key={key + index} className="font-semibold">
              {report.creator_name || '...'}
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

  const [isDarkPreview, setIsDarkPreview] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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

  const { handlePrintExport, handlePngExport, isExporting } = useReportExport({
    previewTitle,
    isDarkPreview,
  });

  const isPendingApproval = report.report_approval_status === 'PENDING';

  return (
    <div className="grid h-fit gap-4 xl:grid-cols-3">
      <div className="grid h-fit gap-4">
        <div className="grid h-fit gap-2 rounded-lg border p-4">
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
            scores={selectedLog ? (selectedLog.scores ?? null) : report.scores}
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
        </div>

        {isLoadingRejectedBase ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border p-4">
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
            selectedManagerName={selectedManagerName ?? report.creator_name}
            onChangeManager={(name) => onChangeManagerAction?.(name)}
            canUpdate={canUpdateReports}
            canDelete={canDeleteReports}
          />
        )}

        <DeleteReportDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={() => deleteMutation.mutate()}
        />

        {report.user_id && canCheckUserAttendance && (
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
          isPendingApproval={isPendingApproval}
          isExporting={isExporting}
          handlePrintExport={handlePrintExport}
          handlePngExport={handlePngExport}
          setIsDarkPreview={setIsDarkPreview}
        />

        <ReportPreview
          t={t}
          lang={locale}
          parseDynamicText={parseDynamicText}
          getConfig={getConfig}
          theme={isDarkPreview ? 'dark' : 'light'}
          data={{
            title: previewTitle,
            content: previewContent,
            score: previewScore,
            feedback: previewFeedback,
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
      </div>
    </div>
  );
}
