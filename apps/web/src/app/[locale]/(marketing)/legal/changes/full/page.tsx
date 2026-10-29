import { LegalChanges } from '@/components/legal/legal-changes';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';
export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.legal_changes',
  pathname: '/legal/changes/full',
  indexable: false,
});
export default async function ChangesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <LegalChanges locale={locale === 'vi' ? 'vi' : 'en'} full={true} />;
}
