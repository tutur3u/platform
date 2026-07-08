'use client';

import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  LineChart,
  Sparkles,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const classroomImageUrl =
  'https://picsum.photos/seed/learn-focused-study-room/1200/900';

const landingCards = [
  { icon: BookOpen, key: 'courses' },
  { icon: ClipboardCheck, key: 'assignments' },
  { icon: LineChart, key: 'progress' },
] as const;

export function LearnLanding({
  dashboardHref,
  isAuthenticated = false,
  userName,
}: {
  dashboardHref: string;
  isAuthenticated?: boolean;
  userName?: string | null;
}) {
  const t = useTranslations('landing');
  const commonT = useTranslations('common');
  const navLabel = isAuthenticated
    ? t('greeting', { user: userName ?? commonT('learner') })
    : t('signIn');

  return (
    <main className="min-h-screen overflow-hidden bg-root-background text-foreground">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
        <div className="flex items-center gap-3 border-2 border-border bg-background px-3 py-2 shadow-[4px_4px_0_var(--border)]">
          <span className="flex h-9 w-9 items-center justify-center border-2 border-border bg-dynamic-yellow/15">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="font-black text-lg">Learn</p>
            <p className="text-muted-foreground text-xs">{t('byline')}</p>
          </div>
        </div>
        <Link
          className="inline-flex h-10 max-w-[18rem] items-center justify-center gap-2 border-2 border-border bg-background px-4 font-black text-sm shadow-[3px_3px_0_var(--border)] transition active:translate-x-1 active:translate-y-1 active:shadow-none"
          href={dashboardHref}
        >
          <span className="truncate">{navLabel}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </nav>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-16 md:grid-cols-[minmax(0,1fr)_30rem] md:px-8 md:pb-24">
        <div className="border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)] md:p-10">
          <div className="mb-6 inline-flex items-center gap-2 border-2 border-border bg-dynamic-yellow/15 px-3 py-1.5 font-black text-sm shadow-[3px_3px_0_var(--border)]">
            <Sparkles className="h-4 w-4" />
            {t('eyebrow')}
          </div>
          <h1 className="max-w-4xl text-balance font-black text-[clamp(2.7rem,6vw,5.75rem)] leading-[0.9] tracking-normal">
            {t('title')}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-muted-foreground leading-7">
            {t('lead')}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex h-12 items-center justify-center gap-2 border-2 border-border bg-primary px-5 font-black text-primary-foreground shadow-[4px_4px_0_var(--border)] transition active:translate-x-1 active:translate-y-1 active:shadow-none"
              href={dashboardHref}
            >
              {t('start')}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              className="inline-flex h-12 items-center justify-center gap-2 border-2 border-border bg-background px-5 font-black shadow-[4px_4px_0_var(--border)] transition active:translate-x-1 active:translate-y-1 active:shadow-none"
              href="#learn-preview"
            >
              {t('preview')}
            </a>
          </div>
        </div>

        <aside
          className="relative min-h-[28rem] overflow-hidden border-2 border-border bg-card shadow-[8px_8px_0_var(--border)]"
          id="learn-preview"
        >
          <div
            className="absolute inset-0 bg-center bg-cover grayscale"
            style={{ backgroundImage: `url(${classroomImageUrl})` }}
          />
          <div className="absolute inset-0 bg-background/70" />
          <div className="absolute right-5 bottom-5 left-5 border-2 border-border bg-background p-5 shadow-[4px_4px_0_var(--border)]">
            <p className="font-black text-2xl">{t('panelTitle')}</p>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              {t('panelBody')}
            </p>
          </div>
        </aside>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-20 md:grid-cols-3 md:px-8">
        {landingCards.map(({ icon: Icon, key }) => (
          <article
            className="border-2 border-border bg-card p-5 shadow-[5px_5px_0_var(--border)]"
            key={key}
          >
            <span className="flex h-12 w-12 items-center justify-center border-2 border-border bg-dynamic-yellow/15 shadow-[3px_3px_0_var(--border)]">
              <Icon className="h-6 w-6" />
            </span>
            <h2 className="mt-5 font-black text-2xl">
              {t(`cards.${key}.title`)}
            </h2>
            <p className="mt-3 text-muted-foreground leading-7">
              {t(`cards.${key}.body`)}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
