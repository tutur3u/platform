import { LayoutGrid, Sparkles } from '@tuturuuu/icons';
import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import {
  LAUNCHABLE_APP_CATEGORIES,
  LAUNCHABLE_APPS,
} from '@tuturuuu/utils/launchable-apps';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AppsCatalog } from '@/components/apps-catalog';
import { AppsGatewayAtmosphere } from '@/components/apps-gateway-atmosphere';
import { BASE_URL } from '@/constants/common';

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'appsGateway.metadata',
  });

  return createPageMetadata({
    baseUrl: BASE_URL,
    description: t('description'),
    indexable: true,
    locale,
    localePrefix: 'never',
    pathname: '/',
    siteName: 'Tuturuuu Apps',
    title: t('title'),
  });
}

export default async function AppsGatewayPage() {
  const t = await getTranslations('appsGateway');
  const launcherT = await getTranslations('command_launcher');
  const categories = LAUNCHABLE_APP_CATEGORIES.map((category) => ({
    description: launcherT(`app_category_descriptions.${category}` as never),
    label: launcherT(`app_categories.${category}` as never),
    slug: category,
  }));
  const apps = LAUNCHABLE_APPS.map((app) => ({
    aliases: app.aliases,
    category: app.category,
    description: launcherT(`app_descriptions.${app.slug}` as never),
    href: `/${app.slug}`,
    slug: app.slug,
    title: launcherT(`app_names.${app.slug}` as never),
  }));

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <section className="relative overflow-hidden px-4 pt-24 pb-20 sm:px-6 sm:pt-32 sm:pb-24 lg:px-8 lg:pt-40">
        <AppsGatewayAtmosphere />
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background/40 py-1.5 pr-4 pl-2.5 font-mono-ui text-[0.65rem] text-foreground/60 uppercase tracking-[0.2em] backdrop-blur-md">
            <span className="relative flex size-4 items-center justify-center">
              <span className="absolute inset-0 animate-ring-pulse rounded-full bg-dynamic-purple/40" />
              <Sparkles className="relative size-3 text-dynamic-purple" />
            </span>
            {t('eyebrow')}
          </span>

          <h1 className="mt-8 max-w-5xl text-balance font-display font-extrabold text-5xl leading-[0.98] tracking-[-0.045em] sm:text-6xl md:text-7xl lg:text-[5.25rem]">
            <span className="block">{t('title.line1')}</span>
            <span className="block animate-text-sheen bg-[length:250%_auto] bg-[linear-gradient(100deg,var(--purple),var(--blue)_35%,var(--cyan)_50%,var(--blue)_65%,var(--purple))] bg-clip-text text-transparent motion-reduce:animate-none">
              {t('title.line2')}
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg">
            {t('subtitle')}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 rounded-full border border-foreground/10 bg-background/35 px-5 py-3 font-mono-ui text-[0.66rem] text-foreground/45 uppercase tracking-[0.16em] backdrop-blur-md">
            <span className="flex items-center gap-2">
              <LayoutGrid className="size-3.5 text-dynamic-blue" />
              {t('appsCount', { count: apps.length })}
            </span>
            <span
              aria-hidden
              className="hidden h-3 w-px bg-foreground/15 sm:block"
            />
            <span>{t('categoriesCount', { count: categories.length })}</span>
            <span
              aria-hidden
              className="hidden h-3 w-px bg-foreground/15 sm:block"
            />
            <span>{t('oneSystem')}</span>
          </div>
        </div>
      </section>

      <section className="relative px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_12%,transparent)_25%,color-mix(in_oklab,var(--foreground)_12%,transparent)_75%,transparent)]" />
        <div className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[30rem] w-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--blue),transparent)] opacity-[0.06] blur-3xl dark:opacity-[0.1]" />

        <div className="relative mx-auto w-full max-w-7xl">
          <header className="mb-12 max-w-3xl sm:mb-16">
            <div className="flex items-center gap-3 font-mono-ui text-[0.7rem] text-foreground/45 uppercase tracking-[0.22em]">
              <span className="text-foreground/30 tabular-nums">01</span>
              <span className="h-px w-8 bg-gradient-to-r from-foreground/25 to-transparent" />
              <span>{t('catalog.eyebrow')}</span>
            </div>
            <h2 className="mt-6 max-w-3xl text-balance font-display font-semibold text-4xl tracking-[-0.03em] sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
              {t('catalog.title')}
            </h2>
            <p className="mt-5 max-w-2xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg">
              {t('catalog.description')}
            </p>
          </header>

          <AppsCatalog
            apps={apps}
            categories={categories}
            copy={{
              allApps: launcherT('app_categories.all'),
              clearSearch: t('catalog.clearSearch'),
              emptyDescription: launcherT('no_apps_found_description'),
              emptyTitle: launcherT('no_apps_found'),
              openApp: launcherT('open_app'),
              searchPlaceholder: launcherT('search_apps'),
            }}
          />
        </div>
      </section>
    </main>
  );
}
