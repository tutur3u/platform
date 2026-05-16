import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  FileText,
  Sparkles,
  UsersRound,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { getTranslations } from 'next-intl/server';
import { LEARN_APP_URL } from '@/constants/common';

export async function TeachDashboardFeatureGrid({
  attendanceChecks,
  sessionCount,
  totalGroups,
  totalModules,
  wsId,
}: {
  attendanceChecks: number;
  sessionCount: number;
  totalGroups: number;
  totalModules: number;
  wsId: string;
}) {
  const t = await getTranslations('teachDashboard');
  const featureCards = [
    {
      href: `/${wsId}/courses`,
      icon: UsersRound,
      key: 'groups',
      surface: 'bg-dynamic-yellow/15',
      value: totalGroups,
    },
    {
      href: `/${wsId}/courses`,
      icon: BookOpenCheck,
      key: 'modules',
      surface: 'bg-dynamic-cyan/15',
      value: totalModules,
    },
    {
      href: `/${wsId}/attendance`,
      icon: CalendarCheck,
      key: 'attendance',
      surface: 'bg-dynamic-green/15',
      value: attendanceChecks,
    },
    {
      href: `/${wsId}/reports`,
      icon: FileText,
      key: 'reports',
      surface: 'bg-dynamic-pink/15',
      value: totalGroups,
    },
    {
      href: `/${wsId}/metrics`,
      icon: BarChart3,
      key: 'metrics',
      surface: 'bg-dynamic-orange/15',
      value: sessionCount,
    },
    {
      href: `${LEARN_APP_URL}/dashboard`,
      icon: Sparkles,
      key: 'preview',
      surface: 'bg-dynamic-purple/15',
      value: t('featureGrid.previewValue'),
    },
  ] as const;

  return (
    <section className="mx-auto mt-8 max-w-7xl border-2 border-border bg-background p-5 shadow-[8px_8px_0_var(--border)] md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 inline-flex border-2 border-border bg-dynamic-pink/15 px-3 py-1 font-black text-xs shadow-[3px_3px_0_var(--border)]">
            {t('featureGrid.eyebrow')}
          </p>
          <h2 className="font-black text-3xl tracking-normal">
            {t('featureGrid.title')}
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground leading-7">
            {t('featureGrid.lead')}
          </p>
        </div>
        <a
          className="inline-flex h-10 w-fit shrink-0 items-center gap-2 border-2 border-border bg-primary px-3 font-black text-primary-foreground text-xs shadow-[2px_2px_0_var(--border)]"
          href={`/${wsId}/courses`}
        >
          {t('featureGrid.primaryAction')}
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {featureCards.map(({ href, icon: Icon, key, surface, value }) => (
          <a
            className="group grid min-h-52 content-between gap-4 border-2 border-border bg-card p-4 shadow-[5px_5px_0_var(--border)] transition duration-200 hover:-translate-y-0.5 hover:border-foreground/70 hover:shadow-[7px_7px_0_var(--foreground)]"
            href={href}
            key={key}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center border-2 border-border shadow-[3px_3px_0_var(--border)]',
                  surface
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="border-2 border-border bg-background px-3 py-1 font-black text-xl tabular-nums shadow-[2px_2px_0_var(--border)]">
                {value}
              </span>
            </div>
            <div>
              <h3 className="font-black text-xl">
                {t(`featureGrid.items.${key}.title`)}
              </h3>
              <p className="mt-2 text-muted-foreground text-sm leading-6">
                {t(`featureGrid.items.${key}.body`)}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
          </a>
        ))}
      </div>
    </section>
  );
}
