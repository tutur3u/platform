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
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
          <span className="flex h-9 w-9 items-center justify-center border border-border bg-dynamic-yellow/15">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="font-semibold text-lg">Learn</p>
            <p className="text-muted-foreground text-xs">{t('byline')}</p>
          </div>
        </div>
        <Link
          className="inline-flex h-10 max-w-[18rem] items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 font-semibold text-sm transition"
          href={dashboardHref}
        >
          <span className="truncate">{navLabel}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </nav>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-16 md:grid-cols-[minmax(0,1fr)_30rem] md:px-8 md:pb-24">
        <div className="rounded-lg border border-border bg-background p-6 md:p-10">
          <div className="mb-6 inline-flex items-center gap-2 border border-border bg-dynamic-yellow/15 px-3 py-1.5 font-semibold text-sm">
            <Sparkles className="h-4 w-4" />
            {t('eyebrow')}
          </div>
          <h1 className="max-w-4xl text-balance font-semibold text-3xl leading-tight tracking-normal md:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-muted-foreground leading-7">
            {t('lead')}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-primary px-5 font-semibold text-primary-foreground transition"
              href={dashboardHref}
            >
              {t('start')}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 font-semibold transition"
              href="#learn-preview"
            >
              {t('preview')}
            </a>
          </div>
        </div>

        <aside
          className="relative min-h-[28rem] overflow-hidden rounded-lg border border-border bg-card"
          id="learn-preview"
        >
          <div
            className="absolute inset-0 bg-center bg-cover grayscale"
            style={{ backgroundImage: `url(${classroomImageUrl})` }}
          />
          <div className="absolute inset-0 bg-background/70" />
          <div className="absolute right-5 bottom-5 left-5 rounded-lg border border-border bg-background p-5">
            <p className="font-semibold text-2xl">{t('panelTitle')}</p>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              {t('panelBody')}
            </p>
          </div>
        </aside>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-20 md:grid-cols-3 md:px-8">
        {landingCards.map(({ icon: Icon, key }) => (
          <article
            className="rounded-lg border border-border bg-card p-5"
            key={key}
          >
            <span className="flex h-12 w-12 items-center justify-center border border-border bg-dynamic-yellow/15">
              <Icon className="h-6 w-6" />
            </span>
            <h2 className="mt-5 font-semibold text-2xl">
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
