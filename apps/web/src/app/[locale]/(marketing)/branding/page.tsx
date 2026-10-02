import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';
import { getMarketingMetadata } from '@/lib/seo/marketing-metadata';
import { getPublicLocalizedPath } from '@/lib/seo/public-routes';
import BrandingClient from './branding-client';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'marketingSeo.branding',
  });
  const pageUrl = new URL(
    getPublicLocalizedPath('/branding', normalizedLocale),
    siteConfig.url
  ).toString();
  const metadata = getMarketingMetadata(
    {
      pathname: '/branding',
      title: t('title'),
      description: t('description'),
      image: `${pageUrl}/opengraph-image`,
      imageAlt: t('title'),
    },
    normalizedLocale
  );

  return {
    ...metadata,
    authors: [{ name: 'Tuturuuu Team' }],
    twitter: {
      ...metadata.twitter,
      images: [`${pageUrl}/twitter-image`],
    },
  };
}

export default function BrandingPage() {
  return <BrandingClient />;
}
