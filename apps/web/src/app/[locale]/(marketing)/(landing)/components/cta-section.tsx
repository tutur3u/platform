'use client';

import { Button } from '@tuturuuu/ui/button';
import { Calendar, Clock, Sparkles } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef } from 'react';

export function CtaSection() {
  const t = useTranslations('landing');

  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <section
      ref={sectionRef}
      className="relative container my-40 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-purple-500 to-blue-500 p-0 md:p-0"
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div className="absolute top-10 left-10 h-40 w-40 rounded-full bg-white blur-3xl"></div>
        <div className="absolute right-20 bottom-20 h-40 w-40 rounded-full bg-white blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 transform rounded-full bg-white blur-3xl"></div>
      </div>

      {/* Floating icons */}
      <div className="floating-element absolute top-[20%] left-[10%] flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
        <Calendar className="h-8 w-8 text-white" />
      </div>
      <div
        className="floating-element absolute right-[15%] bottom-[15%] flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm"
        style={{ animationDelay: '0.5s' }}
      >
        <Clock className="h-6 w-6 text-white" />
      </div>
      <div
        className="floating-element absolute top-[25%] right-[25%] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm"
        style={{ animationDelay: '1s' }}
      >
        <Sparkles className="h-5 w-5 text-white" />
      </div>

      <div className="relative z-10 px-6 py-20 md:px-20 md:py-24">
        <div className="cta-content mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-4xl leading-normal font-bold text-balance text-white md:text-5xl lg:text-6xl">
            {t('ready_to_transform_your_calendar_experience')}
          </h2>
          <p className="mb-10 text-xl leading-relaxed text-balance text-white/90 md:text-2xl">
            {t(
              'join_thousands_of_professionals_who_have_reclaimed_their_time_and_reduced_scheduling_stress_with_tuturuuu'
            )}
          </p>
          <div className="flex flex-col justify-center gap-5 sm:flex-row">
            <Link href="/onboarding">
              <Button
                size="lg"
                className="cta-button relative overflow-hidden bg-white px-8 text-lg font-medium text-purple-600 transition-all duration-300 hover:bg-gray-100 hover:shadow-lg hover:shadow-purple-700/20"
              >
                <span className="relative z-10">{t('get_early_access')}</span>
                <span className="hover:animate-shimmer absolute inset-0 -z-0 bg-gradient-to-r from-white via-purple-100 to-white bg-[length:200%_100%] opacity-0 transition-opacity duration-300 hover:opacity-100"></span>
              </Button>
            </Link>
          </div>
          <div className="mt-8 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
            <p className="text-lg font-medium text-balance text-white">
              {t(
                'limited_spots_available_for_our_q3_2025_early_access_program'
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
