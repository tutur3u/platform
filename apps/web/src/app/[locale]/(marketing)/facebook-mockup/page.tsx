import FacebookMockup from '@tuturuuu/ui/custom/facebook-mockup/facebook-mockup';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'facebook_mockup' });

  return {
    title: t('meta.title'),
    description: t('meta.description'),
  };
}

export default async function FacebookMockupPage() {
  const t = await getTranslations();

  return (
    <div className="@lg:mx-24 @md:mx-10 mx-4 flex min-h-full flex-col gap-8 pt-24 pb-16">
      <div className="grid gap-4">
        <div>
          <h1 className="font-semibold text-4xl">
            {t('common.facebook_mockup')}
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            {t('facebook_mockup.description')}
          </p>
        </div>
        <Separator />
        <FacebookMockup />
      </div>
    </div>
  );
}
