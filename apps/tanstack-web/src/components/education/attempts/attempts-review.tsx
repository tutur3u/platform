import { ClipboardList, Filter } from '@tuturuuu/icons';
import type {
  ListWorkspaceEducationAttemptsResponse,
  WorkspaceEducationAttemptListQuery,
  WorkspaceEducationAttemptSummary,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationKpiStrip } from '@tuturuuu/ui/custom/education/shell/education-kpi-strip';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import Link from 'next/link';
import { useTranslations } from 'use-intl';

type EducationAttemptsReviewProps = {
  data: ListWorkspaceEducationAttemptsResponse;
  search: WorkspaceEducationAttemptListQuery;
  wsId: string;
};

function buildAttemptsHref({
  page,
  pageSize,
  search,
  wsId,
}: {
  page: number;
  pageSize: number;
  search: WorkspaceEducationAttemptListQuery;
  wsId: string;
}) {
  const params = new URLSearchParams();
  if (search.dateFrom) params.set('dateFrom', search.dateFrom);
  if (search.dateTo) params.set('dateTo', search.dateTo);
  if (search.learnerId) params.set('learnerId', search.learnerId);
  if (search.setId) params.set('setId', search.setId);
  if (search.sortBy) params.set('sortBy', search.sortBy);
  if (search.sortDirection) params.set('sortDirection', search.sortDirection);
  if (search.status && search.status !== 'all') {
    params.set('status', search.status);
  }
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  const query = params.toString();
  return `/${wsId}/education/attempts${query ? `?${query}` : ''}`;
}

function formatSubmittedAt(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export function EducationAttemptsReview({
  data,
  search,
  wsId,
}: EducationAttemptsReviewProps) {
  const t = useTranslations();
  const page = data.page;
  const pageSize = data.pageSize;
  const totalPages = Math.max(Math.ceil(data.count / pageSize), 1);
  const completedCount = data.attempts.filter(
    (attempt) => attempt.completed_at !== null
  ).length;
  const pendingCount = data.attempts.length - completedCount;

  return (
    <div className="space-y-5 p-4">
      <EducationPageHeader
        title={t('workspace-education-tabs.attempts')}
        description={t('workspace-education-tabs.attempts_description')}
        badge={
          <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-orange/20 bg-dynamic-orange/10 px-3 py-1 font-medium text-dynamic-orange text-xs">
            <ClipboardList className="h-3.5 w-3.5" />
            {t('workspace-education-tabs.teacher_review_queue')}
          </div>
        }
      />

      <EducationKpiStrip
        items={[
          {
            label: t('workspace-education-tabs.attempts'),
            tone: 'orange',
            value: data.count,
          },
          {
            label: t('common.completed'),
            tone: 'green',
            value: completedCount,
          },
          {
            label: t('common.pending'),
            tone: 'purple',
            value: pendingCount,
          },
        ]}
      />

      <EducationContentSurface>
        <form className="grid gap-3 rounded-2xl border border-border/60 bg-background/70 p-3 md:grid-cols-6">
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('ws-quiz-sets.singular')}</Label>
            <select
              name="setId"
              defaultValue={search.setId ?? 'all'}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">{t('common.all')}</option>
              {data.filters.sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('common.status')}</Label>
            <select
              name="status"
              defaultValue={search.status ?? 'all'}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">{t('common.all')}</option>
              <option value="completed">{t('common.completed')}</option>
              <option value="incomplete">{t('common.pending')}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.from')}</Label>
            <Input
              name="dateFrom"
              type="date"
              defaultValue={search.dateFrom ?? ''}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('common.to')}</Label>
            <Input
              name="dateTo"
              type="date"
              defaultValue={search.dateTo ?? ''}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.sort')}</Label>
            <select
              name="sortBy"
              defaultValue={search.sortBy ?? 'newest'}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="newest">{t('common.date')}</option>
              <option value="score">{t('common.score')}</option>
              <option value="duration">{t('common.duration')}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.order')}</Label>
            <select
              name="sortDirection"
              defaultValue={search.sortDirection ?? 'desc'}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="desc">{t('common.descending')}</option>
              <option value="asc">{t('common.ascending')}</option>
            </select>
          </div>

          <input type="hidden" name="pageSize" value={String(pageSize)} />
          <div className="flex items-end md:col-span-6">
            <Button type="submit" className="rounded-xl">
              <Filter className="h-4 w-4" />
              {t('common.apply_filters')}
            </Button>
          </div>
        </form>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('approvals.labels.user')}</TableHead>
                <TableHead>{t('ws-quiz-sets.singular')}</TableHead>
                <TableHead>{t('common.attempt')}</TableHead>
                <TableHead>{t('common.score')}</TableHead>
                <TableHead>{t('common.duration')}</TableHead>
                <TableHead>{t('common.submitted_at')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('common.view')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.attempts.length > 0 ? (
                data.attempts.map((attempt) => (
                  <AttemptRow
                    attempt={attempt}
                    key={attempt.id}
                    t={t}
                    wsId={wsId}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-foreground/65"
                  >
                    {t('common.no_content_yet')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-foreground/65 text-sm">
            {t('common.page')} {page}/{totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page <= 1}
              className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
            >
              <Link
                href={buildAttemptsHref({
                  page: Math.max(page - 1, 1),
                  pageSize,
                  search,
                  wsId,
                })}
              >
                {t('common.previous')}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              className={
                page >= totalPages ? 'pointer-events-none opacity-50' : ''
              }
            >
              <Link
                href={buildAttemptsHref({
                  page: Math.min(page + 1, totalPages),
                  pageSize,
                  search,
                  wsId,
                })}
              >
                {t('common.next')}
              </Link>
            </Button>
          </div>
        </div>
      </EducationContentSurface>
    </div>
  );
}

function AttemptRow({
  attempt,
  t,
  wsId,
}: {
  attempt: WorkspaceEducationAttemptSummary;
  t: ReturnType<typeof useTranslations>;
  wsId: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">
          {attempt.learner_name || t('common.unknown')}
        </div>
        <div className="text-foreground/65 text-xs">
          {attempt.learner_email || attempt.user_id}
        </div>
      </TableCell>
      <TableCell>{attempt.set_name || t('common.unknown')}</TableCell>
      <TableCell>#{attempt.attempt_number}</TableCell>
      <TableCell>{attempt.total_score ?? '-'}</TableCell>
      <TableCell>
        {attempt.duration_seconds
          ? `${Math.round(attempt.duration_seconds / 60)}m`
          : '-'}
      </TableCell>
      <TableCell>{formatSubmittedAt(attempt.submitted_at)}</TableCell>
      <TableCell>
        {attempt.completed_at ? t('common.completed') : t('common.pending')}
      </TableCell>
      <TableCell className="text-right">
        <Button asChild variant="outline" size="sm">
          <Link href={`/${wsId}/education/attempts/${attempt.id}`}>
            {t('common.view')}
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
