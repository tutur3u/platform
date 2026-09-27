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
    surface: 'bg-dynamic-yellow/15',
    text: 'text-foreground',
  },
  {
    icon: Flame,
    surface: 'bg-background',
    text: 'text-foreground',
  },
  {
    icon: LineChart,
    surface: 'bg-muted',
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
        'animate-pulse rounded-lg border border-border bg-card',
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
      className="rounded-lg border border-border border-dashed bg-muted/60 p-8 text-center"
      data-learn-reveal
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-background">
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
        className="rounded-xl border border-border bg-card p-6 md:p-8"
        data-learn-reveal
      >
        <div>
          {eyebrow ? (
            <p className="mb-3 text-muted-foreground text-sm">{eyebrow}</p>
          ) : null}
          <h1 className="max-w-5xl text-balance font-semibold text-3xl leading-tight tracking-normal md:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 max-w-2xl text-muted-foreground leading-7">
              {description}
            </p>
          ) : null}
        </div>
      </section>
      {children}
    </div>
  );
}

export function SurfaceCard({
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
        'rounded-xl border border-border bg-card transition-colors duration-200 hover:bg-muted/30',
        className
      )}
      data-stack-card={stacked ? '' : undefined}
      data-learn-reveal={reveal ? '' : undefined}
    >
      {children}
    </article>
  );
}

export function SurfaceIcon({
  className,
  icon: Icon,
}: {
  className?: string;
  icon: IconComponent;
}) {
  return (
    <div
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted',
        className
      )}
    >
      <Icon className="h-6 w-6" />
    </div>
  );
}

export function PrimaryLink({
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
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      href={href}
    >
      {children}
    </a>
  );
}
