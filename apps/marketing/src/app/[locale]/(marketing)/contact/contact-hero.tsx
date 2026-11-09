import { MessageCircle } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { HeroAtmosphere } from '@/components/landing/shared/atmosphere';

/**
 * Contact hero.
 *
 * Same light rig and type scale as the landing hero so arriving from the nav
 * feels like moving inside one page rather than onto a different site.
 */
export function ContactHero() {
  const t = useTranslations('contact');

  return (
    <section className="relative overflow-hidden px-4 pt-24 pb-12 sm:px-6 sm:pt-28 sm:pb-16 lg:px-8 lg:pt-32">
      <HeroAtmosphere />

      <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/40 py-1.5 pr-4 pl-2.5 font-mono-ui text-[0.65rem] text-dynamic-purple uppercase tracking-[0.2em] backdrop-blur-md">
          <MessageCircle className="h-3.5 w-3.5" />
          {t('hero.badge')}
        </span>

        <h1 className="mt-8 text-balance font-display font-extrabold text-4xl leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
          {t('hero.title.part1')}{' '}
          <span className="bg-[linear-gradient(100deg,var(--purple),var(--blue))] bg-clip-text text-transparent">
            {t('hero.title.highlight')}
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg">
          {t('hero.description')}
        </p>
      </div>
    </section>
  );
}
