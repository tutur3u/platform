import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import type { Metadata } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { CapabilityCopy } from '@/components/capabilities/product-scenes';
import {
  Portfolio,
  type PortfolioCopy,
} from '@/components/portfolio/portfolio';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('portfolio');
  const locale = await getLocale();
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: locale === 'vi' ? '/vi/portfolio' : '/portfolio',
      languages: { en: '/portfolio', vi: '/vi/portfolio' },
    },
  };
}

export default async function PortfolioPage() {
  const messages = await getMessages();
  const locale = await getLocale();
  const copy = messages.portfolio as PortfolioCopy;
  const apps = LAUNCHABLE_APPS.map((app) => ({
    slug: app.slug,
    title: app.title,
    category: app.category,
    url: app.productionUrl,
    description:
      copy.directory[app.slug as keyof typeof copy.directory].description,
  }));
  return (
    <Portfolio
      copy={copy}
      capabilities={messages.capabilities as CapabilityCopy}
      apps={apps}
      locale={locale}
    />
  );
}
