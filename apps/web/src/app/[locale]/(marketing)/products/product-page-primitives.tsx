import { ArrowRight, Check, type LucideIcon } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import {
  type BloomTone,
  HeroAtmosphere,
} from '@/components/landing/shared/atmosphere';
import { SectionShell } from '@/components/landing/shared/section-shell';
import {
  type SurfaceAccent,
  SurfaceCard,
} from '@/components/landing/shared/surface-card';

/**
 * Shared kit for every `/products/*` page.
 *
 * The pages used to be ~215 lines of duplicated markup each, in a visual
 * language unrelated to the rest of marketing, with hard-coded English and a
 * "Coming Soon / Join Waitlist" framing that contradicted the landing page.
 * Each page is now a small config; this renders it in the landing page's own
 * system and reads all copy from `products.<slug>.*`.
 */

const accentText: Record<SurfaceAccent, string> = {
  blue: 'text-dynamic-blue',
  green: 'text-dynamic-green',
  purple: 'text-dynamic-purple',
  cyan: 'text-dynamic-cyan',
  orange: 'text-dynamic-orange',
  pink: 'text-dynamic-pink',
  red: 'text-dynamic-red',
  yellow: 'text-dynamic-yellow',
};

/** `SurfaceAccent` is wider than `BloomTone`; fold the extras onto a neighbour. */
const accentBloom: Record<SurfaceAccent, BloomTone> = {
  blue: 'blue',
  green: 'green',
  purple: 'purple',
  cyan: 'cyan',
  orange: 'orange',
  pink: 'purple',
  red: 'red',
  yellow: 'orange',
};

const accentGradient: Record<SurfaceAccent, string> = {
  blue: 'from-dynamic-blue to-dynamic-cyan',
  green: 'from-dynamic-green to-dynamic-cyan',
  purple: 'from-dynamic-purple to-dynamic-blue',
  cyan: 'from-dynamic-cyan to-dynamic-blue',
  orange: 'from-dynamic-orange to-dynamic-pink',
  pink: 'from-dynamic-pink to-dynamic-purple',
  red: 'from-dynamic-red to-dynamic-orange',
  yellow: 'from-dynamic-yellow to-dynamic-orange',
};

export interface ProductFeature {
  /** Key under `products.<slug>.features.*`. */
  key: string;
  icon: LucideIcon;
}

export interface ProductUseCase {
  /** Key under `products.<slug>.useCases.*`. */
  key: string;
  /** How many `items.N` entries to render. */
  itemCount: number;
}

export interface ProductPageConfig {
  /** i18n namespace segment: `products.<slug>`. */
  slug: string;
  accent: SurfaceAccent;
  icon: LucideIcon;
  /** Where the primary CTA goes — the live app, or onboarding. */
  primaryHref: string;
  /** Set when the primary CTA leaves tuturuuu.com. */
  primaryExternal?: boolean;
  features: ProductFeature[];
  useCases: ProductUseCase[];
}

export function ProductPage({ config }: { config: ProductPageConfig }) {
  // The namespace is built from the page's slug, so neither it nor the keys
  // beneath it can be checked against the message tree statically. Parity is
  // enforced instead by the repo's i18n gates, which compare en/vi key trees.
  const t = useTranslations(`products.${config.slug}` as never) as unknown as (
    key: string
  ) => string;
  const Icon = config.icon;

  return (
    <main className="relative w-full overflow-x-hidden">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-24 pb-16 sm:px-6 sm:pt-28 lg:px-8 lg:pt-32">
        <HeroAtmosphere />

        <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/40 py-1.5 pr-4 pl-2.5 font-mono-ui text-[0.65rem] uppercase tracking-[0.2em] backdrop-blur-md',
              accentText[config.accent]
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t('eyebrow')}
          </span>

          <h1 className="mt-8 text-balance font-display font-extrabold text-4xl leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            {t('title')}
          </h1>

          <p className="mt-6 max-w-2xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg">
            {t('description')}
          </p>

          <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <a
              className={cn(
                'group relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-r px-8 font-medium text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto',
                accentGradient[config.accent]
              )}
              href={config.primaryHref}
              {...(config.primaryExternal
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
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
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-foreground/12 bg-background/40 px-6 font-medium text-foreground/75 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
              href="/contact"
            >
              {t('cta.secondary')}
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <SectionShell
        bloom={accentBloom[config.accent]}
        eyebrow={t('features.eyebrow')}
        index="01"
        subtitle={t('features.subtitle')}
        title={t('features.title')}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {config.features.map((feature) => (
            <SurfaceCard
              accent={config.accent}
              description={t(`features.${feature.key}.description`)}
              icon={feature.icon}
              key={feature.key}
              title={t(`features.${feature.key}.title`)}
            />
          ))}
        </div>
      </SectionShell>

      {/* Use cases */}
      <SectionShell
        eyebrow={t('useCases.eyebrow')}
        index="02"
        subtitle={t('useCases.subtitle')}
        title={t('useCases.title')}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {config.useCases.map((useCase) => (
            <div
              className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-6"
              key={useCase.key}
            >
              <h3 className="font-display font-semibold text-lg tracking-[-0.01em]">
                {t(`useCases.${useCase.key}.title`)}
              </h3>
              <ul className="mt-4 grid gap-2.5">
                {Array.from({ length: useCase.itemCount }, (_, index) => (
                  <li
                    className="flex items-start gap-2.5"
                    key={`${useCase.key}-${index}`}
                  >
                    <Check
                      className={cn(
                        'mt-0.5 h-3.5 w-3.5 shrink-0',
                        accentText[config.accent]
                      )}
                    />
                    <span className="text-foreground/60 text-sm leading-relaxed">
                      {t(`useCases.${useCase.key}.items.${index}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionShell>

      {/* Closing */}
      <section className="relative px-4 pt-8 pb-28 sm:px-6 lg:px-8 lg:pb-36">
        <div className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-3xl border border-foreground/10 bg-foreground/[0.02] px-6 py-14 text-center sm:px-14">
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent to-transparent',
                accentGradient[config.accent]
              )}
            />
            <h2 className="text-balance font-display font-semibold text-3xl tracking-[-0.03em] sm:text-4xl">
              {t('closing.title')}
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-balance text-foreground/55">
              {t('closing.description')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                className={cn(
                  'inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r px-8 font-medium text-white shadow-lg transition-transform duration-300 hover:-translate-y-0.5 sm:w-auto',
                  accentGradient[config.accent]
                )}
                href={config.primaryHref}
                {...(config.primaryExternal
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                {t('cta.primary')}
              </a>
              <a
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-foreground/12 bg-background/40 px-6 font-medium text-foreground/75 transition-colors hover:border-foreground/25 hover:text-foreground sm:w-auto"
                href="/pricing"
              >
                {t('cta.pricing')}
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Legacy primitives, still imported by pages that have not been migrated to
 * `ProductPage` yet. Remove once every page is converted.
 */
const joinClassNames = (...classNames: (string | undefined)[]) =>
  classNames.filter(Boolean).join(' ');

export function ProductBadge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={joinClassNames(
        'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-transparent bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground text-xs',
        className
      )}
      {...props}
    />
  );
}

export function ProductCard({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={joinClassNames(
        'rounded-xl border bg-card text-card-foreground shadow-sm',
        className
      )}
      {...props}
    />
  );
}

export function ProductButton({
  className,
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      className={joinClassNames(
        'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-6 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export function ProductLinkButton({
  className,
  ...props
}: ComponentProps<'a'>) {
  return (
    <a
      className={joinClassNames(
        'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-6 font-medium text-sm hover:bg-accent hover:text-accent-foreground',
        className
      )}
      {...props}
    />
  );
}
