import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';
import { UiShowcaseClient } from './ui-showcase-client';

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.metadata',
  });
  const pageUrl = `${siteConfig.url}/${normalizedLocale}/ui`;

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: pageUrl,
      languages: {
        en: `${siteConfig.url}/en/ui`,
        vi: `${siteConfig.url}/vi/ui`,
      },
    },
    openGraph: {
      type: 'website',
      url: pageUrl,
      title: t('title'),
      description: t('description'),
      siteName: siteConfig.name,
      locale: normalizedLocale === 'vi' ? 'vi_VN' : 'en_US',
    },
    twitter: {
      card: 'summary',
      title: t('title'),
      description: t('description'),
      creator: '@tuturuuu',
    },
  };
}

export default function UiShowcasePage() {
  return <UiShowcaseClient />;
}
