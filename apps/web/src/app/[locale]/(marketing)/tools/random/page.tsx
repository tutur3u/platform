import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
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

  return {
    description: t('meta.description'),
    title: t('meta.title'),
  };
}

export default function RandomGeneratorPage() {
  return <RandomGeneratorClient />;
}
