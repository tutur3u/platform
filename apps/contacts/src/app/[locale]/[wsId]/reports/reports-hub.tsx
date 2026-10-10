'use client';

import { BarChart3, CalendarDays, Settings2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import PostsClient from '../posts/client';
import type { PostsSearchParams } from '../posts/types';
import AutomationsPanel from './automations-panel';
import PeriodicReportsPanel from './periodic-reports-panel';
import {
  type DashboardCadence,
  dashboardCadences,
  resolveDashboardCadence,
} from './report-dashboard-cadence';
import {
  type ReportView,
  reportViews,
  resolveDefaultReportView,
} from './report-view';

export default function ReportsHub({
  canManageAutomation,
  canViewDaily,
  canViewPeriodic,
  initialView,
  locale,
  periodicPermissions,
  postSearchParams,
  wsId,
}: {
  canManageAutomation: boolean;
  canViewDaily: boolean;
  canViewPeriodic: boolean;
  initialView?: string;
  locale: string;
  periodicPermissions: {
    canApproveReports: boolean;
    canCheckUserAttendance: boolean;
    canCreateReports: boolean;
    canDeleteReports: boolean;
    canSendReports: boolean;
    canUpdateReports: boolean;
    canUpdateUsers?: boolean;
  };
  postSearchParams: PostsSearchParams;
  wsId: string;
}) {
  const t = useTranslations('reports-hub');
  const defaultView = resolveDefaultReportView({
    canViewDaily,
    canViewPeriodic,
    initialView,
  });
  const [view, setView] = useQueryState(
    'view',
    parseAsStringEnum<ReportView>([...reportViews]).withDefault(defaultView)
  );

  const [periodicCadence, setPeriodicCadence] = useQueryState(
    'reportCadence',
    parseAsStringEnum<Exclude<DashboardCadence, 'daily'>>([
      'all',
      'weekly',
      'monthly',
      'quarterly',
      'yearly',
    ]).withDefault('monthly')
  );
  const activeView = resolveDefaultReportView({
    canViewDaily,
    canViewPeriodic,
    initialView: view,
  });
  const worklistView =
    activeView === 'automations'
      ? canViewDaily
        ? 'daily'
        : 'periodic'
      : activeView;
  const cadence = resolveDashboardCadence(activeView, periodicCadence);
  const selectCadence = (next: DashboardCadence) => {
    if (next === 'daily') void setView('daily');
    else {
      void setPeriodicCadence(next);
      void setView('periodic');
    }
  };

  return (
    <main className="min-w-0 space-y-4 p-2 md:space-y-6 md:p-6">
      <h1 className="font-semibold text-2xl tracking-tight">{t('title')}</h1>
      <Tabs
        value={activeView}
        onValueChange={(next) => void setView(next as ReportView)}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="inline-flex h-auto max-w-full flex-wrap">
            <TabsTrigger value={worklistView} className="gap-2">
              <BarChart3 className="size-4" aria-hidden="true" />
              <span>{t('worklist')}</span>
            </TabsTrigger>
            {canViewPeriodic && (
              <TabsTrigger value="automations" className="gap-2">
                <Settings2 className="size-4" aria-hidden="true" />
                <span>{t('automations')}</span>
              </TabsTrigger>
            )}
          </TabsList>
          {activeView !== 'automations' && (
            <fieldset
              aria-label={t('cadence')}
              className="flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1"
            >
              {dashboardCadences
                .filter((value) =>
                  value === 'daily' ? canViewDaily : canViewPeriodic
                )
                .map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={cadence === value ? 'secondary' : 'ghost'}
                    aria-pressed={cadence === value}
                    onClick={() => selectCadence(value)}
                    className="h-8 gap-1.5 px-2.5 text-xs sm:px-3"
                  >
                    {value === 'daily' && (
                      <CalendarDays className="size-3.5" aria-hidden="true" />
                    )}
                    {t(value === 'all' ? 'all_periodic' : value)}
                  </Button>
                ))}
            </fieldset>
          )}
        </div>
        {canViewDaily && (
          <TabsContent value="daily" className="mt-4 min-w-0">
            <PostsClient
              embedded
              locale={locale}
              searchParams={postSearchParams}
              wsId={wsId}
            />
          </TabsContent>
        )}
        {canViewPeriodic && (
          <TabsContent value="periodic" className="mt-4 min-w-0">
            <PeriodicReportsPanel
              cadence={periodicCadence}
              permissions={periodicPermissions}
              wsId={wsId}
            />
          </TabsContent>
        )}
        {canViewPeriodic && (
          <TabsContent value="automations" className="mt-4 min-w-0">
            <AutomationsPanel canManage={canManageAutomation} wsId={wsId} />
          </TabsContent>
        )}
      </Tabs>
    </main>
  );
}
