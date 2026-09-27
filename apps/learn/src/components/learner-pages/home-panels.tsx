'use client';

import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  LineChart,
  Sparkles,
  Target,
} from '@tuturuuu/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { type IconComponent, SurfaceCard, SurfaceIcon } from './shared';

export function StatBubble({
  icon: Icon,
  label,
  value,
}: {
  icon: IconComponent;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
        {label}
      </p>
      <p className="shrink-0 font-semibold text-lg tabular-nums">{value}</p>
    </div>
  );
}

export function MissionPanel({
  actionHref,
  actionLabel,
  description,
  icon: Icon,
  stat,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  description: string | null;
  icon: IconComponent;
  stat: string;
  title: string;
}) {
  return (
    <SurfaceCard className="bg-dynamic-cyan/10 p-5 sm:p-6 md:col-span-3 md:row-span-2">
      <div className="flex h-full min-h-72 flex-col justify-between gap-8">
        <div className="flex items-start justify-between gap-4">
          <SurfaceIcon className="bg-dynamic-green/15" icon={Icon} />
          <p className="rounded-lg border border-border bg-background px-4 py-2 font-semibold text-xl tabular-nums">
            {stat}
          </p>
        </div>
        <div>
          <h3 className="text-balance font-semibold text-3xl tracking-normal">
            {title}
          </h3>
          <p className="mt-3 line-clamp-3 text-muted-foreground leading-7">
            {description}
          </p>
          <Link
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-primary px-5 font-semibold text-primary-foreground transition"
            href={actionHref}
          >
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </SurfaceCard>
  );
}

export function QuestPanel({
  completedAssignments,
  dueAssignments,
  totalAssignments,
}: {
  completedAssignments: number;
  dueAssignments: number;
  totalAssignments: number;
}) {
  const t = useTranslations();
  const progress = totalAssignments
    ? Math.round((completedAssignments / totalAssignments) * 100)
    : 0;

  return (
    <SurfaceCard className="bg-dynamic-yellow/10 p-5 sm:p-6 md:col-span-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-2xl tracking-normal">
            {t('home.questBoard')}
          </h3>
          <p className="mt-2 text-muted-foreground text-sm">
            {t('home.questBoardDescription', { count: dueAssignments })}
          </p>
        </div>
        <SurfaceIcon className="bg-dynamic-pink/15" icon={Target} />
      </div>
      <div className="mt-5 space-y-2">
        <div className="flex justify-between font-semibold text-sm">
          <span>{t('common.completed')}</span>
          <span className="tabular-nums">{progress}%</span>
        </div>
        <Progress value={progress} />
      </div>
    </SurfaceCard>
  );
}

export function MiniPanel({
  icon: Icon,
  label,
  span,
  tone = 'yellow',
  value,
}: {
  icon: IconComponent;
  label: string;
  span: 'compact' | 'wide';
  tone?: 'cyan' | 'green' | 'pink' | 'yellow';
  value: string;
}) {
  const toneClass = {
    cyan: 'bg-dynamic-cyan/15',
    green: 'bg-dynamic-green/15',
    pink: 'bg-dynamic-pink/15',
    yellow: 'bg-dynamic-yellow/15',
  }[tone];

  return (
    <SurfaceCard
      className={cn(
        'min-h-48 overflow-hidden bg-card p-5 sm:p-6',
        span === 'wide' ? 'md:col-span-4' : 'md:col-span-2'
      )}
    >
      <SurfaceIcon className={cn('mb-5 h-10 w-10', toneClass)} icon={Icon} />
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-2 break-words font-semibold text-3xl leading-[1.05] tracking-normal md:text-4xl">
        {value}
      </p>
    </SurfaceCard>
  );
}

export function LearningPlanStrip({
  assignmentsHref,
  coursesHref,
  dueAssignments,
  nextCourse,
  practiceHref,
  progress,
}: {
  assignmentsHref: string;
  coursesHref: string;
  dueAssignments: number;
  nextCourse: string;
  practiceHref: string;
  progress: number;
}) {
  const t = useTranslations();
  const planItems = [
    {
      href: practiceHref,
      icon: Target,
      meta: t('practice.xpHint'),
      surface: 'bg-dynamic-green/15',
      text: t('home.planPracticeBody'),
      title: t('home.planPractice'),
    },
    {
      href: assignmentsHref,
      icon: ClipboardCheck,
      meta: t('home.questAssignmentsCount', { count: dueAssignments }),
      surface: 'bg-dynamic-pink/15',
      text: t('home.planAssignmentsBody'),
      title: t('home.planAssignments'),
    },
    {
      href: coursesHref,
      icon: BookOpen,
      meta: t('home.questProgressDescription', { progress }),
      surface: 'bg-dynamic-cyan/15',
      text: nextCourse,
      title: t('home.planCourse'),
    },
  ] as const;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-6"
      data-learn-reveal
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">
            {t('home.todayPlan')}
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground leading-7">
            {t('home.todayPlanDescription')}
          </p>
        </div>
        <div className="rounded-lg bg-muted px-3 py-1.5 font-medium text-muted-foreground text-sm">
          {t('home.dailyGoal')}
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {planItems.map(({ href, icon: Icon, meta, surface, text, title }) => (
          <Link
            className="group grid min-h-40 gap-4 rounded-xl border border-border bg-background p-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={href}
            key={title}
          >
            <div className="flex items-start justify-between gap-4">
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center border border-border',
                  surface
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="max-w-[11rem] text-right text-muted-foreground text-xs leading-5">
                {meta}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-xl">{title}</h3>
              <p className="mt-2 line-clamp-2 text-muted-foreground text-sm leading-6">
                {text}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function LearningToolkitPanel({
  aiHref,
  assignmentsHref,
  coursesHref,
  practiceHref,
  reportsHref,
}: {
  aiHref: string;
  assignmentsHref: string;
  coursesHref: string;
  practiceHref: string;
  reportsHref: string;
}) {
  const t = useTranslations();
  const tools = [
    {
      body: t('home.toolkitPracticeBody'),
      href: practiceHref,
      icon: Target,
      surface: 'bg-dynamic-green/15',
      title: t('home.toolkitPractice'),
    },
    {
      body: t('home.toolkitAiBody'),
      href: aiHref,
      icon: Sparkles,
      surface: 'bg-dynamic-purple/15',
      title: t('home.toolkitAi'),
    },
    {
      body: t('home.toolkitCoursesBody'),
      href: coursesHref,
      icon: BookOpen,
      surface: 'bg-dynamic-cyan/15',
      title: t('home.toolkitCourses'),
    },
    {
      body: t('home.toolkitReportsBody'),
      href: reportsHref,
      icon: LineChart,
      surface: 'bg-dynamic-orange/15',
      title: t('home.toolkitReports'),
    },
    {
      body: t('home.toolkitAssignmentsBody'),
      href: assignmentsHref,
      icon: ClipboardCheck,
      surface: 'bg-dynamic-pink/15',
      title: t('home.toolkitAssignments'),
    },
  ] as const;

  return (
    <section
      className="rounded-lg border border-border bg-background p-5 md:p-6"
      data-learn-reveal
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-semibold text-3xl tracking-normal">
            {t('home.toolkitTitle')}
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground leading-7">
            {t('home.toolkitDescription')}
          </p>
        </div>
        <span className="w-fit border border-border bg-dynamic-purple/15 px-4 py-2 font-semibold text-sm">
          {t('home.toolkitBadge')}
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {tools.map(({ body, href, icon: Icon, surface, title }) => (
          <Link
            className="group grid min-h-44 content-between gap-4 rounded-lg border border-border bg-card p-4 transition duration-200 hover:bg-muted/30"
            href={href}
            key={title}
          >
            <span
              className={cn(
                'flex h-11 w-11 items-center justify-center border border-border',
                surface
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-lg leading-tight">{title}</h3>
              <p className="mt-2 line-clamp-3 text-muted-foreground text-sm leading-6">
                {body}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function QuestCard({
  quest,
}: {
  quest: {
    complete: boolean;
    description: string;
    href: string;
    icon: IconComponent;
    surface: string;
    title: string;
  };
}) {
  const Icon = quest.icon;
  return (
    <Link
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-border p-4 transition duration-200 hover:bg-muted/30',
        quest.complete ? 'bg-dynamic-green/10' : 'bg-card'
      )}
      href={quest.href}
    >
      <div
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center border border-border',
          quest.complete ? 'bg-primary text-primary-foreground' : quest.surface
        )}
      >
        {quest.complete ? (
          <CheckCircle2 className="h-6 w-6" />
        ) : (
          <Icon className="h-6 w-6" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{quest.title}</p>
        <p className="line-clamp-2 text-muted-foreground text-sm">
          {quest.description}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
    </Link>
  );
}
