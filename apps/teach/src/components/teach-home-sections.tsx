'use client';

import {
  ArrowRight,
  BookOpenCheck,
  ClipboardList,
  ExternalLink,
  GraduationCap,
  PanelsTopLeft,
  RadioTower,
} from '@tuturuuu/icons';
import { TUTURUUU_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LEARN_APP_URL, WEB_APP_URL } from '@/constants/common';
import { Link } from '@/i18n/navigation';
import { TeachThemeControl } from './teach-theme-control';

const heroImageUrl = 'https://picsum.photos/seed/teach-studio-floor/1280/900';
const inlineImageUrl = 'https://picsum.photos/seed/teach-marker-board/420/180';
const classroomImageUrl =
  'https://picsum.photos/seed/teach-classroom-loop/1200/900';
const handoffImageUrl =
  'https://picsum.photos/seed/teach-learner-handoff/1200/900';

const workLoops = [
  { icon: ClipboardList, key: 'plan' },
  { icon: RadioTower, key: 'signal' },
  { icon: BookOpenCheck, key: 'handoff' },
] as const;

export function TeachNav({ dashboardHref }: { dashboardHref: string }) {
  const t = useTranslations('teach');
  return (
    <nav
      className="mx-auto flex max-w-7xl items-center justify-between px-5 pt-5 md:px-8 md:pt-8"
      data-teach-nav
    >
      <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-2">
        <Image
          alt="Tuturuuu"
          className="size-9"
          height={36}
          src={TUTURUUU_LOGO_URL}
          unoptimized
          width={36}
        />
        <span className="flex h-9 w-9 items-center justify-center border border-border bg-dynamic-yellow/15 text-foreground">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <span className="block font-semibold text-lg">Teach</span>
          <span className="text-muted-foreground text-xs">{t('byline')}</span>
        </div>
      </div>
      <div className="hidden items-center gap-3 md:flex">
        <TeachThemeControl compact />
        <InternalHeaderLink href={dashboardHref}>
          {t('dashboard')}
        </InternalHeaderLink>
        <HeaderLink href={WEB_APP_URL}>{t('platform')}</HeaderLink>
        <HeaderLink href={LEARN_APP_URL}>{t('learn')}</HeaderLink>
      </div>
    </nav>
  );
}

export function TeachHero({ dashboardHref }: { dashboardHref: string }) {
  const t = useTranslations('teach');
  return (
    <section className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-7xl items-center gap-12 px-5 py-16 md:grid-cols-[minmax(0,1fr)_30rem] md:px-8">
      <div>
        <h1 className="max-w-6xl text-balance font-semibold text-3xl leading-tight tracking-normal md:text-4xl">
          <span data-teach-word>{t('heroWord1')}</span>{' '}
          <span
            aria-hidden="true"
            className="mx-2 inline-block h-[0.62em] w-[1.34em] translate-y-[0.08em] border border-border bg-center bg-cover align-baseline grayscale"
            style={{ backgroundImage: `url(${inlineImageUrl})` }}
          />{' '}
          <span data-teach-word>{t('heroWord2')}</span>{' '}
          <span data-teach-word>{t('heroWord3')}</span>
        </h1>
        <p className="mt-8 max-w-2xl rounded-lg border border-border bg-card p-5 text-lg text-muted-foreground leading-8">
          {t('heroLead')}
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <HeroLink href={dashboardHref}>{t('openDashboard')}</HeroLink>
          <HeroLink href={LEARN_APP_URL} secondary>
            {t('previewLearn')}
          </HeroLink>
        </div>
      </div>
      <div
        className="group relative min-h-[32rem] overflow-hidden rounded-lg border border-border bg-card"
        data-teach-panel
      >
        <div
          className="absolute inset-0 bg-center bg-cover grayscale transition-transform duration-700 ease-out group-hover:scale-105"
          style={{ backgroundImage: `url(${heroImageUrl})` }}
        />
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/70 to-transparent" />
        <div className="absolute right-5 bottom-5 left-5 rounded-lg border border-border bg-background p-5">
          <p className="font-semibold text-2xl">{t('heroPanelTitle')}</p>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {t('heroPanelBody')}
          </p>
        </div>
      </div>
    </section>
  );
}

export function TeachFeatureGrid() {
  const t = useTranslations('teach');
  return (
    <section className="px-5 py-24 md:px-8 md:py-36">
      <div
        className="mx-auto grid max-w-7xl grid-flow-dense gap-4 md:grid-cols-6"
        data-teach-bento
      >
        <FeatureCard
          className="md:col-span-4"
          imageUrl={classroomImageUrl}
          title={t('studioTitle')}
        >
          {t('studioBody')}
        </FeatureCard>
        <FeatureCard className="md:col-span-2" title={t('syncTitle')}>
          {t('syncBody')}
        </FeatureCard>
        <FeatureCard className="md:col-span-2" title={t('handoffTitle')}>
          {t('handoffBody')}
        </FeatureCard>
        <FeatureCard
          className="md:col-span-4"
          imageUrl={handoffImageUrl}
          title={t('familyTitle')}
        >
          {t('familyBody')}
        </FeatureCard>
      </div>
    </section>
  );
}

export function TeachWorkLoop() {
  const t = useTranslations('teach');
  return (
    <section className="px-5 pb-32 md:px-8" data-teach-loop>
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[24rem_minmax(0,1fr)]">
        <div data-teach-pin>
          <h2 className="font-semibold text-3xl leading-tight md:text-4xl">
            {t('loopTitle')}
          </h2>
        </div>
        <div className="space-y-4">
          {workLoops.map(({ icon: Icon, key }, index) => (
            <article
              className="grid gap-5 rounded-lg border border-border bg-background p-6 md:grid-cols-[4rem_minmax(0,1fr)]"
              key={key}
            >
              <div className="flex h-16 w-16 items-center justify-center border border-border bg-dynamic-yellow/15">
                <Icon className="h-8 w-8" />
              </div>
              <div>
                <p className="mb-2 font-semibold text-muted-foreground text-sm tabular-nums">
                  0{index + 1}
                </p>
                <h3 className="font-semibold text-2xl">{t(`${key}Title`)}</h3>
                <p className="mt-3 text-muted-foreground leading-7">
                  {t(`${key}Body`)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TeachFooter({ dashboardHref }: { dashboardHref: string }) {
  const t = useTranslations('teach');
  return (
    <footer className="border-border border-t bg-background px-5 py-12 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl font-semibold text-2xl">{t('footer')}</p>
        <HeroLink href={dashboardHref}>{t('openDashboard')}</HeroLink>
      </div>
    </footer>
  );
}

function HeaderLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a
      className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 font-semibold text-sm transition"
      href={href}
    >
      {children}
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}

function InternalHeaderLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 font-semibold text-sm transition"
      href={href}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function HeroLink({
  children,
  href,
  secondary = false,
}: {
  children: ReactNode;
  href: string;
  secondary?: boolean;
}) {
  const className = `inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border px-6 font-semibold  transition    ${secondary ? 'bg-background text-foreground' : 'bg-primary text-primary-foreground'}`;

  if (href.startsWith('/')) {
    return (
      <Link className={className} href={href}>
        {children}
        <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <a className={className} href={href}>
      {children}
      <ArrowRight className="h-4 w-4" />
    </a>
  );
}

function FeatureCard({
  children,
  className,
  imageUrl,
  title,
}: {
  children: ReactNode;
  className: string;
  imageUrl?: string;
  title: string;
}) {
  return (
    <article
      className={`group min-h-72 overflow-hidden rounded-lg border border-border bg-card ${className}`}
      data-teach-card
    >
      {imageUrl ? (
        <div className="h-48 overflow-hidden border-border border-b">
          <div
            className="h-full bg-center bg-cover grayscale transition-transform duration-700 ease-out group-hover:scale-105"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        </div>
      ) : null}
      <div className="p-6">
        <PanelsTopLeft className="h-8 w-8" />
        <h2 className="mt-5 font-semibold text-3xl leading-tight">{title}</h2>
        <p className="mt-4 text-muted-foreground leading-7">{children}</p>
      </div>
    </article>
  );
}
