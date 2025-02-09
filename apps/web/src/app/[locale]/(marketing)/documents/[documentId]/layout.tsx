import { siteConfig } from '@/constants/configs';
import { WorkspaceDocument } from '@/types/db';
import { createAdminClient } from '@/utils/supabase/server';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';

interface Props {
  params: Promise<{
    locale: string;
    documentId: string;
  }>;
}

const getDocument = async (documentId: string) => {
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
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

  return {
    title: {
      default: title,
      template: `%s - ${title}`,
    },
    description,
    openGraph: {
      type: 'article',
      locale,
      url: siteConfig.url,
      title,
      description,
      siteName: siteConfig.name,
      images: [
        {
          url: siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: `${title} - ${siteConfig.name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [siteConfig.ogImage],
      creator: '@tutur3u',
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
