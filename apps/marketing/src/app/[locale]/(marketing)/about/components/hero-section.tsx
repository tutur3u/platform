import { ArrowRight, Globe, Sparkles } from '@tuturuuu/icons/lucide-static';
import { HeroAtmosphere } from '@/components/landing/shared/atmosphere';
import { useAboutTranslations } from './use-about-translations';

/**
 * Opening statement. Same light rig, badge and button pair as the product
 * pages so arriving from the landing page feels like the same site.
 */
export function AboutHero() {
  const t = useAboutTranslations();

  return (
    <section className="relative overflow-hidden px-4 pt-24 pb-16 sm:px-6 sm:pt-28 lg:px-8 lg:pt-32">
      <HeroAtmosphere />

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/40 py-1.5 pr-4 pl-2.5 font-mono-ui text-[0.65rem] text-dynamic-purple uppercase tracking-[0.2em] backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5" />
          {t('hero.badge')}
        </span>

        <h1 className="mt-8 text-balance font-display font-extrabold text-4xl leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
          {t('hero.title.part1')}{' '}
          <span className="text-dynamic-purple">
            {t('hero.title.highlight')}
          </span>{' '}
          {t('hero.title.part2')}
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg">
          {t('hero.description')}
        </p>

        <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <a
            className="group inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-dynamic-purple to-dynamic-blue px-8 font-medium text-white shadow-lg transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
            href="#vision"
          >
            {t('hero.cta.vision')}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
          <a
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-foreground/12 bg-background/40 px-6 font-medium text-foreground/75 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
            href="https://github.com/tutur3u/platform"
            rel="noopener noreferrer"
            target="_blank"
          >
            <Globe className="mr-2 h-4 w-4" />
            {t('hero.cta.openSource')}
          </a>
        </div>
      </div>
    </section>
  );
}
