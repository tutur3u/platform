import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  ClipboardList,
  FileText,
  Gauge,
  GraduationCap,
  Layers3,
  LineChart,
  UsersRound,
} from '@tuturuuu/icons';
import type {
  TulearnBootstrapResponse,
  TulearnWorkspaceSummary,
} from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { getTranslations } from 'next-intl/server';
import { LEARN_APP_URL, WEB_APP_URL } from '@/constants/common';
import { Link } from '@/i18n/navigation';
import { TeachDashboardFeatureGrid } from './teach-dashboard-feature-grid';
import { TeachMetricTile } from './teach-metric-tile';
import { TeachOperationCard } from './teach-operation-card';
import { TeachThemeControl } from './teach-theme-control';

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
  groups,
  moduleCounts,
  totalGroups,
  workspace,
  wsId,
}: {
  bootstrap: TulearnBootstrapResponse;
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
  const platformGroupsUrl = `${WEB_APP_URL}/${wsId}/users/groups`;

  return (
    <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
      <nav className="mx-auto flex max-w-7xl flex-nowrap items-center gap-3 border-2 border-border bg-background p-2 shadow-[5px_5px_0_var(--border)]">
        <Link className="flex min-w-0 items-center gap-2" href="/dashboard">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-dynamic-yellow/15">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block font-black text-lg">Teach</span>
            <span className="block truncate text-muted-foreground text-xs">
              {workspace.name ?? t('workspaceFallback')}
            </span>
          </span>
        </Link>
        <div className="ml-auto flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {bootstrap.workspaces.slice(0, 4).map((candidate) => (
            <Link
              className={`h-10 shrink-0 border-2 border-border px-3 py-2 font-black text-xs shadow-[2px_2px_0_var(--border)] ${
                candidate.id === wsId
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background'
              }`}
              href={`/${candidate.id}`}
              key={candidate.id}
            >
              {candidate.name ?? t('workspaceFallback')}
            </Link>
          ))}
          <TeachThemeControl compact />
          <a
            className="inline-flex h-10 shrink-0 items-center gap-2 border-2 border-border bg-background px-3 font-black text-xs shadow-[2px_2px_0_var(--border)]"
            href={LEARN_APP_URL}
          >
            {t('openLearn')}
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </nav>

      <section className="mx-auto mt-8 grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)] md:p-8">
          <p className="mb-4 inline-flex border-2 border-border bg-dynamic-yellow/15 px-3 py-1 font-black text-xs shadow-[3px_3px_0_var(--border)]">
            {t('eyebrow', { name: profileName })}
          </p>
          <h1 className="max-w-4xl text-balance font-black text-[clamp(2.25rem,5vw,4.75rem)] leading-[0.92]">
            {t('title')}
          </h1>
          <p className="mt-5 max-w-2xl text-muted-foreground leading-7">
            {t('lead')}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              className="inline-flex h-11 items-center gap-2 border-2 border-border bg-primary px-4 font-black text-primary-foreground shadow-[4px_4px_0_var(--border)]"
              href={platformGroupsUrl}
            >
              {t('manageInPlatform')}
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              className="inline-flex h-11 items-center gap-2 border-2 border-border bg-background px-4 font-black shadow-[4px_4px_0_var(--border)]"
              href={`${WEB_APP_URL}/${wsId}/users/attendance`}
            >
              {t('checkAttendance')}
            </a>
          </div>
        </div>

        <aside className="grid gap-3">
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
              <h2 className="font-black text-3xl">{t('groupsTitle')}</h2>
              <p className="mt-2 text-muted-foreground">{t('groupsLead')}</p>
            </div>
            <a
              className="hidden h-10 items-center gap-2 border-2 border-border bg-background px-3 font-black text-xs shadow-[2px_2px_0_var(--border)] md:inline-flex"
              href={platformGroupsUrl}
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
            <div className="border-2 border-border border-dashed bg-muted/60 p-8 shadow-[6px_6px_0_var(--border)]">
              <p className="font-black text-2xl">{t('emptyGroupsTitle')}</p>
              <p className="mt-3 text-muted-foreground leading-7">
                {t('emptyGroupsBody')}
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {workflowItems.map(({ accent, icon: Icon, key }, index) => (
            <article
              className="border-2 border-foreground/70 bg-card p-5 shadow-[5px_5px_0_var(--foreground)]"
              key={key}
            >
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center border-2 border-border',
                    accent
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-black text-muted-foreground text-xs tabular-nums">
                    0{index + 1}
                  </p>
                  <h3 className="font-black text-xl">
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

      <section className="mx-auto mt-8 max-w-7xl border-2 border-foreground/70 bg-background p-5 shadow-[8px_8px_0_var(--foreground)] md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 border-2 border-border bg-dynamic-yellow/15 px-3 py-1 font-black text-xs shadow-[3px_3px_0_var(--border)]">
              <Activity className="h-3.5 w-3.5" />
              {t('operationsEyebrow')}
            </p>
            <h2 className="font-black text-3xl">{t('operationsTitle')}</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground leading-7">
              {t('operationsLead')}
            </p>
          </div>
          <a
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 border-2 border-border bg-primary px-3 font-black text-primary-foreground text-xs shadow-[2px_2px_0_var(--border)]"
            href={`${WEB_APP_URL}/${wsId}/users/reports`}
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
                  ? `${WEB_APP_URL}/${wsId}/users/groups`
                  : key === 'attendance'
                    ? `${WEB_APP_URL}/${wsId}/users/attendance`
                    : key === 'reports'
                      ? `${WEB_APP_URL}/${wsId}/users/reports`
                      : `${WEB_APP_URL}/${wsId}/users/groups/indicators`
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
  const baseUrl = `${WEB_APP_URL}/${wsId}/users/groups/${group.id}`;
  const manager =
    group.managers?.[0]?.display_name ||
    group.managers?.[0]?.full_name ||
    group.managers?.[0]?.email ||
    t('unassigned');

  return (
    <article className="grid gap-4 border-2 border-border bg-background p-4 shadow-[5px_5px_0_var(--border)] md:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">
        <p className="truncate font-black text-2xl">{group.name}</p>
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
        <InternalDashboardLink href={`/${wsId}/modules`} label={t('courseModules')} />
        <DashboardLink href={`${baseUrl}/attendance`} label={t('attendance')} />
        <DashboardLink href={`${baseUrl}/reports`} label={t('reports')} />
        <DashboardLink href={`${baseUrl}/indicators`} label={t('metrics')} />
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-2 border-border bg-muted/60 px-3 py-2">
      <p className="font-black tabular-nums">{value}</p>
      <p className="truncate text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function DashboardLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="inline-flex min-h-10 items-center justify-between gap-2 border-2 border-border bg-card px-3 py-2 font-black text-xs shadow-[2px_2px_0_var(--border)] transition active:translate-x-1 active:translate-y-1 active:shadow-none"
      href={href}
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </a>
  );
}

// Locale-aware internal link for teach app routes
function InternalDashboardLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      className="inline-flex min-h-10 items-center justify-between gap-2 border-2 border-border bg-dynamic-cyan/15 px-3 py-2 font-black text-xs shadow-[2px_2px_0_var(--border)] transition active:translate-x-1 active:translate-y-1 active:shadow-none"
      href={href}
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}
