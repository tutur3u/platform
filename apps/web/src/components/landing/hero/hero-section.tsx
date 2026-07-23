import { ArrowRight, PlayCircle } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { HeroAtmosphere } from '../shared/atmosphere';
import { rise } from '../shared/rise';
import { TrustBadges } from './trust-badges';
import { VideoHero } from './video-hero';

/**
 * The hero opens on the headline.
 *
 * There is no eyebrow badge: a generic label above the title only delayed the
 * one line that actually says what this is, and the suite is introduced
 * properly by the marquee and bento immediately below.
 */
export function HeroSection() {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative overflow-hidden px-4 pt-36 pb-20 sm:px-6 sm:pt-40 lg:px-8 lg:pt-48 lg:pb-24">
      <HeroAtmosphere />

      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col items-center text-center">
          {/* Headline — each line rises independently */}
          <h1 className="relative max-w-5xl text-balance font-display font-extrabold text-[3.25rem] leading-[0.95] tracking-[-0.05em] sm:text-7xl lg:text-[6rem]">
            {/* Light behind the second line, so the gradient reads as lit
                rather than merely coloured. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-[radial-gradient(ellipse_60%_100%_at_50%_100%,color-mix(in_oklab,var(--blue)_28%,transparent),transparent)] blur-2xl"
            />
            <span {...rise(0, 'block')}>{t('title.line1')}</span>
            <span
              {...rise(
                1,
                'block animate-text-sheen bg-[linear-gradient(100deg,var(--purple),var(--blue)_35%,var(--cyan)_50%,var(--blue)_65%,var(--purple))] bg-[length:250%_auto] bg-clip-text text-transparent'
              )}
            >
              {t('title.line2')}
            </span>
          </h1>

          {/* Description */}
          <p
            {...rise(
              2,
              'mt-8 max-w-xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg'
            )}
          >
            {t('description')}
          </p>

          {/* CTAs */}
          <div
            {...rise(
              3,
              'mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row'
            )}
          >
            <a
              className="group relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(100deg,var(--purple),var(--blue))] px-8 font-medium text-white shadow-[0_8px_30px_-8px_color-mix(in_oklab,var(--purple)_70%,transparent)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_44px_-8px_color-mix(in_oklab,var(--purple)_85%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
              href="/onboarding"
            >
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.3),transparent)] transition-transform duration-700 group-hover:translate-x-full"
              />
              <span className="relative flex items-center">
                {t('cta.primary')}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </a>
            <a
              className="group inline-flex h-12 w-full items-center justify-center rounded-full border border-foreground/12 bg-background/40 px-6 font-medium text-foreground/75 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
              href="#demo"
            >
              <PlayCircle className="mr-2 h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
              {t('cta.secondary')}
            </a>
          </div>
        </div>

        {/* Product frame. Padding leaves room for the floating vignettes, which
            sit outside the frame edges on large screens. */}
        <div {...rise(4, 'relative mt-16 sm:mt-20 lg:px-24')}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-12 -bottom-10 h-28 rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--blue)_50%,transparent),transparent)] opacity-50 blur-2xl"
          />
          <div className="group relative rounded-2xl border border-foreground/10 bg-background/40 p-1.5 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.55)] backdrop-blur-md transition-shadow duration-500 hover:shadow-[0_40px_100px_-30px_rgb(0_0_0/0.7)]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent"
            />
            <VideoHero />
          </div>
        </div>

        {/* Scroll cue */}
        <div
          {...rise(
            5,
            'mt-14 flex justify-center sm:mt-16 [&_span]:animate-scroll-cue'
          )}
        >
          <span
            aria-hidden
            className="block h-8 w-px bg-gradient-to-b from-transparent via-foreground/40 to-transparent"
          />
        </div>

        <TrustBadges />
      </div>
    </section>
  );
}
