'use client';

import { BarChart3, CalendarDays, Settings2 } from '@tuturuuu/icons';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import PostsClient from '../posts/client';
import type { PostsSearchParams } from '../posts/types';
import AutomationsPanel from './automations-panel';
import PeriodicReportsPanel from './periodic-reports-panel';

const reportViews = ['daily', 'periodic', 'automations'] as const;
type ReportView = (typeof reportViews)[number];

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
  };
  postSearchParams: PostsSearchParams;
  wsId: string;
}) {
  const t = useTranslations('reports-hub');
  const defaultView: ReportView =
    initialView === 'daily' && canViewDaily
      ? 'daily'
      : initialView === 'automations' && canViewPeriodic
        ? 'automations'
        : canViewPeriodic
          ? 'periodic'
          : 'daily';
  const [view, setView] = useQueryState(
    'view',
    parseAsStringEnum<ReportView>([...reportViews]).withDefault(defaultView)
  );

  return (
    <main className="space-y-4 p-2 md:space-y-6 md:p-6">
      <FeatureSummary
        pluralTitle={t('title')}
        singularTitle={t('title')}
        description={t('description')}
      />
      <Tabs
        value={view}
        onValueChange={(next) => void setView(next as ReportView)}
      >
        <TabsList className="grid h-auto w-full grid-cols-3 md:w-fit">
          {canViewDaily && (
            <TabsTrigger value="daily" className="h-full gap-2">
              <CalendarDays className="h-4 w-4" />
              <span>{t('daily')}</span>
            </TabsTrigger>
          )}
          {canViewPeriodic && (
            <TabsTrigger value="periodic" className="h-full gap-2">
              <BarChart3 className="h-4 w-4" />
              <span>{t('periodic')}</span>
            </TabsTrigger>
          )}
          {canViewPeriodic && (
            <TabsTrigger value="automations" className="h-full gap-2">
              <Settings2 className="h-4 w-4" />
              <span>{t('automations')}</span>
            </TabsTrigger>
          )}
        </TabsList>
        {canViewDaily && (
          <TabsContent value="daily" className="mt-4">
            <PostsClient
              embedded
              locale={locale}
              searchParams={postSearchParams}
              wsId={wsId}
            />
          </TabsContent>
        )}
        {canViewPeriodic && (
          <TabsContent value="periodic" className="mt-4">
            <PeriodicReportsPanel
              permissions={periodicPermissions}
              wsId={wsId}
            />
          </TabsContent>
        )}
        {canViewPeriodic && (
          <TabsContent value="automations" className="mt-4">
            <AutomationsPanel canManage={canManageAutomation} wsId={wsId} />
          </TabsContent>
        )}
      </Tabs>
    </main>
  );
}
