import { ClipboardList, Filter } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
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
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';

export const metadata: Metadata = {
  title: 'Attempts',
  description: 'Review quiz attempts and learner outcomes in your workspace.',
};

interface SearchParams {
  dateFrom?: string;
  dateTo?: string;
  learnerId?: string;
  page?: string;
  pageSize?: string;
  setId?: string;
  sortBy?: 'duration' | 'newest' | 'score';
  sortDirection?: 'asc' | 'desc';
  status?: 'all' | 'completed' | 'incomplete';
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function QuizAttemptsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId: routeWsId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const search = await searchParams;
  const page = Math.max(parseInt(search.page || '1', 10) || 1, 1);
  const pageSize = Math.min(
    Math.max(parseInt(search.pageSize || '20', 10) || 20, 1),
    100
  );

  const sbAdmin = await createAdminClient();
  const queryBuilder = sbAdmin
    .from('workspace_quiz_attempts')
    .select(
      'id, attempt_number, started_at, submitted_at, completed_at, duration_seconds, total_score, set_id, user_id, workspace_quiz_sets!inner(id, name, ws_id)',
      { count: 'exact' }
    )
    .eq('workspace_quiz_sets.ws_id', resolvedWsId);

  if (search.setId) queryBuilder.eq('set_id', search.setId);
  if (search.learnerId) queryBuilder.eq('user_id', search.learnerId);
  if (search.status === 'completed')
    queryBuilder.not('completed_at', 'is', null);
  if (search.status === 'incomplete') queryBuilder.is('completed_at', null);
  if (search.dateFrom) queryBuilder.gte('submitted_at', search.dateFrom);
  if (search.dateTo) queryBuilder.lte('submitted_at', search.dateTo);

  if (search.sortBy === 'score') {
    queryBuilder.order('total_score', {
      ascending: search.sortDirection === 'asc',
    });
  } else if (search.sortBy === 'duration') {
    queryBuilder.order('duration_seconds', {
      ascending: search.sortDirection === 'asc',
    });
  } else {
    queryBuilder.order('submitted_at', {
      ascending: search.sortDirection === 'asc',
    });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  queryBuilder.range(from, to);

  const { data: attempts, error: attemptsError, count } = await queryBuilder;
  if (attemptsError) throw attemptsError;

  const learnerIds = [
    ...new Set((attempts ?? []).map((attempt) => attempt.user_id)),
  ];
  const [learnersResponse, setsResponse] = await Promise.all([
    learnerIds.length > 0
      ? sbAdmin
          .from('user_private_details')
          .select('user_id, full_name, email')
          .in('user_id', learnerIds)
      : Promise.resolve({ data: [], error: null }),
    sbAdmin
      .from('workspace_quiz_sets')
      .select('id, name')
      .eq('ws_id', resolvedWsId)
      .order('name'),
  ]);

  if (learnersResponse.error) throw learnersResponse.error;
  if (setsResponse.error) throw setsResponse.error;

  const learnerById = new Map(
    (learnersResponse.data ?? []).map((learner) => [learner.user_id, learner])
  );
  const totalCount = count ?? 0;
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
  const completedCount =
    attempts?.filter((attempt) => attempt.completed_at !== null).length ?? 0;

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
            value: totalCount,
          },
          {
            label: t('common.completed'),
            tone: 'green',
            value: completedCount,
          },
          {
            label: t('common.pending'),
            tone: 'purple',
            value: (attempts?.length ?? 0) - completedCount,
          },
        ]}
      />

      <EducationContentSurface>
        <form className="grid gap-3 rounded-2xl border border-border/60 bg-background/70 p-3 md:grid-cols-6">
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('ws-quiz-sets.singular')}</Label>
            <select
              name="setId"
              defaultValue={search.setId || 'all'}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">{t('common.all')}</option>
              {(setsResponse.data ?? []).map((set) => (
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
              defaultValue={search.status || 'all'}
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
              defaultValue={search.dateFrom || ''}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('common.to')}</Label>
            <Input
              name="dateTo"
              type="date"
              defaultValue={search.dateTo || ''}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.sort')}</Label>
            <select
              name="sortBy"
              defaultValue={search.sortBy || 'newest'}
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
              defaultValue={search.sortDirection || 'desc'}
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
              {(attempts ?? []).length > 0 ? (
                attempts?.map((attempt) => {
                  const learner = learnerById.get(attempt.user_id);
                  const joinedSet = Array.isArray(attempt.workspace_quiz_sets)
                    ? attempt.workspace_quiz_sets[0]
                    : attempt.workspace_quiz_sets;

                  return (
                    <TableRow key={attempt.id}>
                      <TableCell>
                        <div className="font-medium">
                          {learner?.full_name || t('common.unknown')}
                        </div>
                        <div className="text-foreground/65 text-xs">
                          {learner?.email || attempt.user_id}
                        </div>
                      </TableCell>
                      <TableCell>
                        {joinedSet?.name || t('common.unknown')}
                      </TableCell>
                      <TableCell>#{attempt.attempt_number}</TableCell>
                      <TableCell>{attempt.total_score ?? '-'}</TableCell>
                      <TableCell>
                        {attempt.duration_seconds
                          ? `${Math.round(attempt.duration_seconds / 60)}m`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {new Date(attempt.submitted_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {attempt.completed_at
                          ? t('common.completed')
                          : t('common.pending')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`/${routeWsId}/education/attempts/${attempt.id}`}
                          >
                            {t('common.view')}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
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
                href={`/${routeWsId}/education/attempts?${new URLSearchParams({
                  ...Object.fromEntries(
                    Object.entries(search).filter(([, value]) => value)
                  ),
                  page: String(Math.max(page - 1, 1)),
                  pageSize: String(pageSize),
                }).toString()}`}
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
                href={`/${routeWsId}/education/attempts?${new URLSearchParams({
                  ...Object.fromEntries(
                    Object.entries(search).filter(([, value]) => value)
                  ),
                  page: String(Math.min(page + 1, totalPages)),
                  pageSize: String(pageSize),
                }).toString()}`}
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
