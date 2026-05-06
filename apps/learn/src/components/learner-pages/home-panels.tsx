'use client';

import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Target,
} from '@tuturuuu/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BrutalCard, BrutalIcon, type IconComponent } from './shared';

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
    <div
      className="min-w-0 border-2 border-foreground/70 bg-background p-4 text-center shadow-[5px_5px_0_var(--foreground)]"
      data-ink-float
    >
      <Icon className="mx-auto mb-2 h-5 w-5" />
      <p className="truncate font-black text-2xl tabular-nums">{value}</p>
      <p className="truncate text-muted-foreground text-xs">{label}</p>
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
    <BrutalCard className="bg-muted/60 p-6 md:col-span-3 md:row-span-2">
      <div className="flex h-full min-h-72 flex-col justify-between gap-8">
        <div className="flex items-start justify-between gap-4">
          <BrutalIcon icon={Icon} />
          <p className="border-2 border-border bg-background px-4 py-2 font-black text-xl tabular-nums shadow-[4px_4px_0_var(--border)]">
            {stat}
          </p>
        </div>
        <div>
          <h3 className="text-balance font-black text-3xl tracking-normal">
            {title}
          </h3>
          <p className="mt-3 line-clamp-3 text-muted-foreground leading-7">
            {description}
          </p>
          <Link
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 border-2 border-border bg-primary px-5 font-black text-primary-foreground shadow-[4px_4px_0_var(--border)] transition active:translate-x-1 active:translate-y-1 active:shadow-none"
            href={actionHref}
          >
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </BrutalCard>
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
    <BrutalCard className="bg-background p-6 md:col-span-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-black text-2xl tracking-normal">
            {t('home.questBoard')}
          </h3>
          <p className="mt-2 text-muted-foreground text-sm">
            {t('home.questBoardDescription', { count: dueAssignments })}
          </p>
        </div>
        <BrutalIcon icon={Target} />
      </div>
      <div className="mt-5 space-y-2">
        <div className="flex justify-between font-black text-sm">
          <span>{t('common.completed')}</span>
          <span className="tabular-nums">{progress}%</span>
        </div>
        <Progress value={progress} />
      </div>
    </BrutalCard>
  );
}

export function MiniPanel({
  icon: Icon,
  label,
  span,
  value,
}: {
  icon: IconComponent;
  label: string;
  span: 'compact' | 'wide';
  value: string;
}) {
  return (
    <BrutalCard
      className={cn(
        'bg-card p-6',
        span === 'wide' ? 'md:col-span-2' : 'md:col-span-1'
      )}
    >
      <BrutalIcon className="mb-5 h-10 w-10" icon={Icon} />
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-2 line-clamp-2 font-black text-2xl tracking-normal">
        {value}
      </p>
    </BrutalCard>
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
      text: t('home.planPracticeBody'),
      title: t('home.planPractice'),
    },
    {
      href: assignmentsHref,
      icon: ClipboardCheck,
      meta: t('home.questAssignmentsCount', { count: dueAssignments }),
      text: t('home.planAssignmentsBody'),
      title: t('home.planAssignments'),
    },
    {
      href: coursesHref,
      icon: BookOpen,
      meta: t('home.questProgressDescription', { progress }),
      text: nextCourse,
      title: t('home.planCourse'),
    },
  ] as const;

  return (
    <section
      className="border-2 border-foreground/70 bg-background p-5 shadow-[8px_8px_0_var(--foreground)] md:p-6"
      data-learn-reveal
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-black text-3xl tracking-normal">
            {t('home.todayPlan')}
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground leading-7">
            {t('home.todayPlanDescription')}
          </p>
        </div>
        <div className="border-2 border-border bg-dynamic-yellow/15 px-4 py-2 font-black text-sm shadow-[3px_3px_0_var(--border)]">
          {t('home.dailyGoal')}
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {planItems.map(({ href, icon: Icon, meta, text, title }) => (
          <Link
            className="group grid min-h-44 gap-4 border-2 border-border bg-card p-4 shadow-[5px_5px_0_var(--border)] transition duration-200 hover:-translate-y-0.5 hover:border-foreground/70 hover:shadow-[7px_7px_0_var(--foreground)]"
            href={href}
            key={title}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center border-2 border-border bg-dynamic-yellow/15 shadow-[3px_3px_0_var(--border)]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="max-w-[11rem] text-right text-muted-foreground text-xs leading-5">
                {meta}
              </span>
            </div>
            <div>
              <h3 className="font-black text-xl">{title}</h3>
              <p className="mt-2 line-clamp-2 text-muted-foreground text-sm leading-6">
                {text}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
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
    title: string;
  };
}) {
  const Icon = quest.icon;
  return (
    <Link
      className="group flex items-center gap-3 border-2 border-border bg-card p-4 shadow-[5px_5px_0_var(--border)] transition duration-200 hover:-translate-y-0.5 hover:bg-muted"
      href={quest.href}
    >
      <div
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center border-2 border-border',
          quest.complete
            ? 'bg-primary text-primary-foreground'
            : 'bg-background'
        )}
      >
        {quest.complete ? (
          <CheckCircle2 className="h-6 w-6" />
        ) : (
          <Icon className="h-6 w-6" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-black">{quest.title}</p>
        <p className="line-clamp-2 text-muted-foreground text-sm">
          {quest.description}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
    </Link>
  );
}
