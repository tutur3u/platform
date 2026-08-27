import { ArrowRight } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';

import { getTranslations } from 'next-intl/server';
import { HeroAtmosphere } from '@/components/landing/shared/atmosphere';
import { SectionShell } from '@/components/landing/shared/section-shell';
import { Link } from '@/i18n/routing';
import {
  MARKETING_PRODUCT_GROUPS,
  MARKETING_PRODUCT_ICONS,
} from '../../marketing-nav/products';

/**
 * Index for `/products`.
 *
 * Every `/products/<slug>` page existed and `/products` itself did not, so the
 * link people reach for — the one in the nav's own "explore every app" copy,
 * and the one `public_paths` already treats as public — returned a 404.
 *
 * Built from `MARKETING_PRODUCT_GROUPS`, the same source the mega-menu renders,
 * so a product added to the menu appears here without anyone remembering to.
 *
 * Links come from `@/i18n/routing`, not `next/link`. `localePrefix` is
 * `as-needed`, so a bare `/products/calendar` carries no locale and would be
 * resolved from the cookie or `Accept-Language` — a click from `/vi/products`
 * could land in English. Every href here points at a sibling localized page,
 * which is exactly where that goes wrong.
 */
export default async function ProductsIndexPage() {
  const t = await getTranslations('marketing-nav');

  return (
    <main className="relative w-full overflow-x-hidden">
      <section className="relative overflow-hidden px-4 pt-24 pb-10 sm:px-6 sm:pt-28 lg:px-8 lg:pt-32">
        <HeroAtmosphere />

        <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/40 py-1.5 pr-4 pl-2.5 font-mono-ui text-[0.65rem] text-foreground/60 uppercase tracking-[0.2em] backdrop-blur-md">
            {t('all_apps')}
          </span>

          <h1 className="mt-8 text-balance font-display font-extrabold text-4xl leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            {t('index.title')}
          </h1>

          <p className="mt-6 max-w-2xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg">
            {t('index.description')}
          </p>
        </div>
      </section>

      {MARKETING_PRODUCT_GROUPS.map((group, groupIndex) => (
        <SectionShell
          key={group.key}
          align="start"
          index={String(groupIndex + 1).padStart(2, '0')}
          title={t(`groups.${group.key}` as never)}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((product) => {
              const Icon = MARKETING_PRODUCT_ICONS[product.key];

              return (
                <Link
                  key={product.key}
                  href={product.href}
                  className={cn(
                    'group relative flex flex-col rounded-3xl border border-foreground/10 bg-background/40 p-6 backdrop-blur-md',
                    'transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/25',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-foreground/10 bg-foreground/5',
                      product.accent
                    )}
                  >
                    {Icon ? <Icon className="h-5 w-5" /> : null}
                  </span>

                  <span className="mt-5 font-semibold text-lg">
                    {t(`products.${product.key}.label` as never)}
                  </span>

                  <span className="mt-2 flex-1 text-foreground/55 text-sm leading-relaxed">
                    {t(`products.${product.key}.description` as never)}
                  </span>

                  <span className="mt-5 inline-flex items-center font-medium text-foreground/70 text-sm transition-colors group-hover:text-foreground">
                    {t('index.learn_more')}
                    <ArrowRight
                      aria-hidden
                      className="ml-1.5 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        </SectionShell>
      ))}
    </main>
  );
}
