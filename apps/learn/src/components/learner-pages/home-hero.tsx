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
      className="relative grid overflow-hidden border-2 border-foreground bg-background shadow-[10px_10px_0_var(--foreground)] lg:grid-cols-[minmax(0,1fr)_24rem]"
      data-learn-reveal
    >
      <div className="p-5 md:p-8">
        <div className="mb-7 inline-flex items-center gap-2 border-2 border-foreground bg-dynamic-yellow px-4 py-2 font-black text-sm shadow-[4px_4px_0_var(--foreground)]">
          <Sparkles className="h-4 w-4" />
          {t('home.dailyGoal')}
        </div>
        <h1 className="max-w-5xl text-balance font-black text-[clamp(2.8rem,6vw,6rem)] leading-[0.9] tracking-normal">
          {t('home.heroTitle', { name: studentName })}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-8">
          {lead}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex h-12 items-center justify-center gap-2 border-2 border-foreground bg-dynamic-yellow px-6 font-black shadow-[5px_5px_0_var(--foreground)] transition active:translate-x-1 active:translate-y-1 active:shadow-none"
            href={practiceHref}
          >
            <Zap className="h-4 w-4" />
            {t('home.startPractice')}
          </Link>
          <Link
            className="inline-flex h-12 items-center justify-center gap-2 border-2 border-foreground bg-background px-6 font-black shadow-[5px_5px_0_var(--foreground)] transition active:translate-x-1 active:translate-y-1 active:shadow-none"
            href={coursesHref}
          >
            <BookOpen className="h-4 w-4" />
            {t('home.openMap')}
          </Link>
        </div>
      </div>
      <aside className="grid gap-3 border-foreground border-t-2 bg-dynamic-yellow/15 p-5 lg:border-t-0 lg:border-l-2">
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
