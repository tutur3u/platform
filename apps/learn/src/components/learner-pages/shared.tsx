'use client';

import { useGSAP } from '@gsap/react';
import {
  BookOpen,
  Flame,
  LineChart,
  type LucideIcon,
  Sparkles,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, type RefObject, useRef } from 'react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export type IconComponent = LucideIcon;

export const courseThemes = [
  {
    icon: BookOpen,
    surface: 'bg-dynamic-yellow',
    text: 'text-foreground',
  },
  {
    icon: Flame,
    surface: 'bg-background',
    text: 'text-foreground',
  },
  {
    icon: LineChart,
    surface: 'bg-dynamic-yellow/20',
    text: 'text-foreground',
  },
] as const;

export function useStudentId() {
  return useSearchParams().get('studentId');
}

export function useStudentHref(path: string) {
  const studentId = useStudentId();
  return studentId ? `${path}?studentId=${studentId}` : path;
}

export function usePageMotion() {
  const scopeRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      if (reduceMotion) return;

      gsap.from('[data-learn-reveal]', {
        autoAlpha: 0,
        duration: 0.55,
        ease: 'power3.out',
        stagger: 0.055,
        y: 22,
      });

      gsap.to('[data-ink-float]', {
        duration: 2.6,
        ease: 'sine.inOut',
        repeat: -1,
        y: -7,
        yoyo: true,
      });

      const journey = scopeRef.current?.querySelector('[data-journey]');
      const pinTitle = scopeRef.current?.querySelector('[data-pin-title]');

      if (journey && pinTitle) {
        ScrollTrigger.create({
          end: 'bottom 70%',
          pin: pinTitle,
          pinSpacing: false,
          start: 'top 18%',
          trigger: journey,
        });
      }

      gsap.utils
        .toArray<HTMLElement>('[data-stack-card]')
        .forEach((card, index) => {
          gsap.to(card, {
            ease: 'none',
            scale: 1 - index * 0.012,
            scrollTrigger: {
              end: 'bottom 35%',
              scrub: true,
              start: 'top 75%',
              trigger: card,
            },
            y: -index * 10,
          });
        });
    },
    { scope: scopeRef }
  );

  return scopeRef;
}

export function LoadingState() {
  const t = useTranslations();
  return (
    <div className="grid grid-flow-dense gap-4 md:grid-cols-6">
      <SkeletonBlock className="h-72 md:col-span-4 md:row-span-2" />
      <SkeletonBlock className="h-32 md:col-span-2" />
      <SkeletonBlock className="h-32 md:col-span-2" />
      <SkeletonBlock className="h-36 md:col-span-3" />
      <SkeletonBlock className="h-36 md:col-span-3" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse border-2 border-foreground bg-card shadow-[7px_7px_0_var(--foreground)]',
        className
      )}
    />
  );
}

export function EmptyState({
  action,
  label,
}: {
  action?: ReactNode;
  label: string;
}) {
  return (
    <div
      className="border-2 border-foreground border-dashed bg-dynamic-yellow/15 p-8 text-center shadow-[8px_8px_0_var(--foreground)]"
      data-learn-reveal
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border-2 border-foreground bg-background shadow-[4px_4px_0_var(--foreground)]">
        <Sparkles className="h-7 w-7" />
      </div>
      <p className="mx-auto max-w-md text-muted-foreground leading-7">
        {label}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Section({
  children,
  description,
  eyebrow,
  refValue,
  title,
}: {
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  refValue?: RefObject<HTMLDivElement | null>;
  title: string;
}) {
  return (
    <div className="space-y-8" ref={refValue}>
      <section
        className="grid gap-6 border-2 border-foreground bg-background p-5 shadow-[9px_9px_0_var(--foreground)] md:grid-cols-[minmax(0,1fr)_16rem] md:p-8"
        data-learn-reveal
      >
        <div>
          {eyebrow ? (
            <p className="mb-4 inline-flex border-2 border-foreground bg-dynamic-yellow px-3 py-1 font-black text-xs shadow-[3px_3px_0_var(--foreground)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="max-w-5xl text-balance font-black text-[clamp(2.4rem,5vw,5.25rem)] leading-none tracking-normal">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 max-w-2xl text-muted-foreground leading-7">
              {description}
            </p>
          ) : null}
        </div>
        <div className="hidden border-2 border-foreground bg-dynamic-yellow/20 p-4 shadow-[5px_5px_0_var(--foreground)] md:block">
          <div className="h-full border-2 border-foreground border-dashed bg-background/80" />
        </div>
      </section>
      {children}
    </div>
  );
}

export function BrutalCard({
  children,
  className,
  reveal = true,
  stacked = false,
}: {
  children: ReactNode;
  className?: string;
  reveal?: boolean;
  stacked?: boolean;
}) {
  return (
    <article
      className={cn(
        'border-2 border-foreground bg-card shadow-[7px_7px_0_var(--foreground)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[9px_9px_0_var(--foreground)]',
        className
      )}
      data-stack-card={stacked ? '' : undefined}
      data-learn-reveal={reveal ? '' : undefined}
    >
      {children}
    </article>
  );
}

export function BrutalIcon({
  className,
  icon: Icon,
}: {
  className?: string;
  icon: IconComponent;
}) {
  return (
    <div
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center border-2 border-foreground bg-dynamic-yellow shadow-[3px_3px_0_var(--foreground)]',
        className
      )}
    >
      <Icon className="h-6 w-6" />
    </div>
  );
}

export function InkLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  return (
    <a
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 border-2 border-foreground bg-dynamic-yellow px-4 font-black shadow-[4px_4px_0_var(--foreground)] transition active:translate-x-1 active:translate-y-1 active:shadow-none',
        className
      )}
      href={href}
    >
      {children}
    </a>
  );
}
