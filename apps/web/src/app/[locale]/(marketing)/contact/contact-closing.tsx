import { Brain, Clock, Star } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { Grain, GridSubstrate } from '@/components/landing/shared/atmosphere';
import { Reveal } from '@/components/landing/shared/reveal';
import { SectionEyebrow } from '@/components/landing/shared/section-shell';

/**
 * Closing panel, mirroring the landing page's own sign-off so the two pages end
 * the same way.
 */
export function ContactClosing() {
  const t = useTranslations('contact');

  const facts = [
    {
      icon: Clock,
      label: t('banner.features.response'),
      tone: 'text-dynamic-green',
    },
    {
      icon: Brain,
      label: t('banner.features.expert'),
      tone: 'text-dynamic-blue',
    },
    {
      icon: Star,
      label: t('banner.features.dedicated'),
      tone: 'text-dynamic-yellow',
    },
  ];

  return (
    <section className="relative px-4 pt-4 pb-28 sm:px-6 sm:pb-36 lg:px-8 lg:pb-44">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] border border-foreground/10 bg-foreground/[0.02] px-6 py-14 text-center sm:px-16 sm:py-16">
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-32 left-1/2 h-80 w-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--green)_50%,transparent),transparent)] opacity-30 blur-3xl dark:opacity-40"
            />
            <GridSubstrate size="48px" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-20 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--green)_60%,transparent),color-mix(in_oklab,var(--cyan)_60%,transparent),transparent)]"
            />
            <Grain />

            <div className="relative">
              <SectionEyebrow className="justify-center">
                {t('banner.eyebrow')}
              </SectionEyebrow>

              <h2 className="mx-auto mt-6 max-w-2xl text-balance font-display font-semibold text-3xl leading-[1.05] tracking-[-0.03em] sm:text-4xl lg:text-5xl">
                {t('banner.title')}
              </h2>

              <p className="mx-auto mt-5 max-w-lg text-balance text-foreground/55 leading-relaxed">
                {t('banner.description')}
              </p>

              <div className="mx-auto mt-12 grid max-w-2xl grid-cols-1 divide-y divide-foreground/[0.08] border-foreground/[0.08] border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {facts.map((fact) => (
                  <div
                    className="flex items-center justify-center gap-2 px-3 py-4"
                    key={fact.label}
                  >
                    <fact.icon className={`h-3.5 w-3.5 ${fact.tone}`} />
                    <span className="font-mono-ui text-[0.65rem] text-foreground/45 uppercase tabular-nums tracking-[0.14em]">
                      {fact.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
