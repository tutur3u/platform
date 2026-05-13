import {
  Building,
  Crown,
  Globe,
  Shield,
  UserCheck,
  Users,
} from '@tuturuuu/icons';
import type { ComponentType } from 'react';
import type { PlatformRoleStats } from './types';

type PlatformRoleOverviewProps = {
  hiveEnabledCount: number;
  labels: {
    activeUsers: string;
    admins: string;
    challengeManagers: string;
    globalManagers: string;
    hiveResearchers: string;
    inactive: string;
    members: string;
    platformCoverage: string;
    visibleDirectory: string;
    workspaceCreators: string;
  };
  stats: PlatformRoleStats;
  totalUsers: number;
};

type StatTone = 'blue' | 'green' | 'muted' | 'purple' | 'red';

const toneClasses: Record<
  StatTone,
  {
    dot: string;
    icon: string;
    value: string;
  }
> = {
  blue: {
    dot: 'bg-dynamic-blue',
    icon: 'text-dynamic-blue',
    value: 'text-dynamic-blue',
  },
  green: {
    dot: 'bg-dynamic-green',
    icon: 'text-dynamic-green',
    value: 'text-dynamic-green',
  },
  muted: {
    dot: 'bg-dynamic-muted',
    icon: 'text-dynamic-muted-foreground',
    value: 'text-dynamic-muted-foreground',
  },
  purple: {
    dot: 'bg-dynamic-purple',
    icon: 'text-dynamic-purple',
    value: 'text-dynamic-purple',
  },
  red: {
    dot: 'bg-dynamic-red',
    icon: 'text-dynamic-red',
    value: 'text-dynamic-red',
  },
};

function StatTile({
  Icon,
  label,
  tone,
  value,
}: {
  Icon: ComponentType<{ className?: string }>;
  label: string;
  tone: StatTone;
  value: number | string;
}) {
  const classes = toneClasses[tone];

  return (
    <div className="rounded-lg border border-dynamic-border/70 bg-dynamic-card/80 p-3 shadow-sm transition-colors hover:bg-dynamic-card">
      <div className="flex items-center justify-between gap-3">
        <Icon className={`h-4 w-4 ${classes.icon}`} />
        <span className={`h-2 w-2 rounded-full ${classes.dot}`} />
      </div>
      <div className={`mt-3 font-semibold text-2xl ${classes.value}`}>
        {value}
      </div>
      <p className="mt-1 text-dynamic-muted-foreground text-xs">{label}</p>
    </div>
  );
}

export function PlatformRoleOverview({
  hiveEnabledCount,
  labels,
  stats,
  totalUsers,
}: PlatformRoleOverviewProps) {
  return (
    <section className="my-6 space-y-4">
      <div className="rounded-lg border border-dynamic-border bg-dynamic-muted/20 p-4">
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <div>
            <p className="font-medium text-dynamic-muted-foreground text-sm">
              {labels.platformCoverage}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <div className="font-semibold text-4xl tabular-nums">
                  {totalUsers}
                </div>
                <p className="text-dynamic-muted-foreground text-xs">
                  {labels.visibleDirectory}
                </p>
              </div>
              <div>
                <div className="font-semibold text-4xl text-dynamic-green tabular-nums">
                  {hiveEnabledCount}
                </div>
                <p className="text-dynamic-muted-foreground text-xs">
                  {labels.hiveResearchers}
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-dynamic-background/70 p-3">
              <div className="font-semibold tabular-nums">{stats.active}</div>
              <div className="text-dynamic-muted-foreground text-xs">
                {labels.activeUsers}
              </div>
            </div>
            <div className="rounded-md bg-dynamic-background/70 p-3">
              <div className="font-semibold tabular-nums">{stats.inactive}</div>
              <div className="text-dynamic-muted-foreground text-xs">
                {labels.inactive}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          Icon={Crown}
          label={labels.admins}
          tone="red"
          value={stats.admins}
        />
        <StatTile
          Icon={Globe}
          label={labels.globalManagers}
          tone="blue"
          value={stats.globalManagers}
        />
        <StatTile
          Icon={Shield}
          label={labels.challengeManagers}
          tone="purple"
          value={stats.challengeManagers}
        />
        <StatTile
          Icon={Building}
          label={labels.workspaceCreators}
          tone="green"
          value={stats.workspaceCreators}
        />
        <StatTile
          Icon={UserCheck}
          label={labels.activeUsers}
          tone="green"
          value={stats.active}
        />
        <StatTile
          Icon={Users}
          label={labels.members}
          tone="muted"
          value={stats.members}
        />
      </div>
    </section>
  );
}
