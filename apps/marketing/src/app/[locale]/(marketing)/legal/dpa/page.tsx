import { getLegalDocument } from '@tuturuuu/legal';
import { toLegalPageConfig } from '@/components/legal/canonical-legal-config';
import { LegalPageLayout } from '@/components/legal/legal-page-layout';

export default async function DpaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <LegalPageLayout
      config={toLegalPageConfig(getLegalDocument('dpa', locale))}
    />
  );
}
