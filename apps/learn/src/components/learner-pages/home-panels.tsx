'use client';

import { ArrowRight, CheckCircle2, Target } from '@tuturuuu/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { IconComponent } from './shared';

export function StatBubble({
  accent = 'green',
  icon: Icon,
  label,
  value,
}: {
  accent?: 'blue' | 'green' | 'orange';
  icon: IconComponent;
  label: string;
  value: number | string;
}) {
  const styles = {
    blue: 'border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue',
    green: 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green',
    orange: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
  };

  return (
    <div
      className={cn(
        'min-w-0 rounded-[1.5rem] border p-4 text-center shadow-sm',
        styles[accent]
      )}
      data-float-loop={accent === 'orange' ? '' : undefined}
    >
      <Icon className="mx-auto mb-2 h-5 w-5" />
      <p className="truncate font-bold text-2xl text-foreground">{value}</p>
      <p className="truncate text-xs">{label}</p>
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
    <article className="relative overflow-hidden rounded-[2rem] border border-dynamic-green/25 bg-dynamic-green/10 p-6 md:col-span-3 md:row-span-2">
      <div className="flex h-full min-h-64 flex-col justify-between gap-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-background text-dynamic-green shadow-sm">
            <Icon className="h-7 w-7" />
          </div>
          <p className="rounded-full bg-background px-4 py-2 font-bold text-dynamic-green text-xl">
            {stat}
          </p>
        </div>
        <div>
          <h3 className="font-bold text-3xl tracking-normal">{title}</h3>
          <p className="mt-3 line-clamp-3 text-muted-foreground leading-7">
            {description}
          </p>
          <Link
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-dynamic-green px-5 font-semibold text-primary-foreground transition hover:bg-dynamic-green/90 active:translate-y-px"
            href={actionHref}
          >
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
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
    <article className="rounded-[2rem] border border-dynamic-orange/25 bg-background p-6 md:col-span-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-2xl tracking-normal">
            {t('home.questBoard')}
          </h3>
          <p className="mt-2 text-muted-foreground text-sm">
            {t('home.questBoardDescription', { count: dueAssignments })}
          </p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-dynamic-orange/10 text-dynamic-orange">
          <Target className="h-7 w-7" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className="flex justify-between font-semibold text-sm">
          <span>{t('common.completed')}</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} />
      </div>
    </article>
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
    <article
      className={cn(
        'rounded-[2rem] border border-border bg-card p-6',
        span === 'wide' ? 'md:col-span-2' : 'md:col-span-1'
      )}
    >
      <Icon className="mb-5 h-7 w-7 text-dynamic-blue" />
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-2 line-clamp-2 font-bold text-2xl tracking-normal">
        {value}
      </p>
    </article>
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
      className="group flex items-center gap-3 rounded-[1.5rem] border border-border bg-card p-4 transition duration-200 hover:-translate-y-0.5 hover:border-dynamic-green/30 hover:bg-dynamic-green/10"
      href={quest.href}
    >
      <div
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
          quest.complete
            ? 'bg-dynamic-green text-primary-foreground'
            : 'bg-muted text-muted-foreground'
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
      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-dynamic-green" />
    </Link>
  );
}
