import { FinanceMonthCardSkeleton } from '@tuturuuu/ui/workspace-dashboard/finance-month-card';
import { MyTasksCard } from '@tuturuuu/ui/workspace-dashboard/my-tasks-card';
import { NextUpCard } from '@tuturuuu/ui/workspace-dashboard/next-up-card';
import { TimeCard } from '@tuturuuu/ui/workspace-dashboard/time-card';
import { TodayAgendaCard } from '@tuturuuu/ui/workspace-dashboard/today-agenda-card';
import { WorkspaceDashboardLayout } from '@tuturuuu/ui/workspace-dashboard/workspace-dashboard-layout';
import { getTranslations } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { FinanceMonthCardSlot } from './finance-month-card-slot';

export interface OverviewCards {
  showAgenda: boolean;
  showTasks: boolean;
  showTime: boolean;
  showFinance: boolean;
  /** `create_transactions`: shows Finance's Log action. */
  canLogTransaction: boolean;
}

export interface OverviewLinks {
  tasksHref: string;
  calendarHref: string;
  trackHref: string;
  financeHref: string;
  /** Tasks app task composer. */
  newTaskHref: string;
  /** Finance transactions page with its create dialog open. */
  logTransactionHref: string;
}

interface WorkspaceOverviewProps {
  wsId: string;
  isPersonal: boolean;
  /** Workspace time zone: Finance's period zone. */
  timeZone: string | null;
  cards: OverviewCards;
  links: OverviewLinks;
  /** Team setup prompt (creator only); null in personal workspaces. */
  setup: ReactNode;
  /** User-group quick actions; null in personal workspaces. */
  groups: ReactNode;
  mira: ReactNode;
}

/**
 * Workspace home: Mira first, then what is next, the viewer's tasks and time,
 * with today's agenda, this month's finance and group actions in the rail.
 * Each card loads and fails on its own, so one slow or failing source never
 * blanks the page.
 */
export async function WorkspaceOverview({
  wsId,
  isPersonal,
  timeZone,
  cards,
  links,
  setup,
  groups,
  mira,
}: WorkspaceOverviewProps) {
  const t = await getTranslations('dashboard.overview');
  const showNext = cards.showAgenda || cards.showTasks || cards.showTime;
  const hasRail = cards.showAgenda || cards.showFinance || Boolean(groups);

  return (
    <WorkspaceDashboardLayout
      label={t('label')}
      railLabel={t('rail_label')}
      dock={mira}
      main={
        <>
          {showNext ? (
            <NextUpCard
              wsId={wsId}
              isPersonal={isPersonal}
              showEvent={cards.showAgenda}
              showTask={cards.showTasks}
              showTime={cards.showTime}
              calendarHref={links.calendarHref}
            />
          ) : null}
          {setup}
          {cards.showTasks ? (
            <MyTasksCard
              wsId={wsId}
              isPersonal={isPersonal}
              tasksHref={links.tasksHref}
              newTaskHref={links.newTaskHref}
            />
          ) : null}
          {cards.showTime ? (
            <TimeCard wsId={wsId} trackHref={links.trackHref} />
          ) : null}
        </>
      }
      rail={
        hasRail ? (
          <>
            {cards.showAgenda ? (
              <TodayAgendaCard wsId={wsId} calendarHref={links.calendarHref} />
            ) : null}
            {cards.showFinance ? (
              <Suspense
                fallback={<FinanceMonthCardSkeleton label={t('loading')} />}
              >
                <FinanceMonthCardSlot
                  wsId={wsId}
                  workspaceTimeZone={timeZone}
                  financeHref={links.financeHref}
                  logHref={
                    cards.canLogTransaction
                      ? links.logTransactionHref
                      : undefined
                  }
                />
              </Suspense>
            ) : null}
            {groups}
          </>
        ) : null
      }
    />
  );
}
