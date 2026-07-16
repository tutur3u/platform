import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceDocument } from '@tuturuuu/types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getMarketingMetadata } from '@/lib/seo/marketing-metadata';

interface Props {
  params: Promise<{
    locale: string;
    documentId: string;
  }>;
}

const getDocument = async (documentId: string) => {
  try {
    const sbAdmin = await createAdminClient();

    const { data, error } = await sbAdmin
      .from('workspace_documents')
      .select('id')
      .eq('id', documentId)
      .eq('is_public', true)
      .single();

    if (error) throw error;
    if (!data) throw new Error('Document not found');

    return data as WorkspaceDocument;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error fetching document:', error.message);
    } else {
      console.error('Error fetching document:', error);
    }
    notFound();
  }
};

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale, documentId } = await params;

  const viTitle = 'Tài liệu';
  const enTitle = 'Document';

  const enDefaultDescription = 'View and share documents easily.';
  const viDefaultDescription = 'Xem và chia sẻ tài liệu dễ dàng.';

  const untitled = locale === 'vi' ? 'Chưa đặt tên' : 'Untitled';
  const defaultDescription =
    locale === 'vi' ? viDefaultDescription : enDefaultDescription;

  const document = await getDocument(documentId);

  const documentTitle = document.name || untitled;
  const description = defaultDescription;

  const title = `${documentTitle} - ${locale === 'vi' ? viTitle : enTitle}`;

  const metadata = getMarketingMetadata(
    {
      title,
      description,
      imageAlt: `${title} - Tuturuuu`,
      pathname: `/documents/${documentId}`,
    },
    locale
  );

  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      type: 'article',
    },
  };
};

export default async function DocumentLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
