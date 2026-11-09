import { Reveal } from '@/components/landing/shared/reveal';
import { SectionEyebrow } from '@/components/landing/shared/section-shell';
import { useAboutTranslations } from './use-about-translations';

/** Closing invitation — the same panel treatment the product pages end on. */
export function ClosingSection() {
  const t = useAboutTranslations();

  return (
    <section className="relative px-4 pt-8 pb-28 sm:px-6 lg:px-8 lg:pb-36">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-foreground/10 bg-foreground/[0.02] px-6 py-14 text-center sm:px-14">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-purple/45 to-transparent"
            />
            <SectionEyebrow className="justify-center">
              {t('sections.closing.eyebrow')}
            </SectionEyebrow>
            <h2 className="mt-6 text-balance font-display font-semibold text-3xl tracking-[-0.03em] sm:text-4xl">
              {t('cta.title')}
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-balance text-foreground/55 leading-relaxed">
              {t('cta.description')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-dynamic-purple to-dynamic-blue px-8 font-medium text-white shadow-lg transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
                href="https://github.com/tutur3u/platform"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t('cta.contribute')}
              </a>
              <a
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-foreground/12 bg-background/40 px-6 font-medium text-foreground/75 transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
                href="mailto:contact@tuturuuu.com"
              >
                {t('cta.getInTouch')}
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
