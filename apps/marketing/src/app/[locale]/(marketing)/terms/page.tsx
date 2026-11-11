import { getLegalDocument } from '@tuturuuu/legal';
import { toLegalPageConfig } from '@/components/legal/canonical-legal-config';
import { LegalPageLayout } from '@/components/legal/legal-page-layout';

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <LegalPageLayout
      config={toLegalPageConfig(getLegalDocument('terms', locale))}
    />
  );
}
