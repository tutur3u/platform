import { SecondaryCta } from '@tuturuuu/ui/marketing';
import { useTranslations } from 'next-intl';
import { PrimaryCtaSlot } from '../cta-slots';

interface ClosingSectionProps {
  /** In-page anchor for the quiet secondary action. */
  secondaryHref: string;
}

/** Final call to action. */
export function ClosingSection({ secondaryHref }: ClosingSectionProps) {
  const t = useTranslations('forms.landing.closing');

  return (
    <section className="relative px-4 pt-8 pb-28 sm:px-6 lg:px-8 lg:pb-36">
      <div className="mx-auto max-w-4xl">
        <div className="relative overflow-hidden rounded-3xl border border-foreground/10 bg-foreground/[0.02] px-6 py-14 text-center sm:px-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-purple/50 to-transparent"
          />
          <h2 className="text-balance font-display font-semibold text-3xl tracking-[-0.03em] sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-balance text-foreground/55">
            {t('description')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCtaSlot />
            <SecondaryCta href={secondaryHref}>{t('secondary')}</SecondaryCta>
          </div>
        </div>
      </div>
    </section>
  );
}
