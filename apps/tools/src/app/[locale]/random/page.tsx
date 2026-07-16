import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BASE_URL } from '@/constants/common';
import type { Locale } from '@/i18n/routing';
import RandomGeneratorClient from './random-generator-client';

interface Props {
  params: Promise<{
    locale: Locale;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'random_generator' });

  return createPageMetadata({
    baseUrl: BASE_URL,
    description: t('meta.description'),
    indexable: true,
    locale,
    localePrefix: 'never',
    pathname: '/random',
    siteName: 'Tuturuuu Tools',
    title: t('meta.title'),
  });
}

export default function RandomGeneratorPage() {
  return <RandomGeneratorClient />;
}
