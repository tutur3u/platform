import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  ClipboardList,
  FileText,
  Gauge,
  Layers3,
  LineChart,
  UsersRound,
} from '@tuturuuu/icons';
import type {
  TeachDashboardStatsResponse,
  TulearnBootstrapResponse,
  TulearnWorkspaceSummary,
} from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { getTranslations } from 'next-intl/server';
import { TeachDashboardFeatureGrid } from './teach-dashboard-feature-grid';
import { TeachMetricTile } from './teach-metric-tile';
import { TeachOperationCard } from './teach-operation-card';
import { TeachRealtimePanel } from './teach-realtime-panel';

type TeachGroup = {
  attendance_amount?: number;
  id: string;
  managers?: {
    display_name?: string | null;
    email?: string | null;
    full_name?: string | null;
  }[];
  name: string;
  sessions?: string[];
};

const workflowItems = [
  { accent: 'bg-dynamic-yellow/15', icon: UsersRound, key: 'groups' },
  { accent: 'bg-dynamic-cyan/15', icon: BookOpenCheck, key: 'modules' },
  { accent: 'bg-dynamic-green/15', icon: CalendarCheck, key: 'attendance' },
  { accent: 'bg-dynamic-orange/15', icon: BarChart3, key: 'metrics' },
] as const;

const operationsItems = [
  { accent: 'bg-dynamic-cyan/15', icon: ClipboardList, key: 'plan' },
  { accent: 'bg-dynamic-green/15', icon: CalendarCheck, key: 'attendance' },
  { accent: 'bg-dynamic-pink/15', icon: FileText, key: 'reports' },
  { accent: 'bg-dynamic-orange/15', icon: Gauge, key: 'metrics' },
] as const;

export async function TeachDashboard({
  bootstrap,
  dashboardStats,
  groups,
  moduleCounts,
  totalGroups,
  workspace,
  wsId,
}: {
  bootstrap: TulearnBootstrapResponse;
  dashboardStats: TeachDashboardStatsResponse | null;
  groups: TeachGroup[];
  moduleCounts: Record<string, number>;
  totalGroups: number;
  workspace: TulearnWorkspaceSummary;
  wsId: string;
}) {
  const t = await getTranslations('teachDashboard');
  const totalModules = groups.reduce(
    (sum, group) => sum + (moduleCounts[group.id] ?? 0),
    0
  );
  const sessionCount = groups.reduce(
    (sum, group) => sum + (group.sessions?.length ?? 0),
    0
  );
  const attendanceChecks = groups.reduce(
    (sum, group) => sum + (group.attendance_amount ?? 0),
    0
  );
  const profileName = bootstrap.profile.display_name ?? t('teacher');
  const workspaceName = workspace.name ?? t('workspaceFallback');
  const coursesUrl = `/${wsId}/courses`;

  return (
    <main className="min-h-screen bg-root-background px-4 py-5 text-foreground md:px-6 md:py-8">
      <section className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <p className="mb-4 text-muted-foreground text-sm">
            {t('eyebrow', { name: profileName })}
          </p>
          <h1 className="max-w-4xl text-balance font-semibold text-3xl leading-tight md:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-5 max-w-2xl text-muted-foreground leading-7">
            {t('lead')}
          </p>
          <p className="mt-2 font-bold text-muted-foreground text-sm">
            {workspaceName}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <a
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={coursesUrl}
            >
              {t('manageInPlatform')}
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 font-medium text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`/${wsId}/attendance`}
            >
              {t('checkAttendance')}
            </a>
          </div>
        </div>

        <aside className="grid grid-cols-2 gap-3">
          <TeachMetricTile
            accentClassName="bg-dynamic-yellow/15"
            icon={UsersRound}
            label={t('activeGroups')}
            value={totalGroups}
          />
          <TeachMetricTile
            accentClassName="bg-dynamic-cyan/15"
            icon={Layers3}
            label={t('modules')}
            value={totalModules}
          />
          <TeachMetricTile
            accentClassName="bg-dynamic-green/15"
            icon={CalendarCheck}
            label={t('sessions')}
            value={sessionCount}
          />
          <TeachMetricTile
            accentClassName="bg-dynamic-pink/15"
            icon={LineChart}
            label={t('attendanceChecks')}
            value={attendanceChecks}
          />
        </aside>
      </section>

      <TeachDashboardFeatureGrid
        attendanceChecks={attendanceChecks}
        sessionCount={sessionCount}
        totalGroups={totalGroups}
        totalModules={totalModules}
        wsId={wsId}
      />

      <section className="mx-auto mt-8 grid max-w-7xl gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-semibold text-3xl">{t('groupsTitle')}</h2>
              <p className="mt-2 text-muted-foreground">{t('groupsLead')}</p>
            </div>
            <a
              className="hidden h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 font-semibold text-xs md:inline-flex"
              href={coursesUrl}
            >
              {t('allGroups')}
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          {groups.length ? (
            <div className="grid gap-3">
              {groups.map((group) => (
                <CourseUserGroupCard
                  group={group}
                  key={group.id}
                  moduleCount={moduleCounts[group.id] ?? 0}
                  t={t}
                  wsId={wsId}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border border-dashed bg-muted/60 p-8">
              <p className="font-semibold text-2xl">{t('emptyGroupsTitle')}</p>
              <p className="mt-3 text-muted-foreground leading-7">
                {t('emptyGroupsBody')}
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {workflowItems.map(({ accent, icon: Icon, key }, index) => (
            <article
              className="rounded-lg border border-border bg-card p-5"
              key={key}
            >
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center border border-border',
                    accent
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-muted-foreground text-xs tabular-nums">
                    0{index + 1}
                  </p>
                  <h3 className="font-semibold text-xl">
                    {t(`workflow.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-muted-foreground text-sm leading-6">
                    {t(`workflow.${key}.body`)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </aside>
      </section>

      <TeachRealtimePanel stats={dashboardStats} wsId={wsId} />

      <section className="mx-auto mt-8 max-w-7xl rounded-lg border border-border bg-background p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 text-muted-foreground text-sm">
              <Activity className="h-3.5 w-3.5" />
              {t('operationsEyebrow')}
            </p>
            <h2 className="font-semibold text-3xl">{t('operationsTitle')}</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground leading-7">
              {t('operationsLead')}
            </p>
          </div>
          <a
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-primary px-3 font-semibold text-primary-foreground text-xs"
            href={`/${wsId}/reports`}
          >
            {t('openReports')}
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {operationsItems.map(({ accent, icon: Icon, key }) => (
            <TeachOperationCard
              accentClassName={accent}
              count={
                key === 'plan'
                  ? totalModules
                  : key === 'attendance'
                    ? attendanceChecks
                    : key === 'reports'
                      ? totalGroups
                      : sessionCount
              }
              href={
                key === 'plan'
                  ? `/${wsId}/courses`
                  : key === 'attendance'
                    ? `/${wsId}/attendance`
                    : key === 'reports'
                      ? `/${wsId}/reports`
                      : `/${wsId}/metrics`
              }
              icon={Icon}
              key={key}
              label={t(`operations.${key}.title`)}
              text={t(`operations.${key}.body`)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function CourseUserGroupCard({
  group,
  moduleCount,
  t,
  wsId,
}: {
  group: TeachGroup;
  moduleCount: number;
  t: Awaited<ReturnType<typeof getTranslations>>;
  wsId: string;
}) {
  const baseUrl = `/${wsId}/courses/${group.id}`;
  const manager =
    group.managers?.[0]?.display_name ||
    group.managers?.[0]?.full_name ||
    group.managers?.[0]?.email ||
    t('unassigned');

  return (
    <article className="grid gap-4 rounded-lg border border-border bg-background p-4 md:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">
        <p className="truncate font-semibold text-2xl">{group.name}</p>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('manager', { name: manager })}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <MiniStat label={t('modules')} value={moduleCount} />
          <MiniStat label={t('sessions')} value={group.sessions?.length ?? 0} />
          <MiniStat
            label={t('attendance')}
            value={group.attendance_amount ?? 0}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DashboardLink href={baseUrl} label={t('courseModules')} />
        <DashboardLink
          href={`/${wsId}/attendance?course=${group.id}`}
          label={t('attendance')}
        />
        <DashboardLink
          href={`/${wsId}/reports?course=${group.id}`}
          label={t('reports')}
        />
        <DashboardLink
          href={`/${wsId}/metrics?course=${group.id}`}
          label={t('metrics')}
        />
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/60 px-3 py-2">
      <p className="font-semibold tabular-nums">{value}</p>
      <p className="truncate text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function DashboardLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="inline-flex min-h-10 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 font-semibold text-xs transition"
      href={href}
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </a>
  );
}
