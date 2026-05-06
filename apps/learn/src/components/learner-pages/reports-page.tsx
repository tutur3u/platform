'use client';

import { useQuery } from '@tanstack/react-query';
import { LineChart } from '@tuturuuu/icons';
import {
  listTulearnReports,
  type TulearnReportSummary,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import {
  EmptyState,
  LoadingState,
  Section,
  usePageMotion,
  useStudentId,
} from './shared';

export function ReportsPage({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const studentId = useStudentId();
  const scopeRef = usePageMotion();
  const reports = useQuery({
    queryFn: () => listTulearnReports(wsId, studentId),
    queryKey: ['tulearn', wsId, studentId, 'reports'],
  });

  if (reports.isLoading) return <LoadingState />;

  return (
    <Section
      description={t('reports.description')}
      refValue={scopeRef}
      title={t('reports.title')}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {reports.data?.reports.map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      </div>
      {!reports.data?.reports.length ? (
        <EmptyState label={t('reports.empty')} />
      ) : null}
    </Section>
  );
}

function ReportCard({ report }: { report: TulearnReportSummary }) {
  return (
    <article
      className="rounded-[2rem] border border-dynamic-blue/20 bg-card p-6 shadow-sm"
      data-tulearn-reveal
    >
      <LineChart className="mb-5 h-7 w-7 text-dynamic-blue" />
      <h3 className="font-bold text-2xl tracking-normal">{report.title}</h3>
      <p className="mt-3 line-clamp-5 text-muted-foreground leading-7">
        {report.feedback || report.content}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {report.course ? (
          <Badge className="bg-dynamic-blue/15 text-dynamic-blue hover:bg-dynamic-blue/15">
            {report.course.name}
          </Badge>
        ) : null}
        {report.score != null ? (
          <Badge className="bg-dynamic-green/15 text-dynamic-green hover:bg-dynamic-green/15">
            {report.score}
          </Badge>
        ) : null}
      </div>
    </article>
  );
}
