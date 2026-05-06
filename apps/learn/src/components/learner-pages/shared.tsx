'use client';

import { useGSAP } from '@gsap/react';
import { BookOpen, Flame, LineChart, Sparkles } from '@tuturuuu/icons';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, type RefObject, useRef } from 'react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export type IconComponent = typeof Sparkles;

export const courseThemes = [
  {
    border: 'border-dynamic-green/25',
    icon: BookOpen,
    surface: 'bg-dynamic-green/10',
    text: 'text-dynamic-green',
  },
  {
    border: 'border-dynamic-orange/25',
    icon: Flame,
    surface: 'bg-dynamic-orange/10',
    text: 'text-dynamic-orange',
  },
  {
    border: 'border-dynamic-blue/25',
    icon: LineChart,
    surface: 'bg-dynamic-blue/10',
    text: 'text-dynamic-blue',
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

      gsap.from('[data-tulearn-reveal]', {
        autoAlpha: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.07,
        y: 24,
      });

      gsap.to('[data-float-loop]', {
        duration: 2.8,
        ease: 'sine.inOut',
        repeat: -1,
        y: -8,
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
            scale: 1 - index * 0.018,
            scrollTrigger: {
              end: 'bottom 35%',
              scrub: true,
              start: 'top 75%',
              trigger: card,
            },
            y: -index * 12,
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
    <div className="grid grid-flow-dense gap-3 md:grid-cols-6">
      <div className="h-64 animate-pulse rounded-[2rem] border border-border bg-card md:col-span-3 md:row-span-2" />
      <div className="h-32 animate-pulse rounded-[2rem] border border-border bg-card md:col-span-3" />
      <div className="h-32 animate-pulse rounded-[2rem] border border-border bg-card md:col-span-2" />
      <div className="h-32 animate-pulse rounded-[2rem] border border-border bg-card md:col-span-1" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
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
    <div className="rounded-[2rem] border border-dynamic-green/30 border-dashed bg-dynamic-green/10 p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-background text-dynamic-green shadow-sm">
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
  refValue,
  title,
}: {
  children: ReactNode;
  description?: string;
  refValue?: RefObject<HTMLDivElement | null>;
  title: string;
}) {
  return (
    <div className="space-y-8" ref={refValue}>
      <section className="rounded-[2rem] border border-border bg-background p-6 shadow-sm md:p-8">
        <h1 className="max-w-5xl text-balance font-bold text-[clamp(2.5rem,5vw,4.75rem)] leading-none tracking-normal">
          {title}
        </h1>
        {description ? (
          <p className="mt-4 max-w-2xl text-muted-foreground leading-7">
            {description}
          </p>
        ) : null}
      </section>
      {children}
    </div>
  );
}
