import { marketingFontVariables } from '@tuturuuu/ui/marketing';
import { generatePageMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BASE_URL } from '@/constants/common';
import { FormsLandingPage } from '@/features/landing/landing-page';
import { LandingStructuredData } from '@/features/landing/structured-data';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** The root layout protects private pages. Public landing and accessible
 * shared forms explicitly override it; author opt-outs remain respected. */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'forms.landing' });

  return generatePageMetadata({
    config: {
      baseUrl: BASE_URL,
      description: t('meta.description'),
      indexable: true,
      keywords: [
        'form builder',
        'online forms',
        'survey builder',
        'typeform alternative',
        'google forms alternative',
        'form analytics',
        'embeddable forms',
      ],
      localePrefix: 'never',
      pathname: '/',
      siteName: t('app_name'),
      socialTitle: t('meta.social_title'),
      title: t('meta.title'),
    },
    params,
  });
}

/**
 * The page itself is fully prerenderable. The only request-dependent detail is
 * whether the visitor is signed in, and that is isolated inside the CTA slots'
 * own `<Suspense>` boundaries — so the marketing HTML is static and the buttons
 * stream in.
 */
export default async function FormsLandingRoute({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'forms.landing' });

  return (
    <div className={cn('bg-background', marketingFontVariables)}>
      <LandingStructuredData
        description={t('meta.description')}
        name={t('app_name')}
        url={BASE_URL}
      />
      <FormsLandingPage />
    </div>
  );
}
