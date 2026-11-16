import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';
import { CitationAttribution } from './citation-attribution';
import { CitationHelper } from './citation-helper';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'cite.metadata',
  pathname: '/cite',
});

export default async function CitePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: requested } = await params;
  const locale = requested === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({ locale, namespace: 'cite' });
  // The root client catalog is filtered, so this page provides its own namespace.
  const messages = await getMessages({ locale });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 md:px-8 md:pt-10">
      <header className="mb-6 space-y-1.5 md:mb-8">
        <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
          {t('title')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('compatibility')}</p>
      </header>
      <NextIntlClientProvider messages={{ cite: messages.cite }}>
        <CitationHelper attribution={<CitationAttribution locale={locale} />} />
      </NextIntlClientProvider>
    </main>
  );
}
