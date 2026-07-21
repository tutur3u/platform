import { ArrowRight, PlayCircle, Sparkles } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { HeroAtmosphere } from '../shared/atmosphere';
import { rise } from '../shared/rise';
import { TrustBadges } from './trust-badges';
import { VideoHero } from './video-hero';

export function HeroSection() {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative overflow-hidden px-4 pt-32 pb-20 sm:px-6 sm:pt-36 lg:px-8 lg:pt-44 lg:pb-24">
      <HeroAtmosphere />

      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col items-center text-center">
          {/* Eyebrow */}
          <span
            {...rise(
              0,
              'group inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/40 py-1.5 pr-4 pl-2.5 font-mono-ui text-[0.65rem] text-foreground/60 uppercase tracking-[0.2em] backdrop-blur-md'
            )}
          >
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span
                aria-hidden
                className="absolute inset-0 animate-ring-pulse rounded-full bg-dynamic-purple/40"
              />
              <Sparkles className="relative h-3 w-3 text-dynamic-purple" />
            </span>
            {t('badge')}
          </span>

          {/* Headline — each line rises independently */}
          <h1 className="mt-8 max-w-5xl text-balance font-display font-extrabold text-5xl leading-[0.98] tracking-[-0.045em] sm:text-6xl md:text-7xl lg:text-[5.5rem]">
            <span {...rise(1, 'block')}>{t('title.line1')}</span>
            <span
              {...rise(
                2,
                'block animate-text-sheen bg-[linear-gradient(100deg,var(--purple),var(--blue)_35%,var(--cyan)_50%,var(--blue)_65%,var(--purple))] bg-[length:250%_auto] bg-clip-text text-transparent'
              )}
            >
              {t('title.line2')}
            </span>
          </h1>

          {/* Description */}
          <p
            {...rise(
              3,
              'mt-7 max-w-xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg'
            )}
          >
            {t('description')}
          </p>

          {/* CTAs */}
          <div
            {...rise(
              4,
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

        {/* Product frame. Padding leaves room for the video's floating cards,
            which sit outside the frame edges on large screens. */}
        <div {...rise(5, 'relative mt-16 sm:mt-20 lg:px-24')}>
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
            6,
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
