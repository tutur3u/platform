import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import QR from './qr';

export default async function QRGeneratorPage() {
  const t = await getTranslations();

  return (
    <div className="mx-4 flex min-h-full flex-col gap-8 pt-24 md:mx-32 lg:mx-64">
      <div className="mb-4 md:mb-8">
        <h1 className="font-semibold text-4xl">{t('common.qr_generator')}</h1>
        <Separator className="my-4" />
        <QR />
      </div>
    </div>
  );
}
