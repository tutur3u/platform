import { notFound } from 'next/navigation';
import {
  ARCHIVE_VERSION,
  getArchivedLegalPageConfig,
  isArchivedKind,
} from '@/components/legal/archive-legal-config';
import { LegalPageLayout } from '@/components/legal/legal-page-layout';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

interface ArchivedDocumentParams {
  params: Promise<{ kind: string; locale: string }>;
}

export async function generateMetadata({ params }: ArchivedDocumentParams) {
  const { kind } = await params;
  return createLocalizedMarketingMetadata({
    namespace: 'marketingSeo.legal_archive',
    pathname: `/legal/archive/${ARCHIVE_VERSION}/${kind}`,
    indexable: false,
  })({ params });
}

export default async function ArchivedLegalDocumentPage({
  params,
}: ArchivedDocumentParams) {
  const { kind, locale } = await params;
  if (!isArchivedKind(kind)) notFound();
  return <LegalPageLayout config={getArchivedLegalPageConfig(kind, locale)} />;
}
