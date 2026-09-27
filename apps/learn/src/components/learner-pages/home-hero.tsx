'use client';

import { BookOpen, Flame, Heart, Sparkles, Zap } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { StatBubble } from './home-panels';

export function HomeHero({
  coursesHref,
  hearts,
  lead,
  maxHearts,
  practiceHref,
  streak,
  studentName,
  xp,
}: {
  coursesHref: string;
  hearts: number;
  lead: string;
  maxHearts: number;
  practiceHref: string;
  streak: number;
  studentName: string;
  xp: number;
}) {
  const t = useTranslations();

  return (
    <section
      className="grid overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[minmax(0,1fr)_18rem]"
      data-learn-reveal
    >
      <div className="p-6 md:p-8">
        <div className="mb-5 inline-flex items-center gap-2 font-medium text-muted-foreground text-sm">
          <Sparkles className="h-4 w-4" />
          {t('home.dailyGoal')}
        </div>
        <h1 className="max-w-4xl text-balance font-semibold text-3xl leading-tight tracking-tight md:text-4xl">
          {t('home.heroTitle', { name: studentName })}
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground leading-7">
          {lead}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={practiceHref}
          >
            <Zap className="h-4 w-4" />
            {t('home.startPractice')}
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 font-medium text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={coursesHref}
          >
            <BookOpen className="h-4 w-4" />
            {t('home.openMap')}
          </Link>
        </div>
      </div>
      <aside className="grid gap-2 border-border border-t bg-muted/20 p-4 lg:border-t-0 lg:border-l">
        <StatBubble icon={Sparkles} label={t('home.xp')} value={xp} />
        <StatBubble icon={Flame} label={t('home.streak')} value={streak} />
        <StatBubble
          icon={Heart}
          label={t('home.hearts')}
          value={`${hearts}/${maxHearts}`}
        />
      </aside>
    </section>
  );
}
