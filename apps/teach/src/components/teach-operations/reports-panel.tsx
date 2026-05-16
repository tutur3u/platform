'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from '@tuturuuu/icons';
import {
  createWorkspaceCourseReport,
  listWorkspaceCourseIndicators,
  listWorkspaceCourseMembers,
  listWorkspaceCourseReports,
  type TeachReport,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ReportPreviewer } from './report-previewer';

export function ReportsPanel({
  courseId,
  courseName,
  wsId,
}: {
  courseId: string;
  courseName: string;
  wsId: string;
}) {
  const t = useTranslations('teachOperations');
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState('');
  const [selectedReportId, setSelectedReportId] = useState('');
  const [previewMode, setPreviewMode] = useState<'draft' | 'existing'>('draft');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [feedback, setFeedback] = useState('');
  const [score, setScore] = useState('');

  const membersQuery = useQuery({
    enabled: Boolean(courseId),
    queryFn: () => listWorkspaceCourseMembers(wsId, courseId),
    queryKey: ['teach-course-members', wsId, courseId],
  });
  const reportsQuery = useQuery({
    enabled: Boolean(courseId),
    queryFn: () => listWorkspaceCourseReports(wsId, courseId),
    queryKey: ['teach-reports', wsId, courseId],
  });
  const indicatorsQuery = useQuery({
    enabled: Boolean(courseId),
    queryFn: () => listWorkspaceCourseIndicators(wsId, courseId),
    queryKey: ['teach-indicators', wsId, courseId],
  });

  const members = membersQuery.data?.data ?? [];
  const activeUserId = userId || members[0]?.id || '';
  const activeUser = members.find((member) => member.id === activeUserId);
  const reports = reportsQuery.data?.data ?? [];
  const reportsForUser = reports.filter(
    (report) => report.user_id === activeUserId
  );
  const selectedReport =
    reportsForUser.find((report) => report.id === selectedReportId) ??
    reportsForUser[0] ??
    null;
  const userMetricValues = (indicatorsQuery.data?.values ?? []).filter(
    (value) => value.user_id === activeUserId
  );
  const averageMetric = useMemo(() => {
    const numericValues = userMetricValues
      .map((value) => value.value)
      .filter((value): value is number => typeof value === 'number');
    if (!numericValues.length) return null;
    return Math.round(
      numericValues.reduce((sum, value) => sum + value, 0) /
        numericValues.length
    );
  }, [userMetricValues]);
  const draftScore = score.trim() ? Number(score) : averageMetric;
  const previewReport =
    previewMode === 'existing' && selectedReport ? selectedReport : null;
  const previewTitle = previewReport?.title ?? title;
  const previewContent = previewReport?.content ?? content;
  const previewFeedback = previewReport?.feedback ?? feedback;
  const previewScore = previewReport?.score ?? draftScore;

  const createReport = useMutation({
    mutationFn: () =>
      createWorkspaceCourseReport(wsId, courseId, {
        content,
        feedback,
        score: draftScore,
        scores:
          draftScore === null
            ? null
            : userMetricValues
                .map((value) => value.value)
                .filter((value): value is number => typeof value === 'number'),
        title,
        user_id: activeUserId,
      }),
    onError: () => {
      toast.error(t('reportSaveError'));
    },
    onSuccess: () => {
      toast.success(t('reportSaved'));
      setTitle('');
      setContent('');
      setFeedback('');
      setScore('');
      setPreviewMode('existing');
      queryClient.invalidateQueries({
        queryKey: ['teach-reports', wsId, courseId],
      });
    },
  });

  const updateDraftField = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPreviewMode('draft');
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="space-y-4">
        <ReportPreviewer
          content={previewContent}
          courseId={courseId}
          courseName={courseName}
          feedback={previewFeedback}
          indicators={indicatorsQuery.data?.indicators ?? []}
          report={previewReport}
          score={previewScore}
          title={previewTitle}
          user={activeUser}
          values={userMetricValues}
          wsId={wsId}
        />

        <div className="grid gap-3 md:grid-cols-2">
          {reports.map((report) => (
            <ReportCard
              active={
                previewMode === 'existing' && selectedReportId === report.id
              }
              key={report.id}
              onSelect={() => {
                setSelectedReportId(report.id);
                setUserId(report.user_id);
                setPreviewMode('existing');
              }}
              report={report}
            />
          ))}
          {!reports.length ? (
            <div className="border-2 border-border border-dashed bg-muted/50 p-6">
              <p className="font-black">{t('noReportsYet')}</p>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('noReportsYetBody')}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="space-y-4 border-2 border-border bg-background p-4 shadow-[5px_5px_0_var(--border)]">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-dynamic-pink/10">
            <FilePlus2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-black text-lg">{t('reportComposer')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('reportComposerLead')}
            </p>
          </div>
        </div>

        <label className="grid gap-1 text-sm">
          <span className="font-bold">{t('learner')}</span>
          <select
            className="h-11 w-full border-2 border-border bg-card px-3 font-bold outline-none focus:border-primary"
            onChange={(event) => {
              setUserId(event.target.value);
              setSelectedReportId('');
              setPreviewMode('draft');
            }}
            value={activeUserId}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name ?? member.display_name ?? member.email}
              </option>
            ))}
          </select>
        </label>

        <Input
          className="h-11 border-2 border-border bg-card font-bold"
          onChange={(event) => updateDraftField(setTitle, event.target.value)}
          placeholder={t('reportTitle')}
          value={title}
        />
        <Textarea
          className="min-h-36 border-2 border-border bg-card"
          onChange={(event) => updateDraftField(setContent, event.target.value)}
          placeholder={t('reportContent')}
          value={content}
        />
        <Textarea
          className="min-h-28 border-2 border-border bg-card"
          onChange={(event) =>
            updateDraftField(setFeedback, event.target.value)
          }
          placeholder={t('reportFeedback')}
          value={feedback}
        />
        <Input
          className="h-11 border-2 border-border bg-card"
          onChange={(event) => updateDraftField(setScore, event.target.value)}
          placeholder={t('reportScore')}
          type="number"
          value={score}
        />

        <Button
          className="w-full"
          disabled={
            createReport.isPending ||
            !activeUserId ||
            !title.trim() ||
            !content.trim()
          }
          onClick={() => createReport.mutate()}
          type="button"
        >
          {createReport.isPending ? t('saving') : t('createReport')}
        </Button>
      </aside>
    </section>
  );
}

function ReportCard({
  active,
  onSelect,
  report,
}: {
  active: boolean;
  onSelect: () => void;
  report: TeachReport;
}) {
  const t = useTranslations('teachOperations');
  const learnerName =
    report.user?.full_name ??
    report.user?.display_name ??
    report.user?.email ??
    t('learner');

  return (
    <button
      className={cn(
        'space-y-3 border-2 border-border bg-card p-4 text-left shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5',
        active && 'border-primary bg-primary/5'
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-black text-lg">{report.title}</p>
          <p className="truncate text-muted-foreground text-xs">
            {learnerName}
          </p>
        </div>
        {report.report_approval_status ? (
          <Badge variant="outline">
            {t(`reportStatus.${report.report_approval_status}`)}
          </Badge>
        ) : null}
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap text-sm">
        {report.content}
      </p>
    </button>
  );
}
