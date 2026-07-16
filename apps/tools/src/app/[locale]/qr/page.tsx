import QR from '@tuturuuu/ui/custom/qr/qr';
import { Separator } from '@tuturuuu/ui/separator';
import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
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
    namespace: 'qrPage.metadata',
  });

  return createPageMetadata({
    baseUrl: BASE_URL,
    description: t('description'),
    indexable: true,
    locale,
    pathname: '/qr',
    siteName: 'Tuturuuu Tools',
    title: t('title'),
  });
}

export default async function QRGeneratorPage() {
  const t = await getTranslations();

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <p className="font-medium text-dynamic-blue text-sm">
            {t('qrPage.eyebrow')}
          </p>
          <h1 className="mt-2 font-semibold text-4xl tracking-normal sm:text-5xl">
            {t('common.qr_generator')}
          </h1>
        </div>
        <Separator />
        <QR />
      </section>
    </main>
  );
}
