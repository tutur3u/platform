'use client';

import { useGSAP } from '@gsap/react';
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
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef } from 'react';
import { LEARN_APP_URL, WEB_APP_URL } from '@/constants/common';

gsap.registerPlugin(useGSAP, ScrollTrigger);

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

export function TeachHome() {
  const t = useTranslations('teach');
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      gsap.from('[data-teach-nav], [data-teach-word], [data-teach-panel]', {
        autoAlpha: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.05,
        y: 30,
      });
      gsap.from('[data-teach-card]', {
        autoAlpha: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: {
          end: 'bottom 30%',
          scrub: 0.7,
          start: 'top 82%',
          trigger: '[data-teach-bento]',
        },
        y: 42,
      });
      ScrollTrigger.create({
        end: 'bottom 70%',
        pin: '[data-teach-pin]',
        pinSpacing: false,
        start: 'top 18%',
        trigger: '[data-teach-loop]',
      });
    },
    { scope: rootRef }
  );

  return (
    <main
      ref={rootRef}
      className="min-h-screen w-full max-w-full overflow-x-hidden bg-dynamic-yellow/10 text-foreground"
    >
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between px-5 pt-5 md:px-8 md:pt-8"
        data-teach-nav
      >
        <div className="flex items-center gap-3 border-2 border-foreground bg-background px-4 py-2 shadow-[6px_6px_0_var(--foreground)]">
          <Image
            alt="Tuturuuu"
            className="size-9"
            height={36}
            src={TUTURUUU_LOGO_URL}
            unoptimized
            width={36}
          />
          <span className="flex h-9 w-9 items-center justify-center border-2 border-foreground bg-dynamic-green text-foreground">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="leading-none">
            <span className="block font-black text-lg">Teach</span>
            <span className="text-muted-foreground text-xs">{t('byline')}</span>
          </div>
        </div>
        <div className="hidden gap-3 md:flex">
          <HeaderLink href={WEB_APP_URL}>{t('platform')}</HeaderLink>
          <HeaderLink href={LEARN_APP_URL}>{t('learn')}</HeaderLink>
        </div>
      </nav>

      <section className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-7xl items-center gap-12 px-5 py-20 md:grid-cols-[minmax(0,1fr)_28rem] md:px-8">
        <div>
          <h1 className="max-w-6xl text-balance font-black text-[clamp(3rem,6vw,6.5rem)] leading-[0.9] tracking-normal">
            <span data-teach-word>{t('heroWord1')}</span>{' '}
            <span
              aria-hidden="true"
              className="mx-2 inline-block h-[0.62em] w-[1.34em] translate-y-[0.08em] border-2 border-foreground bg-center bg-cover align-baseline shadow-[5px_5px_0_var(--foreground)] grayscale"
              style={{ backgroundImage: `url(${inlineImageUrl})` }}
            />{' '}
            <span data-teach-word>{t('heroWord2')}</span>{' '}
            <span data-teach-word>{t('heroWord3')}</span>
          </h1>
          <p className="mt-8 max-w-2xl border-2 border-foreground bg-card p-5 text-lg text-muted-foreground leading-8 shadow-[7px_7px_0_var(--foreground)]">
            {t('heroLead')}
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <HeroLink href={WEB_APP_URL}>{t('openPlatform')}</HeroLink>
            <HeroLink href={LEARN_APP_URL} secondary>
              {t('previewLearn')}
            </HeroLink>
          </div>
        </div>
        <div
          className="group relative min-h-[30rem] overflow-hidden border-2 border-foreground bg-card shadow-[10px_10px_0_var(--foreground)]"
          data-teach-panel
        >
          <div
            className="absolute inset-0 bg-center bg-cover grayscale transition-transform duration-700 ease-out group-hover:scale-105"
            style={{ backgroundImage: `url(${heroImageUrl})` }}
          />
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/55 to-transparent" />
          <div className="absolute right-5 bottom-5 left-5 border-2 border-foreground bg-background p-5 shadow-[6px_6px_0_var(--foreground)]">
            <p className="font-black text-2xl">{t('heroPanelTitle')}</p>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              {t('heroPanelBody')}
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 py-28 md:px-8 md:py-40">
        <div
          className="mx-auto grid max-w-7xl grid-flow-dense gap-3 md:grid-cols-6"
          data-teach-bento
        >
          <FeatureCard
            className="md:col-span-4"
            imageUrl={classroomImageUrl}
            tone="yellow"
            title={t('studioTitle')}
          >
            {t('studioBody')}
          </FeatureCard>
          <FeatureCard
            className="md:col-span-2"
            tone="green"
            title={t('syncTitle')}
          >
            {t('syncBody')}
          </FeatureCard>
          <FeatureCard
            className="md:col-span-2"
            tone="blue"
            title={t('handoffTitle')}
          >
            {t('handoffBody')}
          </FeatureCard>
          <FeatureCard
            className="md:col-span-4"
            imageUrl={handoffImageUrl}
            tone="orange"
            title={t('familyTitle')}
          >
            {t('familyBody')}
          </FeatureCard>
        </div>
      </section>

      <section className="px-5 pb-32 md:px-8" data-teach-loop>
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[24rem_minmax(0,1fr)]">
          <div data-teach-pin>
            <h2 className="font-black text-[clamp(2.5rem,5vw,5rem)] leading-none">
              {t('loopTitle')}
            </h2>
          </div>
          <div className="space-y-4">
            {workLoops.map(({ icon: Icon, key }) => (
              <article
                className="border-2 border-foreground bg-background p-6 shadow-[7px_7px_0_var(--foreground)]"
                key={key}
              >
                <Icon className="h-8 w-8 text-dynamic-green" />
                <h3 className="mt-5 font-black text-2xl">{t(`${key}Title`)}</h3>
                <p className="mt-3 text-muted-foreground leading-7">
                  {t(`${key}Body`)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-foreground border-t-2 bg-background px-5 py-12 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl font-black text-2xl">{t('footer')}</p>
          <HeroLink href={WEB_APP_URL}>{t('openPlatform')}</HeroLink>
        </div>
      </footer>
    </main>
  );
}

function HeaderLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a
      className="inline-flex h-11 items-center gap-2 border-2 border-foreground bg-background px-4 font-black text-sm shadow-[4px_4px_0_var(--foreground)] transition active:translate-x-1 active:translate-y-1 active:shadow-none"
      href={href}
    >
      {children}
      <ExternalLink className="h-4 w-4" />
    </a>
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
  return (
    <a
      className={`inline-flex h-12 items-center justify-center gap-2 border-2 border-foreground px-6 font-black shadow-[5px_5px_0_var(--foreground)] transition active:translate-x-1 active:translate-y-1 active:shadow-none ${secondary ? 'bg-background text-foreground' : 'bg-dynamic-yellow text-foreground'}`}
      href={href}
    >
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
  tone,
}: {
  children: ReactNode;
  className: string;
  imageUrl?: string;
  title: string;
  tone: 'blue' | 'green' | 'orange' | 'yellow';
}) {
  const toneClass = {
    blue: 'bg-dynamic-blue/10',
    green: 'bg-dynamic-green/10',
    orange: 'bg-dynamic-orange/10',
    yellow: 'bg-dynamic-yellow/15',
  }[tone];

  return (
    <article
      className={`group min-h-72 overflow-hidden border-2 border-foreground shadow-[7px_7px_0_var(--foreground)] ${toneClass} ${className}`}
      data-teach-card
    >
      {imageUrl ? (
        <div className="h-48 overflow-hidden border-foreground border-b-2">
          <div
            className="h-full bg-center bg-cover grayscale transition-transform duration-700 ease-out group-hover:scale-105"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        </div>
      ) : null}
      <div className="p-6">
        <PanelsTopLeft className="h-8 w-8 text-dynamic-green" />
        <h2 className="mt-5 font-black text-3xl leading-tight">{title}</h2>
        <p className="mt-4 text-muted-foreground leading-7">{children}</p>
      </div>
    </article>
  );
}
